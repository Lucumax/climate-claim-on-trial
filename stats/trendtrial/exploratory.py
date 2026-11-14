"""Exploratory gate for Detective mode (STATS_LOG R2-6). Python source of truth; js/trendtrial.js exploratoryGate is the port.

Looks up, in the table shipped from the validation results, whether the Yue-Wang-corrected test Detective uses is calibrated for
a user's series (its length and persistence), and returns a plain caveat string made of fixed templates.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

TABLE = json.loads((Path(__file__).parent / "gate_table.json").read_text(encoding="utf-8"))
GRID = (0.0, 0.1, 0.2, 0.3, 0.45, 0.6)
NS = (23, 25, 45)
LABEL = "your own exploration, not pre-registered"

CAVEATS = {
    "ok": ("Calibration check: for series like yours ({n} points, year-to-year persistence near {phi}), the correction used here "
           "called a trend in {size}% of trendless synthetic series, close to the intended 5%."),
    "size_liberal": ("Caution: for series like yours ({n} points, year-to-year persistence near {phi}), the correction used here "
                     "called a trend in {size}% of trendless synthetic series instead of the intended 5%, so this p-value is "
                     "probably too small."),
    "persistence_above_range": ("Caution: year-to-year persistence in your series ({phi}) is above the range we tested (0.6), so we "
                                "cannot say how reliable this p-value is."),
    "gaps": "Caution: your series has missing years; the calibration checks used complete series.",
    "skewed": ("Caution: your series is strongly lopsided (skewness {skew}); the calibration checks used roughly symmetric noise "
               "and the test was too liberal when the noise was lopsided."),
    "length": "Caution: your series has {n} valid points; the calibration checks cover 20 to 50 points.",
}
CAVEAT_END = " This is your own exploration, not a pre-registered test, and a p-value is not the probability that the trend is real."


def lag1_detrended(x):
    """Lag-1 autocorrelation of the OLS-detrended series (same definition as the pipeline's persistence estimate)."""
    x = np.asarray(x, float)
    if len(x) < 5:
        return 0.0
    tt = np.arange(len(x))
    r = x - np.polyval(np.polyfit(tt, x, 1), tt)
    r = r - r.mean()
    d = float((r * r).sum())
    return float((r[:-1] * r[1:]).sum() / d) if d > 0 else 0.0


def skewness(x):
    x = np.asarray(x, float)
    if len(x) <= 3:
        return 0.0
    m = x - x.mean()
    m2 = float((m * m).mean())
    if m2 <= 0 or math.sqrt(m2) == 0:
        return 0.0
    return float((m ** 3).mean() / m2 ** 1.5)


def exploratory_gate(y):
    """y: the user's series in time order, NaN or None for missing years."""
    arr = np.array([np.nan if v is None else v for v in y], float)
    ok = np.isfinite(arr)
    vals = arr[ok]
    has_gaps = bool((~ok).any())
    n = int(len(vals))
    R = TABLE["rules"]
    phi_hat = lag1_detrended(vals)
    skew = skewness(vals)
    n_gov = min(NS, key=lambda m: (abs(m - n), m))
    above = [p for p in GRID if p >= max(phi_hat, 0.0) - 1e-12]
    phi_gov = above[0] if above else None
    row = next((r for r in TABLE["rows"] if r["n"] == n_gov and r["phi"] == phi_gov), None)
    reasons = []
    if phi_gov is None:
        reasons.append("persistence_above_range")
    elif not row["passes"]:
        reasons.append("size_liberal")
    if has_gaps:
        reasons.append("gaps")
    if abs(skew) > R["skew_max"]:
        reasons.append("skewed")
    if n < R["n_min"] or n > R["n_max"]:
        reasons.append("length")
    fill = dict(n=str(n), phi=f"{phi_hat:.2f}", skew=f"{skew:.2f}", size=f"{100 * row['size']:.1f}" if row else "")
    parts = [CAVEATS[r].format(**fill) for r in reasons] if reasons else [CAVEATS["ok"].format(**fill)]
    return dict(phiHat=phi_hat, skew=skew, nValid=n, hasGaps=has_gaps, nGov=n_gov, phiGov=phi_gov,
                correction=TABLE["correction"], correctionName=TABLE["correction_name"],
                sizeAtBucket=(dict(size=row["size"], se=row["se"], power=row["power"], adaptiveSize=row["adaptive_size"],
                                   adaptiveRelease=row["adaptive_release"]) if row else None),
                calibrated=not reasons, reasons=reasons, caveat=" ".join(parts) + CAVEAT_END, label=LABEL)
