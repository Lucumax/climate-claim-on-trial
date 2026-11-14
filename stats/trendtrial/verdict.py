"""Verdict selection and fixed sentence templates (no free text).

Branches are mutually exclusive by written precedence (first match wins):
  1 withheld          a gate failed (coverage, regional calibration)
  2 contradicted      regional p < alpha and the slope is opposite to the claimed direction
  3 supported         regional p < alpha in the claimed direction, interval excludes 0 (when enabled),
                      and rung-4 in-direction flagged area >= breadth_min (when the cell map is available)
  4 partly_supported  regional p < alpha in direction but (interval includes 0 or breadth below breadth_min);
                      OR regional not significant but rung-4 in-direction flagged area >= local_min
  5 not_supported     everything else
Templates never say a nonsignificant result is unpublishable, and never imply a cause or a forecast.
"""
from __future__ import annotations

BREADTH_MIN = 0.25
LOCAL_MIN = 0.05
ALPHA = 0.05

NOTE_NOT_SIG = ("A p-value above 0.05 does not mean there is no trend or that it is unimportant, "
                "and a longer record can help. A result that does not reach significance is still "
                "a result worth reporting.")
NOTE_SCOPE = "This describes the data over this period; it does not say why it changed or what comes next."

TEMPLATES = {
    "withheld": (
        "No verdict is given for this claim. The checks that the verdict depends on did not pass: "
        "{withheld_reasons}. The numbers are shown for reading, but they are not a basis for a verdict."
    ),
    "contradicted": (
        "The data point the other way. For {region}, {season}, {period}, the {variable} "
        "{opposite_past} by {abs_slope} {units} per decade ({ci_text}; "
        "Mann-Kendall with autocorrelation correction, p = {p}). That is statistically significant "
        "at the 0.05 level and opposite to the claim. " + NOTE_SCOPE
    ),
    "supported": (
        "The data support the claim. For {region}, {season}, {period}, the {variable} {direction_past} "
        "by {abs_slope} {units} per decade ({ci_text}; Mann-Kendall with "
        "autocorrelation correction, p = {p}), which is statistically significant at the 0.05 level. "
        "{breadth_clause} " + NOTE_SCOPE
    ),
    "partly_regional_narrow": (
        "The data partly support the claim. For {region}, {season}, {period}, the regional average "
        "{direction_past} by {abs_slope} {units} per decade (p = {p}, significant at the 0.05 level), "
        "but {narrow_clause}. " + NOTE_SCOPE
    ),
    "partly_local_only": (
        "The data partly support the claim. The regional average for {region}, {season}, {period} "
        "changed by {signed_slope} {units} per decade ({ci_text}; p = {p}), which is not "
        "statistically significant at the 0.05 level, but {local_clause}. " + NOTE_NOT_SIG + " " + NOTE_SCOPE
    ),
    "not_supported": (
        "This data does not support the claim for {region}, {season}, {period}. The estimated change in "
        "the {variable} is {signed_slope} {units} per decade ({ci_text}; p = {p}), "
        "which is not statistically significant at the 0.05 level. " + NOTE_NOT_SIG + " " + NOTE_SCOPE
    ),
}

# Detective mode (series level, no map, no bootstrap): the challenge author's plain framing.
DETECTIVE_TEMPLATES = {
    "significant_up": (
        "The trend is statistically significant (p = {p}, below 0.05): the series rises by about "
        "{abs_slope} {units} per decade. Significant means the rise is unlikely to be chance alone; it "
        "does not say why it rose or what comes next."
    ),
    "significant_down": (
        "The trend is statistically significant (p = {p}, below 0.05): the series falls by about "
        "{abs_slope} {units} per decade. Significant means the fall is unlikely to be chance alone; it "
        "does not say why it fell or what comes next."
    ),
    "not_significant": (
        "The trend is not statistically significant (p = {p}, above 0.05). A p-value above 0.05 does not "
        "mean there is no trend or that it is unimportant, and a longer series can help."
    ),
    "too_short": (
        "There are too few valid points ({n}) to test a trend. Choose a longer period or a wider region."
    ),
}


def _fmt(x, nd=3):
    if x is None:
        return "n/a"
    ax = abs(x)
    if ax != 0 and (ax < 0.001 or ax >= 1e5):
        return f"{x:.2e}"
    return f"{x:.{nd}g}"


def _fmt_p(p):
    if p is None:
        return "n/a"
    if p < 0.001:
        return "< 0.001"
    return f"{p:.3f}"


