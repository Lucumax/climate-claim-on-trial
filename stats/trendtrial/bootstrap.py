"""Residual moving-block bootstrap around the Sen line.

One method serves both the slope interval and the chart band (spec 3.4): the same bootstrap draws
give the percentile interval of the Sen slope and the pointwise percentile band of the Sen line.
Raw trending values are never resampled: only residuals from the fitted Sen line are.

Gaps: residuals are taken from the valid years only; resampled residuals are placed back on the valid
years (compact sequence), so a block can span a gap.  Stated approximation.
"""
from __future__ import annotations

import numpy as np


def sen_batch(Y, t):
    """Sen slope and intercept for every row of Y (R, n) with no NaN; t (n,)."""
    n = Y.shape[1]
    i, j = np.triu_indices(n, 1)
    sl = (Y[:, j] - Y[:, i]) / (t[j] - t[i])
    slope = np.median(sl, axis=1)
    icpt = np.median(Y, axis=1) - slope * np.median(t)
    return slope, icpt


def block_indices(n, block_len, reps, rng):
    L = max(1, min(int(block_len), n))
    nb = -(-n // L)
    starts = rng.integers(0, n - L + 1, size=(reps, nb))
    idx = (starts[:, :, None] + np.arange(L)[None, None, :]).reshape(reps, nb * L)[:, :n]
    return idx


def residual_block_bootstrap(y, t, grid_t=None, block_len=3, reps=2000, level=0.95, seed=1):
    """y with NaN for gap years, t years. Returns dict with slope interval, band on grid_t, and draws summary."""
    y = np.asarray(y, float)
    t = np.asarray(t, float)
    ok = np.isfinite(y)
    yv, tv = y[ok], t[ok]
    n = len(yv)
    if n < 5:
        return None
    rng = np.random.default_rng(seed)
    slope, icpt = sen_batch(yv[None, :], tv)
    slope, icpt = float(slope[0]), float(icpt[0])
    fit = icpt + slope * tv
    res = yv - fit
    idx = block_indices(n, block_len, reps, rng)
    Yb = fit[None, :] + res[idx]
    bs, bi = sen_batch(Yb, tv)
    lo_q, hi_q = (1 - level) / 2 * 100, (1 + level) / 2 * 100
    out = {
        "slope": slope, "intercept": icpt,
        "slope_ci": (float(np.percentile(bs, lo_q)), float(np.percentile(bs, hi_q))),
        "boot_slope_mean": float(bs.mean()),
        "reps": int(reps), "block_len": int(block_len), "n": int(n),
    }
    if grid_t is not None:
        g = np.asarray(grid_t, float)
        lines = bi[:, None] + bs[:, None] * g[None, :]
        out["band_t"] = g
        out["band_center"] = icpt + slope * g
        out["band_lo"] = np.percentile(lines, lo_q, axis=0)
        out["band_hi"] = np.percentile(lines, hi_q, axis=0)
    return out
