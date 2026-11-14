"""G-Cov style tests: changing coverage or the mix of months alone cannot manufacture a regional trend."""
import numpy as np
import pytest

from trendtrial.aggregate import (cell_season_series, climatology, cos_weights, regional_monthly, season_mean)
from trendtrial.pipeline import DEFAULT_PARAMS, regional_analysis
from trendtrial.trend import mk_core

YEARS = list(range(2001, 2026))
T = np.array(YEARS, float)


def base_cube(seed=0, ny=12, nx=16, months=(6, 7, 8), noise=0.05, gradient=6.0, amp=10.0):
    rng = np.random.default_rng(seed)
    lat = 30 + 0.5 * np.arange(ny)
    grad = gradient * (np.arange(ny)[:, None] / ny) * np.ones((1, nx))      # strong spatial gradient in the mean
    cyc = {m: amp * np.sin((m - 3) / 12 * 2 * np.pi) for m in months}
    cube = np.empty((len(YEARS), len(months), ny, nx))
    for iy in range(len(YEARS)):
        for im, m in enumerate(months):
            cube[iy, im] = 300 + grad + cyc[m] + noise * rng.standard_normal((ny, nx))
    return cube, lat


def run_regional(cube, lat, **kw):
    P = dict(DEFAULT_PARAMS, boot_reps=200)
    P.update(kw)
    clim = climatology(cube, P["min_clim_frac"])
    w = cos_weights(lat, cube.shape[-1])
    sup = np.ones(cube.shape[-2:], bool)
    return regional_analysis(cube, clim, w, sup, lat, YEARS, list(range(cube.shape[1])), P)


def test_dropout_of_warm_cells_creates_trend_in_raw_mean_but_not_in_anomaly_mean():
    cube, lat = base_cube()
    ny = cube.shape[2]
    rng = np.random.default_rng(1)
    warm = np.arange(ny)[:, None] >= ny // 2           # northern half is the warm half (gradient rises with row)
    for iy in range(len(YEARS)):
        p_drop = 0.20 * iy / (len(YEARS) - 1)           # up to 20 percent of warm cells missing late in the record
        drop = (rng.random(cube.shape[2:]) < p_drop) & warm
        cube[iy][:, drop] = np.nan
    w = cos_weights(lat, cube.shape[-1])
    # naive: area-weighted mean of the RAW valid values, seasonal mean per year
    naive = []
    for iy in range(len(YEARS)):
        ms = []
        for im in range(cube.shape[1]):
            f = cube[iy, im]; ok = np.isfinite(f)
            ms.append((w[ok] * f[ok]).sum() / w[ok].sum())
        naive.append(np.mean(ms))
    nv = mk_core(np.array(naive)[None], T, hr=False)
    assert nv["p"][0] < 0.001 and nv["slope"][0] < 0     # spurious cooling from losing warm cells
    R = run_regional(cube, lat)
    assert R["n"] == len(YEARS)                          # coverage stays above the 80% threshold
    p = R["mk"]["p"][0]
    slope_dec = R["mk"]["slope"][0] * 10
    assert p > 0.05
    assert abs(slope_dec) < 0.05 and abs(nv["slope"][0] * 10) > 5 * abs(slope_dec)


def test_changing_month_mix_does_not_create_a_trend():
    cube, lat = base_cube(months=(6, 7, 8), amp=10.0)
    # August (the warm month) is missing everywhere for the last 10 years: the seasonal mean would drop if raw values were averaged
    cube[-10:, 2] = np.nan
    naive = np.array([np.nanmean(cube[iy].mean(axis=(1, 2))) for iy in range(len(YEARS))])
    nv = mk_core(naive[None], T, hr=False)
    assert nv["p"][0] < 0.001
    R = run_regional(cube, lat)
    assert R["n"] == len(YEARS)                          # 2 of 3 months is allowed
    assert R["mk"]["p"][0] > 0.05
    assert abs(R["mk"]["slope"][0] * 10) < 0.05


def test_cell_level_seasonal_mix_rung2_fixes_missing_month_artifact():
    cube, lat = base_cube(ny=6, nx=6)
    cube[-10:, 2] = np.nan                               # a month missing in later years at every cell
    clim = climatology(cube, 0.6)
    raw, an = cell_season_series(cube, clim, 2 / 3)
    Xr = raw.reshape(len(YEARS), -1).T
    Xa = an.reshape(len(YEARS), -1).T
    pr = mk_core(Xr, T, hr=False)["p"]
    pa = mk_core(Xa, T, hr=False)["p"]
    assert (pr < 0.05).all() and (pa > 0.05).mean() > 0.9


def test_rung2_is_a_noop_with_complete_months():
    cube, lat = base_cube(ny=6, nx=6, noise=0.5)
    clim = climatology(cube, 0.6)
    raw, an = cell_season_series(cube, clim, 2 / 3)
    Xr = raw.reshape(len(YEARS), -1).T
    Xa = an.reshape(len(YEARS), -1).T
    a = mk_core(Xr, T, hr=False)
    b = mk_core(Xa, T, hr=False)
    assert np.allclose(a["p"], b["p"], atol=1e-12) and np.allclose(a["slope"], b["slope"], atol=1e-9)


def test_coverage_threshold_drops_months_and_years():
    cube, lat = base_cube()
    ny, nx = cube.shape[2:]
    # in 2010 only 70 percent of cells have data in every month
    mask = np.random.default_rng(5).random((ny, nx)) < 0.30
    cube[YEARS.index(2010)][:, mask] = np.nan
    R80 = run_regional(cube, lat, cov_threshold=0.8)
    R60 = run_regional(cube, lat, cov_threshold=0.6)
    assert not np.isfinite(R80["series"][YEARS.index(2010)])
    assert np.isfinite(R60["series"][YEARS.index(2010)])
    assert R80["frac"][YEARS.index(2010)].max() < 0.8


def test_weights_are_cos_latitude():
    lat = np.array([0.0, 60.0])
    w = cos_weights(lat, 2)
    assert np.allclose(w[:, 0], [1.0, 0.5])
    anom = np.zeros((1, 1, 2, 2)); anom[0, 0, 0] = 1.0; anom[0, 0, 1] = 4.0
    reg, frac, _ = regional_monthly(anom, w, np.ones((1, 2, 2), bool), 0.8)
    assert reg[0, 0] == pytest.approx((1 * 1 + 0.5 * 4) / 1.5)


def test_season_mean_requires_enough_months():
    reg = np.array([[1.0, 2.0, 3.0], [1.0, np.nan, np.nan], [1.0, 2.0, np.nan]])
    s, nv = season_mean(reg, 2 / 3)
    assert np.isnan(s[1]) and s[2] == pytest.approx(1.5) and s[0] == pytest.approx(2.0)
