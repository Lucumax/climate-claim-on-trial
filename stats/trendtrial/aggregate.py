"""Anomalies, seasonal aggregation, cos-latitude regional mean with a coverage threshold.

Order of operations (spec 3.1): anomalies are computed per cell and per calendar month
against the cell's own climatology over the claim period BEFORE any spatial or seasonal
aggregation.  A changing set of valid cells or months therefore cannot add a trend
through differences in the cells' mean levels.
"""
from __future__ import annotations

import math

import numpy as np


def is_wrap(months):
    """A season wraps the calendar year if its months, in season order, go from a high month number to a low one."""
    months = list(months)
    return len(months) > 1 and months[0] > months[-1]


def build_cube(values, year, month, years, months):
    """Pick (year, month) slices out of a (T, ny, nx) stack into a (Y, M, ny, nx) cube indexed by season label year.

    months is in season order. For a season that wraps the calendar year (e.g. [12, 1, 2]) the months at or after the
    first month of the season (December) are taken from the PREVIOUS calendar year, and the season is labelled by the
    year of its last months (the Jan-Feb year). The first season is dropped (all NaN) if none of its previous-year
    months exist in the data. Slots that do not exist in the input stay NaN.
    """
    years = list(years)
    months = list(months)
    wrap = is_wrap(months)
    ny, nx = values.shape[1:]
    cube = np.full((len(years), len(months), ny, nx), np.nan, dtype=np.float64)
    yi = {y: i for i, y in enumerate(years)}
    mi = {m: i for i, m in enumerate(months)}
    for k in range(values.shape[0]):
        y, m = int(year[k]), int(month[k])
        if m not in mi:
            continue
        label = y + 1 if (wrap and m >= months[0]) else y
        if label in yi:
            cube[yi[label], mi[m]] = values[k]
    if wrap and len(years):
        carry = [i for i, m in enumerate(months) if m >= months[0]]
        if not np.isfinite(cube[0][carry]).any():
            cube[0] = np.nan
    return cube


def climatology(cube, min_frac=0.6):
    """Per-cell, per-calendar-month mean over years. NaN where fewer than min_frac of years are valid."""
    Y = cube.shape[0]
    cnt = np.isfinite(cube).sum(axis=0)
    with np.errstate(invalid="ignore"):
        clim = np.nanmean(cube, axis=0)
    clim[cnt < math.ceil(min_frac * Y)] = np.nan
    return clim


def block_aggregate(arr, k, min_valid_frac=0.5):
    """Mean over k x k blocks of the last two axes (e.g. 0.05 -> 0.25 degrees with k=5); a block is valid
    if at least min_valid_frac of its cells are valid."""
    *lead, ny, nx = arr.shape
    ny2, nx2 = ny // k, nx // k
    a = arr[..., :ny2 * k, :nx2 * k].reshape(*lead, ny2, k, nx2, k)
    cnt = np.isfinite(a).sum(axis=(-3, -1))
    with np.errstate(invalid="ignore"):
        m = np.nanmean(a, axis=(-3, -1))
    m[cnt < min_valid_frac * k * k] = np.nan
    return m


def cos_weights(lat, nx):
    w = np.cos(np.deg2rad(np.asarray(lat, float)))
    return np.repeat(w[:, None], nx, axis=1)


def regional_monthly(anom, weights, denom_mask, cov_threshold=0.8):
    """anom (Y, M, ny, nx); denom_mask (M, ny, nx) bool: cells that have spatial support and a valid
    climatology in that calendar month.  A region-month is valid only if the fraction of denominator
    cells with a valid anomaly (unweighted count) is at least cov_threshold.

    Returns reg (Y, M), cov_frac (Y, M), cov_area (Y, M) (area-weighted coverage, descriptive).
    """
    Y, M = anom.shape[:2]
    reg = np.full((Y, M), np.nan)
    frac = np.zeros((Y, M))
    farea = np.zeros((Y, M))
    for m in range(M):
        d = denom_mask[m]
        nd = d.sum()
        wd = weights[d].sum()
        for y in range(Y):
            a = anom[y, m]
            ok = d & np.isfinite(a)
            n_ok = ok.sum()
            frac[y, m] = n_ok / nd if nd else 0.0
            farea[y, m] = weights[ok].sum() / wd if wd else 0.0
            if nd and frac[y, m] >= cov_threshold and n_ok > 0:
                reg[y, m] = (weights[ok] * a[ok]).sum() / weights[ok].sum()
    return reg, frac, farea


def season_mean(reg, min_month_frac=2 / 3):
    """Mean over in-season months of the regional anomaly; valid only if enough months are valid.

    Returns series (Y,), n_valid_months (Y,)."""
    Y, M = reg.shape
    nv = np.isfinite(reg).sum(axis=1)
    with np.errstate(invalid="ignore"):
        s = np.nanmean(reg, axis=1)
    s[nv < math.ceil(min_month_frac * M - 1e-9)] = np.nan
    return s, nv


def cell_season_series(cube, clim, min_month_frac=2 / 3):
    """Per-cell seasonal series: (Y, ny, nx) raw seasonal mean and anomaly seasonal mean over the SAME months.

    Months without a valid climatology or value are excluded from both.  A cell-season is valid only if at
    least ceil(min_month_frac * M) months qualify.
    """
    Y, M = cube.shape[:2]
    ok = np.isfinite(cube) & np.isfinite(clim)[None]
    nv = ok.sum(axis=1)
    raw = np.where(ok, cube, 0.0).sum(axis=1)
    an = np.where(ok, cube - clim[None], 0.0).sum(axis=1)
    good = nv >= math.ceil(min_month_frac * M - 1e-9)
    with np.errstate(invalid="ignore", divide="ignore"):
        raw = np.where(good, raw / nv, np.nan)
        an = np.where(good, an / nv, np.nan)
    return raw, an