def decide(inp):
    """inp keys: withheld_reasons (list), p, slope, ci (lo, hi) or None, direction ('increase'|'decrease'),
    breadth_in_dir (float or None), breadth_available (bool), interval_enabled (bool).
    Returns (verdict_id, branch_id, trace list)."""
    trace = []
    if inp.get("withheld_reasons"):
        trace.append("1 withheld: gate failed")
        return "withheld", "withheld", trace
    trace.append("1 withheld: no")
    p, slope = inp["p"], inp["slope"]
    sgn = 1 if inp["direction"] == "increase" else -1
    sig = p is not None and p < ALPHA
    in_dir = slope is not None and slope * sgn > 0
    opp = slope is not None and slope * sgn < 0
    if sig and opp:
        trace.append("2 contradicted: yes (p < 0.05, opposite direction)")
        return "contradicted", "contradicted", trace
    trace.append("2 contradicted: no")
    ci = inp.get("ci")
    # the interval must be enabled by its calibration check and exclude zero in the claimed direction
    ci_ok = bool(inp.get("interval_enabled", True) and ci is not None and ci[0] * sgn > 0 and ci[1] * sgn > 0)
    avail = inp.get("breadth_available", False)
    b = inp.get("breadth_in_dir") or 0.0
    breadth_ok = (b >= BREADTH_MIN) if avail else True
    if sig and in_dir and ci_ok and breadth_ok:
        trace.append("3 supported: yes")
        return "supported", "supported", trace
    trace.append("3 supported: no")
    if sig and in_dir:
        trace.append("4 partly: yes (significant but interval includes 0 or breadth below minimum)")
        return "partly_supported", "partly_regional_narrow", trace
    if (not sig) and avail and b >= LOCAL_MIN:
        trace.append("4 partly: yes (not significant regionally, local flagged area at or above minimum)")
        return "partly_supported", "partly_local_only", trace
    trace.append("4 partly: no")
    trace.append("5 not_supported: yes")
    return "not_supported", "not_supported", trace


def render(branch_id, slots):
    """Fill the fixed template. slots must contain what the template names; raises KeyError otherwise."""
    return TEMPLATES[branch_id].format(**slots)


def build_slots(claim, inp):
    """Format numbers for the templates. claim: dict with region_name, season_label, period_label, variable, units, direction."""
    sgn = 1 if claim["direction"] == "increase" else -1
    inc, dec = "increased", "decreased"
    dp, op = (inc, dec) if sgn > 0 else (dec, inc)
    slope = inp["slope"]
    ci = inp.get("ci")
    ci_text = (f"interval {_fmt(ci[0])} to {_fmt(ci[1])}" if ci is not None
               else "interval not shown: it did not pass its calibration check")
    interval_off = ci is None
    b = inp.get("breadth_in_dir")
    avail = inp.get("breadth_available", False)
    if avail:
        pct = f"{100 * (b or 0):.0f}%"
        breadth_clause = (f"After false-discovery control, {pct} of the mapped area is flagged in the claimed "
                          f"direction (a descriptive share, not an error rate).")
        narrow_clause = (f"only {pct} of the mapped area is flagged in the claimed direction after "
                         f"false-discovery control" if (b or 0) < BREADTH_MIN else
                         ("the slope interval is not shown because it did not pass its calibration check" if interval_off
                          else "the interval for the slope includes zero"))
        local_clause = (f"{pct} of the mapped area is flagged in the claimed direction after false-discovery "
                        f"control (a descriptive share, not an error rate)")
    else:
        breadth_clause = "The cell map is not used for this verdict."
        narrow_clause = ("the slope interval is not shown because it did not pass its calibration check" if interval_off
                         else "the interval for the slope includes zero")
        local_clause = "no cell map was available to check smaller areas"
    return {
        "region": claim["region_name"], "season": claim["season_label"], "period": claim["period_label"],
        "variable": claim["variable"], "units": claim["units"],
        "direction_past": dp, "opposite_past": op,
        "abs_slope": _fmt(abs(slope) if slope is not None else None),
        "signed_slope": _fmt(slope),
        "ci_text": ci_text, "p": _fmt_p(inp["p"]),
        "breadth_clause": breadth_clause, "narrow_clause": narrow_clause, "local_clause": local_clause,
        "withheld_reasons": "; ".join(inp.get("withheld_reasons") or []),
    }


def detective_decide(p, slope, n, units="units", min_n=8):
    """Series-level plain verdict. Returns (id, text)."""
    if n is None or n < min_n or p is None or p != p:
        return "too_short", DETECTIVE_TEMPLATES["too_short"].format(n=n)
    if p < ALPHA and slope > 0:
        k = "significant_up"
    elif p < ALPHA and slope < 0:
        k = "significant_down"
    else:
        k = "not_significant"
    return k, DETECTIVE_TEMPLATES[k].format(p=_fmt_p(p), abs_slope=_fmt(abs(slope)), units=units)
