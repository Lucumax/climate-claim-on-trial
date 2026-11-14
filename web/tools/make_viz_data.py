#!/usr/bin/env python3
"""make_viz_data.py: export small, display-ready files for the visual modules in web/js/viz/ (lab page only).

Run (read-only on data/, writes only web/data/viz/):
    stats\\.venv\\Scripts\\python.exe -I web/tools/make_viz_data.py

For each case with data/<claim>/monthly.npz it writes web/data/viz/<claim>.json holding
  - cells: centre lat/lon of every cell kept, a land flag, and per-year season anomalies (flat per year, null = missing);
  - regional: area-weighted (cos latitude) season anomaly per year, on the native grid (for the stripes);
  - monthly: area-weighted regional anomaly for every month of the season (for the spiral);
  - baseline, units, product label, a symmetric color range and the palette orientation.
It never changes any claim result: no trend or test is computed here, only descriptive anomalies.

CHOICES (recorded in each file under "choices"):
  Baseline: the case's OWN full period (claim.period), per cell: anomaly = season mean of that year minus the mean of that
    cell's season means over all valid years. For months (spiral): minus that calendar month's mean over the same period.
    (stats/SCHEMA.md uses per-calendar-month climatology over the claim period too, so the baselines agree in spirit.)
  Season value of a cell: mean of the season months, needing at least ceil(2/3 * months) valid months (SCHEMA rule).
  Cell kept: at least 60 percent of years valid (SCHEMA min_clim_frac); inside the support mask if the case has one.
  Aggregation: grids with native step finer than 0.25 degrees are block-averaged to about 0.5 degrees (C-B: 0.1 -> 0.5,
    k = 5, needing 50 percent valid sub-cells) so each file stays small. Regional series use the native grid (no aggregation).
  Regional mean: cos(latitude) weights, native valid cells, season needs at least 80 percent of support cells valid
    (monthly: 50 percent), else null.
  Colour range: symmetric, 98th percentile of |cell anomaly| over all cells and years, rounded up to a round number.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "web" / "data" / "viz"

SHORT = {
    "C-A": {"product_label": "MODIS Terra MOD11C3 v061, daytime land surface temperature, 0.25° cells",
            "measure": "Summer daytime land surface temperature", "palette": "warm_up"},
    "C-B": {"product_label": "GPM IMERG Final V07 monthly rainfall, 0.5° cells (block mean of 0.1°)",
            "measure": "Wet-season rainfall", "palette": "wet_up"},
    "C-C": {"product_label": "MERRA-2 2 m air temperature via NASA POWER (model output), 0.5° × 0.625° cells",
            "measure": "Yearly average air temperature", "palette": "warm_up"},
    "C-D": {"product_label": "MODIS Aqua aerosol optical depth, Wisconsin", "measure": "Summer aerosol optical depth", "palette": "warm_up"},
    "C-E1": {"product_label": "OMI/Aura OMNO2d tropospheric NO₂ column, cloud-screened, 0.25° cells", "measure": "Annual tropospheric NO₂ column", "palette": "warm_up"},
    "C-E2": {"product_label": "OMI/Aura OMNO2d tropospheric NO₂ column, cloud-screened, 0.25° cells", "measure": "Annual tropospheric NO₂ column", "palette": "warm_up"},
}
MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def block_mean(a, k, min_frac=0.5):
    """a: (T, ny, nx) -> (T, ny//k, nx//k), NaN-aware, needs min_frac valid sub-cells."""
    T, ny, nx = a.shape
    ny2, nx2 = ny // k, nx // k
    b = a[:, :ny2 * k, :nx2 * k].reshape(T, ny2, k, nx2, k)
    cnt = np.sum(~np.isnan(b), axis=(2, 4))
    s = np.nansum(b, axis=(2, 4))
    with np.errstate(invalid="ignore", divide="ignore"):
        m = s / cnt
    m[cnt < min_frac * k * k] = np.nan
    return m


def block_axis(x, k):
    n = len(x) // k
    return x[:n * k].reshape(n, k).mean(axis=1)


def season_means(vals, years, months, season, min_months):
    """vals (T, ny, nx) -> (Y, ny, nx) season mean per calendar year; NaN when fewer than min_months valid."""
    uy = sorted(set(int(y) for y in years))
    out = np.full((len(uy),) + vals.shape[1:], np.nan, dtype="float64")
    for i, y in enumerate(uy):
        sel = (years == y) & np.isin(months, season)
        if not sel.any():
            continue
        chunk = vals[sel].astype("float64")
        cnt = np.sum(~np.isnan(chunk), axis=0)
        with np.errstate(invalid="ignore"):
            m = np.nanmean(chunk, axis=0)
        m[cnt < min_months] = np.nan
        out[i] = m
    return uy, out


def anomalies(sm, min_frac=0.6):
    """sm (Y, ny, nx) -> anomaly vs per-cell mean of valid years; cells with too few valid years become all NaN."""
    cnt = np.sum(~np.isnan(sm), axis=0)
    with np.errstate(invalid="ignore"):
        base = np.nanmean(sm, axis=0)
    base[cnt < min_frac * sm.shape[0]] = np.nan
    return sm - base[None], base


def wmean(field, lat, mask, min_frac):
    """Area-weighted mean over cells in mask (ny,nx) of field (ny,nx) with NaN skipped; None if too few."""
    w = np.cos(np.deg2rad(lat))[:, None] * np.ones((1, field.shape[1]))
    ok = mask & ~np.isnan(field)
    if mask.sum() == 0 or ok.sum() < min_frac * mask.sum():
        return None
    return float(np.sum(field[ok] * w[ok]) / np.sum(w[ok]))


def nice_up(x):
    for v in (0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if x <= v + 1e-9:
            return v
    return round(x, 1)


def rnd(v, d):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), d)


