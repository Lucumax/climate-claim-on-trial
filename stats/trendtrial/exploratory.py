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
GRID = tuple(sorted({r["phi"] for r in TABLE["rows"]}))      # round 3: includes the negative buckets when the table has them
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
    "gaps": ("Caution: your series is missing {missing} of the {expected} years in its period; the calibration checks used complete "
             "series, and no check of the test with missing years passed, so this p-value is not calibrated."),
    "skewed": ("Caution: your series is strongly lopsided (skewness {skew}), beyond the range we treat as calibrated. {skewdetail}"),
    "length": "Caution: your series has {n} valid points; the calibration checks cover 20 to 50 points.",
}
SKEW_DETAIL = {
    "liberal": ("In simulations with lopsided noise at {n} points and year-to-year persistence near {phi}, the correction used here called a "
                "trend in {skewsize}% of trendless synthetic series instead of the intended 5% ({size}% with symmetric noise at the same setting)."),
    "ok": ("In simulations with lopsided noise at {n} points and year-to-year persistence near {phi}, the correction used here called a "
           "trend in {skewsize}% of trendless synthetic series (intended 5%; {size}% with symmetric noise), so lopsidedness alone did not "
           "break it at this setting; your series is still outside the range that was checked."),
    "none": "No simulation with lopsided noise matched this length and persistence.",
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


def count_missing_years(t, vals_ok, period=None):
    """R3-3. Years missing from the requested period, counted against the year axis, not against the supplied array.
    t: year of each entry (annual series have integer steps), vals_ok: bool per entry (a finite value present).
    Returns (n_expected, missing). A series whose valid years are not on an annual grid (non-integer steps) falls back to counting
    the NaN entries only."""
    t = np.asarray(t, float)
    ok = np.asarray(vals_ok, bool) & np.isfinite(t)
    tv = np.sort(t[ok])
    n_valid = int(len(tv))
    annual = n_valid >= 2 and bool(np.all(np.abs(np.diff(tv) - np.round(np.diff(tv))) < 1e-6)) and bool(np.all(np.diff(tv) > 0.5))
    if not annual:
        n_exp = int(len(t))
        return n_exp, int(n_exp - n_valid)
    if period is not None:
        lo, hi = float(period[0]), float(period[1])
        n_in = int(np.sum((tv >= lo - 1e-9) & (tv <= hi + 1e-9)))
    else:
        tf = t[np.isfinite(t)]
        lo, hi = float(tf.min()), float(tf.max())
        n_in = n_valid
    n_exp = int(round(hi - lo)) + 1
    return n_exp, max(0, n_exp - n_in)


def governing_buckets(grid, phi_hat):
    """Same rule as the claim gate (R3-1): phi_hat >= 0, or a table without negative buckets, uses the smallest tested phi not below
    max(phi_hat, 0); a negative phi_hat is bracketed by the two tested values around it. Primary (nearest) first."""
    grid = sorted(grid)
    if phi_hat >= 0 or not any(p < 0 for p in grid):
        above = [p for p in grid if p >= max(phi_hat, 0.0) - 1e-12]
        return [above[0]] if above else []
    lower = [p for p in grid if p <= phi_hat + 1e-12]
    upper = [p for p in grid if p >= phi_hat - 1e-12]
    govs = sorted({x for x in ((max(lower) if lower else None), (min(upper) if upper else None)) if x is not None})
    primary = min(govs, key=lambda p: (abs(p - phi_hat), abs(p)))
    return [primary] + [g for g in govs if g != primary]


def exploratory_gate(y, t=None, period=None):
    """y: the user's series in time order, NaN or None for missing years. t: the year of each entry (default 0..n-1). period: optional
    [first_year, last_year] the user asked for, so years absent at either end are counted too (R3-3)."""
    arr = np.array([np.nan if v is None else v for v in y], float)
    tt = np.arange(len(arr), dtype=float) if t is None else np.array([np.nan if v is None else v for v in t], float)
    ok = np.isfinite(arr)
    vals = arr[ok]
    n_expected, missing = count_missing_years(tt, ok, period)
    has_gaps = bool((~ok).any()) or missing > 0
    n = int(len(vals))
    R = TABLE["rules"]
    phi_hat = lag1_detrended(vals)
    skew = skewness(vals)
    n_gov = min(NS, key=lambda m: (abs(m - n), m))
    govs = governing_buckets(GRID, phi_hat)
    phi_gov = govs[0] if govs else None
    rows = [next((r for r in TABLE["rows"] if r["n"] == n_gov and r["phi"] == g), None) for g in govs]
    rows = [r for r in rows if r]
    row = rows[0] if rows else None
    show = max(rows, key=lambda r: r["size"]) if rows else None       # the worst bracketing row is the one quoted
    reasons = []
    if phi_gov is None:
        reasons.append("persistence_above_range")
    elif not rows or not all(r["passes"] for r in rows):
        reasons.append("size_liberal")
    if has_gaps:
        reasons.append("gaps")
    if abs(skew) > R["skew_max"]:
        reasons.append("skewed")
    if n < R["n_min"] or n > R["n_max"]:
        reasons.append("length")
    sk_rows = [r for r in rows if r.get("skewed_size") is not None]
    if sk_rows:
        sk = max(sk_rows, key=lambda r: r["skewed_size"])
        kind = "ok" if all(r.get("skewed_passes") for r in sk_rows) else "liberal"
        skewdetail = SKEW_DETAIL[kind].format(n=str(n_gov), phi=f"{sk['phi']:g}", skewsize=f"{100 * sk['skewed_size']:.1f}", size=f"{100 * sk['size']:.1f}")
    else:
        skewdetail = SKEW_DETAIL["none"]
    fill = dict(n=str(n), phi=f"{phi_hat:.2f}", skew=f"{skew:.2f}", skewdetail=skewdetail, size=f"{100 * show['size']:.1f}" if show else "",
                missing=str(max(missing, int((~ok).sum()))), expected=str(n_expected))
    parts = [CAVEATS[r].format(**fill) for r in reasons] if reasons else [CAVEATS["ok"].format(**fill)]
    return dict(phiHat=phi_hat, skew=skew, nValid=n, hasGaps=has_gaps, missingYears=max(missing, int((~ok).sum())), nExpected=n_expected,
                nGov=n_gov, phiGov=phi_gov, phiBuckets=govs,
                correction=TABLE["correction"], correctionName=TABLE["correction_name"],
                sizeAtBucket=(dict(size=row["size"], se=row["se"], power=row["power"], adaptiveSize=row.get("adaptive_size"),
                                   adaptiveRelease=row.get("adaptive_release")) if row else None),
                calibrated=not reasons, reasons=reasons, caveat=" ".join(parts) + CAVEAT_END, label=LABEL)
