"""Synthetic generators: noise fields, series, and a synthetic claim folder (for tests, fixture, timing)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter


def ar1_series(R, n, phi, rng, noise="normal", burn=30):
    """R independent AR(1) series of length n with unit marginal variance. noise: normal | skewed."""
    total = n + burn
    if noise == "skewed":
        e = rng.exponential(1.0, size=(R, total)) - 1.0       # mean 0, sd 1, skew 2
    else:
        e = rng.standard_normal((R, total))
    x = np.empty((R, total))
    x[:, 0] = e[:, 0]
    s = np.sqrt(1 - phi ** 2)
    for k in range(1, total):
        x[:, k] = phi * x[:, k - 1] + s * e[:, k]
    return x[:, burn:]


def ar1_fields(R, n, ny, nx, phi, rng, sigma=2.0, burn=30):
    """R fields (R, n, ny, nx): AR(1) in time (unit variance), spatially smoothed innovations (correlated cells)."""
    total = n + burn
    out = np.empty((R, n, ny, nx))
    # normalise the smoothing so unit variance
    probe = gaussian_filter(rng.standard_normal((200, ny, nx)), sigma=(0, sigma, sigma), mode="wrap")
    sd = probe.std()
    s = np.sqrt(1 - phi ** 2)
    x = gaussian_filter(rng.standard_normal((R, ny, nx)), sigma=(0, sigma, sigma), mode="wrap") / sd
    for k in range(1, total):
        e = gaussian_filter(rng.standard_normal((R, ny, nx)), sigma=(0, sigma, sigma), mode="wrap") / sd
        x = phi * x + s * e
        if k >= burn:
            out[:, k - burn] = x
    return out


def make_claim_folder(path, ny=20, nx=30, years=(2001, 2025), months=(6, 7, 8), lat0=30.0, dlat=0.25,
                      lon0=-90.0, dlon=0.25, trend_per_decade=0.4, frac_trend=0.6, phi=0.3, sigma=1.0,
                      miss_cell_month=0.03, coverage_decline=0.0, seed=7, claim_id="SYN", direction="increase",
                      region_name="a synthetic region", variable="summer daytime land surface temperature",
                      units="K"):
    """Write claim.json and monthly.npz for a synthetic field (NOT real data)."""
    rng = np.random.default_rng(seed)
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    yrs = list(range(years[0], years[1] + 1))
    n = len(yrs)
    lat = lat0 + dlat * np.arange(ny)
    lon = lon0 + dlon * np.arange(nx)
    base = 300 + 0.5 * (lat[:, None] - lat0) + 0.1 * (lon[None, :] - lon0)
    cyc = {m: 2.0 * np.sin((m - 3) / 12 * 2 * np.pi) for m in months}
    noise = ar1_fields(1, n * len(months), ny, nx, phi, rng, sigma=2.0)[0].reshape(n, len(months), ny, nx)
    # true trend only in part of the field
    sm = gaussian_filter(rng.standard_normal((ny, nx)), 3)
    mask = sm > np.quantile(sm, 1 - frac_trend)
    tr = trend_per_decade / 10.0
    vals, ys, ms = [], [], []
    for iy, y in enumerate(yrs):
        for im, m in enumerate(months):
            f = base + cyc[m] + sigma * noise[iy, im] + tr * (y - yrs[0]) * mask
            miss = rng.random((ny, nx)) < miss_cell_month
            if coverage_decline > 0:
                # cells in the warm (north-east) part drop out more often late in the record
                p_drop = coverage_decline * (iy / (n - 1)) * (base > np.median(base))
                miss |= rng.random((ny, nx)) < p_drop
            f = np.where(miss, np.nan, f)
            vals.append(f.astype(np.float32))
            ys.append(y)
            ms.append(m)
    np.savez_compressed(path / "monthly.npz", values=np.array(vals), lat=lat, lon=lon, year=np.array(ys),
                        month=np.array(ms), support=np.ones((ny, nx), bool))
    claim = dict(claim_id=claim_id, claim_text="SYNTHETIC claim for testing: " + variable + " has risen",
                 variable=variable, variable_plain=variable, units=units, direction=direction,
                 season_months=list(months), period=[years[0], years[1]], region_name=region_name,
                 region_box=dict(lat_min=float(lat.min()), lat_max=float(lat.max()),
                                 lon_min=float(lon.min()), lon_max=float(lon.max())),
                 product=dict(name="SYNTHETIC (not NASA data)", version="n/a", doi="n/a"),
                 is_model_data=False, synthetic=True)
    (path / "claim.json").write_text(json.dumps(claim, indent=1), encoding="utf-8")
    return path