def export(case):
    d = DATA / case
    npz = d / "monthly.npz"
    if not npz.exists() or not (d / "claim.json").exists():
        print(f"{case}: skipped (no monthly.npz yet)")
        return None
    claim = json.loads((d / "claim.json").read_text(encoding="utf-8"))
    z = np.load(npz)
    vals, lat, lon, years, months = z["values"], z["lat"], z["lon"], z["year"], z["month"]
    support = z["support"].astype(bool) if "support" in z.files else np.ones((len(lat), len(lon)), dtype=bool)
    season = claim["season_months"]
    min_months = math.ceil(2 / 3 * len(season))
    dlat0 = float(np.median(np.abs(np.diff(lat))))
    dlon0 = float(np.median(np.abs(np.diff(lon))))
    meta = SHORT.get(case, {})
    units = claim["units"]
    dec = 3 if units == "mm/day" else 2
    p0, p1 = claim["period"]

    # ---- regional series and monthly anomalies on the native grid (no aggregation)
    uy, sm_nat = season_means(vals, years, months, season, min_months)
    an_nat, base_nat = anomalies(sm_nat)
    reg_ok = support & ~np.isnan(base_nat)
    regional = [wmean(an_nat[i], lat, reg_ok, 0.8) for i in range(len(uy))]
    base_reg = wmean(base_nat, lat, reg_ok, 0.5)

    # monthly anomalies per calendar month in season order
    mon = []
    mon_years = list(uy)
    clim = {}
    for m in season:
        sel = months == m
        cnt = np.sum(~np.isnan(vals[sel]), axis=0)
        with np.errstate(invalid="ignore"):
            c = np.nanmean(vals[sel].astype("float64"), axis=0)
        c[cnt < 0.6 * sel.sum()] = np.nan
        clim[m] = c
    for y in uy:
        row = []
        for m in season:
            sel = (years == y) & (months == m)
            if not sel.any():
                row.append(None)
                continue
            f = vals[sel][0].astype("float64") - clim[m]
            row.append(rnd(wmean(f, lat, reg_ok, 0.5), dec))
        mon.append(row)

    # ---- cell grid for the globe, map and distribution
    k = 1
    if dlat0 < 0.25 - 1e-9 and dlon0 < 0.25 - 1e-9:
        k = int(round(0.5 / dlat0))
    if k > 1:
        v2 = block_mean(vals.astype("float64"), k)
        lat2, lon2 = block_axis(lat, k), block_axis(lon, k)
        sup2 = block_mean(support[None].astype("float64"), k, 0.5)[0] > 0.5
    else:
        v2, lat2, lon2, sup2 = vals.astype("float64"), lat, lon, support
    uy2, sm2 = season_means(v2, years, months, season, min_months)
    an2, base2 = anomalies(sm2)
    keep = sup2 & ~np.isnan(base2)
    ij = np.argwhere(keep)
    cl = [float(lat2[i]) for i, j in ij]
    cn = [float(lon2[j]) for i, j in ij]
    A = an2[:, ij[:, 0], ij[:, 1]]
    absmax = float(np.nanpercentile(np.abs(A), 98))
    smax = nice_up(absmax)
    dlat = float(np.median(np.abs(np.diff(lat2)))) if len(lat2) > 1 else dlat0
    dlon = float(np.median(np.abs(np.diff(lon2)))) if len(lon2) > 1 else dlon0
    box = claim["region_box"]
    out = {
        "schema": "viz-1.0",
        "claim_id": case,
        "claim_text": claim["claim_text"],
        "measure": meta.get("measure", claim["variable_plain"]),
        "variable_plain": claim["variable_plain"],
        "region_name": claim["region_name"],
        "region_box": {"s": box["lat_min"], "n": box["lat_max"], "w": box["lon_min"], "e": box["lon_max"]},
        "units": units,
        "units_label": units.replace("degC", "°C").replace("1e15 molecules/cm2", "×10¹⁵ molecules/cm²"),
        "palette": meta.get("palette", "warm_up"),
        "product": claim["product"]["name"],
        "product_label": meta.get("product_label", claim["product"]["name"]),
        "is_model_data": bool(claim.get("is_model_data", False)),
        "season_months": season,
        "season_labels": [MONTH[m - 1] for m in season],
        "season_text": ("all twelve months" if len(season) == 12 else
                        f"{MONTH[season[0] - 1]} to {MONTH[season[-1] - 1]}"),
        "years": [int(y) for y in uy2],
        "baseline": {"years": [p0, p1], "text": f"mean of each cell's {p0}–{p1} season averages",
                     "regional_mean_abs": rnd(base_reg, dec)},
        "scale": {"max": smax, "p98_abs": rnd(absmax, 4)},
        "grid": {"dlat": dlat, "dlon": dlon, "native_dlat": dlat0, "native_dlon": dlon0, "block_k": k,
                 "n_cells": int(len(cl)), "n_native_cells": int(support.sum())},
        "cells": {
            "lat": [round(v, 4) for v in cl],
            "lon": [round(v, 4) for v in cn],
            "land": [1] * len(cl),
            "anom": [[rnd(v, dec) for v in A[i]] for i in range(A.shape[0])],
        },
        "regional": {"years": [int(y) for y in uy], "anomaly": [rnd(v, dec) for v in regional]},
        "monthly": {"years": [int(y) for y in mon_years], "months": season, "labels": [MONTH[m - 1] for m in season],
                    "anomaly": mon},
        "choices": {
            "baseline": f"Each cell's own full-period mean ({p0}–{p1}); months use that calendar month's mean over the same years.",
            "season_rule": f"Season mean needs at least {min_months} of {len(season)} valid months.",
            "cell_rule": "Cells kept if at least 60% of years are valid and inside the support mask (if the case has one).",
            "aggregation": (f"Native {dlat0:g}° cells block-averaged by {k} (needs 50% valid sub-cells) to {dlat:g}° for display."
                            if k > 1 else f"No aggregation: cells shown at the case grid ({dlat:g}° × {dlon:g}°)."),
            "regional": "Area-weighted (cos latitude), native grid, season needs 80% of support cells valid; months 50%.",
            "scale": "Symmetric about zero; 98th percentile of |cell anomaly| rounded up. Values beyond are drawn at the end color.",
            "land_mask": ("support mask from the case data (land cells only)" if "support" in z.files
                          else "none: every cell of the case grid is drawn"),
            "claims": "Descriptive display only. No trend, test or verdict is computed or altered here.",
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{case}.json"
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    size = path.stat().st_size
    print(f"{case}: {len(cl)} cells x {len(uy2)} years, k={k}, scale +/-{smax} {units}, {size / 1024:.0f} KB")
    if size > 1.5e6:
        print("  WARNING: over 1.5 MB")
    return {"case": case, "bytes": size}


if __name__ == "__main__":
    cases = sys.argv[1:] or ["C-A", "C-B", "C-C", "C-D", "C-E1", "C-E2"]
    old = OUT / "index.json"
    index = json.loads(old.read_text(encoding="utf-8"))["cases"] if old.exists() else []   # a partial run keeps the other cases listed
    for c in cases:
        r = export(c)
        if r and c not in index:
            index.append(c)
    (OUT / "index.json").write_text(json.dumps({"cases": index}), encoding="utf-8")
