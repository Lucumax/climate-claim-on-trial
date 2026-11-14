import itertools
import json
import re

import pytest

from trendtrial import verdict as V
from trendtrial.pipeline import run_claim
from trendtrial.synth import make_claim_folder
from trendtrial.validation import gate_for_claim

CLAIM = dict(region_name="the test region", season_label="summer (June to August)", period_label="2001 to 2025",
             variable="land surface temperature", units="K", direction="increase")
BANNED = [r"\bbecause\b", r"\bdue to\b", r"\bcaused?\b", r"\bdriven\b", r"\bwill (rise|fall|continue|increase|decrease)\b",
          r"\bforecast", r"\bpredicts?\b", r"unpublishable", r"not publishable", r"cannot be published",
          r"no effect", r"proves?\b", r"\bproof\b", r"\bconfidence level\b"]


def all_inputs():
    ps = [0.001, 0.2]
    slopes = [0.4, -0.4]
    cis = [(0.1, 0.7), (-0.2, 0.6), (-0.7, -0.1), None]
    breadth = [(False, None), (True, 0.0), (True, 0.1), (True, 0.5)]
    reasons = [[], ["x"]]
    for p, s, ci, (av, b), r in itertools.product(ps, slopes, cis, breadth, reasons):
        yield dict(withheld_reasons=r, p=p, slope=s, ci=ci, direction="increase", interval_enabled=ci is not None,
                   breadth_in_dir=b, breadth_available=av)


def test_every_input_lands_in_exactly_one_branch_and_renders():
    seen = set()
    for inp in all_inputs():
        vid, branch, trace = V.decide(inp)
        assert vid in ("withheld", "contradicted", "supported", "partly_supported", "not_supported")
        assert branch in V.TEMPLATES
        text = V.render(branch, V.build_slots(CLAIM, inp))
        for pat in BANNED:
            assert not re.search(pat, text, re.I), (pat, text)
        assert "{" not in text and "}" not in text
        seen.add(branch)
    assert seen == set(V.TEMPLATES)  # every branch is reachable and tested


def test_precedence():
    base = dict(withheld_reasons=[], p=0.001, slope=-0.4, ci=(-0.7, -0.1), direction="increase", interval_enabled=True,
                breadth_in_dir=0.9, breadth_available=True)
    assert V.decide({**base, "withheld_reasons": ["gate"]})[0] == "withheld"  # beats contradicted
    assert V.decide(base)[0] == "contradicted"
    sup = {**base, "slope": 0.4, "ci": (0.1, 0.7)}
    assert V.decide(sup)[0] == "supported"
    assert V.decide({**sup, "breadth_in_dir": 0.1})[:2] == ("partly_supported", "partly_regional_narrow")
    assert V.decide({**sup, "ci": (-0.1, 0.7)})[:2] == ("partly_supported", "partly_regional_narrow")
    assert V.decide({**sup, "interval_enabled": False, "ci": None})[:2] == ("partly_supported", "partly_regional_narrow")
    ns = {**sup, "p": 0.3}
    assert V.decide({**ns, "breadth_in_dir": 0.1})[:2] == ("partly_supported", "partly_local_only")
    assert V.decide({**ns, "breadth_in_dir": 0.01})[0] == "not_supported"
    assert V.decide({**ns, "breadth_available": False})[0] == "not_supported"
    # opposite direction but not significant is NOT contradicted
    assert V.decide({**base, "p": 0.4, "breadth_in_dir": 0.0})[0] == "not_supported"


def test_not_supported_text_has_required_plain_framing():
    inp = dict(withheld_reasons=[], p=0.3, slope=0.1, ci=(-0.2, 0.4), direction="increase", interval_enabled=True,
               breadth_in_dir=0.0, breadth_available=True)
    vid, br, _ = V.decide(inp)
    t = V.render(br, V.build_slots(CLAIM, inp))
    assert "does not mean there is no trend" in t and "longer record can help" in t and "still a result worth reporting" in t
    assert "does not say why" in t


def test_detective_wording():
    k, t = V.detective_decide(0.2, 0.5, 20, "K")
    assert k == "not_significant"
    assert "above 0.05 does not mean there is no trend or that it is unimportant" in t and "longer series can help" in t
    k, t = V.detective_decide(0.01, 0.5, 20, "K")
    assert k == "significant_up" and "p = 0.010" in t
    k, t = V.detective_decide(0.01, -0.5, 20, "K")
    assert k == "significant_down"
    assert V.detective_decide(None, None, 4)[0] == "too_short"
    for pat in BANNED:
        for p, s in ((0.01, 1), (0.01, -1), (0.5, 1)):
            assert not re.search(pat, V.detective_decide(p, s, 20)[1], re.I)


CANDS = ["mk_independent", "hr_registered", "hr_all_lags", "yue_wang", "tfpw", "boot_mk_L3", "boot_mk_L5"]
PHIS = (0.0, 0.1, 0.2, 0.3, 0.45, 0.6)


def _interval():
    return dict(checks=dict(B3=dict(passed=True), B3a=dict(passed=True), B4=dict(passed=True)), floor_ok=True)


def _null(sid, n, phi, size):
    cands = {c: dict(size=dict(value=0.05, se=0.003, R=4000)) for c in CANDS}
    checks = {c: dict(passed=True, side="ok") for c in CANDS}
    for c, v in size.items():
        cands[c]["size"]["value"] = v
        checks[c] = dict(passed=v <= 0.0568, side="ok" if 0.0432 <= v <= 0.0568 else ("liberal" if v > 0.0568 else "conservative"))
    return dict(id=sid, kind="regional", n=n, phi=phi, candidates=cands, size_checks=checks, floor_ok=True, interval=_interval())


def _trend(sid, n, phi, power):
    cands = {c: dict(power=dict(value=power.get(c, 0.3), se=0.007, R=4000)) for c in CANDS}
    return dict(id=sid, kind="regional", n=n, phi=phi, candidates=cands, floor_ok=True, interval=_interval())


def _cells(sid, phi, ok):
    cands = {c: dict(B2_passed=ok.get(c, True), cell_size=dict(value=0.05), bh_power=dict(value=0.5),
                     bh_fdr=dict(value=0.05, se=0.01)) for c in ["mk_independent", "hr_registered", "hr_all_lags", "yue_wang", "tfpw"]}
    return dict(id=sid, kind="cells", n=25, phi=phi, candidates=cands, floor_ok=True)


def fake_results(null_size=None, power=None, cells_ok=None, interval=None, extra=None):
    """Build run-B-format results. null_size/power: {scenario_id: {candidate: value}}; cells_ok: {scenario_id: {cand: bool}}."""
    null_size, power, cells_ok, interval = null_size or {}, power or {}, cells_ok or {}, interval or {}
    sc = []
    for n in (23, 25, 45):
        for phi in PHIS:
            sc.append(_null(f"R-null-n{n}-phi{phi}", n, phi, null_size.get(f"R-null-n{n}-phi{phi}", {})))
            sc.append(_trend(f"R-trend-n{n}-phi{phi}", n, phi, power.get(f"R-trend-n{n}-phi{phi}", {})))
    sc.append(_null("R-null-gaps-n25-phi0.3", 25, 0.3, null_size.get("R-null-gaps-n25-phi0.3", {})))
    sc.append(_null("R-null-skewed-n25-phi0.3", 25, 0.3, null_size.get("R-null-skewed-n25-phi0.3", {})))
    for phi in PHIS:
        for k in ("none", "positive", "mixed"):
            sc.append(_cells(f"C-{k}-phi{phi}", phi, cells_ok.get(f"C-{k}-phi{phi}", {})))
    for s_ in sc:
        if s_["id"] in interval:
            for b, v in interval[s_["id"]].items():
                s_["interval"]["checks"][b] = dict(passed=v)
    return dict(run=dict(kind="B_candidates"), scenarios=sc, summary={})


def test_gate_rules_and_selection():
    # everything passes: the candidate with the highest power wins; ties within 0.5 SE go to the earlier candidate
    r = fake_results(power={"R-trend-n25-phi0.1": {"hr_all_lags": 0.5, "tfpw": 0.6, "mk_independent": 0.1}})
    g = gate_for_claim(r, 25, 0.05, False)["gate"]
    assert g["regional_verdict_enabled"] and g["regional_test"] == "tfpw" and g["governing_phi"] == 0.1 and g["governing_n"] == 25
    assert g["interval_method"] == "bootstrap" and g["cells_mode"] == "bh_flags" and g["cells_enabled"]
    r = fake_results(power={"R-trend-n25-phi0.1": {"hr_all_lags": 0.5, "tfpw": 0.5 + 0.003}})
    assert gate_for_claim(r, 25, 0.05, False)["gate"]["regional_test"] == "hr_all_lags"
    # a liberal candidate is excluded even if its power is highest
    r = fake_results(null_size={"R-null-n25-phi0.1": {"tfpw": 0.12}}, power={"R-trend-n25-phi0.1": {"tfpw": 0.9, "yue_wang": 0.4}})
    g = gate_for_claim(r, 25, 0.05, False)["gate"]
    assert g["regional_test"] != "tfpw" and g["candidate_table"]["tfpw"]["passes"] is False
    # no candidate passes -> regional verdict disabled, interval too, reasons listed
    r = fake_results(null_size={"R-null-n25-phi0.1": {c: 0.12 for c in CANDS}})
    g = gate_for_claim(r, 25, 0.05, False)["gate"]
    assert not g["regional_verdict_enabled"] and g["regional_test"] is None and g["reasons_blocking_verdict"] and not g["interval_enabled"]
    # the gaps scenario also governs when the series has gaps
    r = fake_results(null_size={"R-null-gaps-n25-phi0.3": {c: 0.12 for c in CANDS}})
    assert gate_for_claim(r, 25, 0.05, True)["gate"]["regional_verdict_enabled"] is False
    assert gate_for_claim(r, 25, 0.05, False)["gate"]["regional_verdict_enabled"] is True
    # conservative size is flagged, not disabling
    r = fake_results(null_size={"R-null-n25-phi0.1": {"hr_registered": 0.02}}, power={"R-trend-n25-phi0.1": {"hr_registered": 0.9}})
    g = gate_for_claim(r, 25, 0.05, False)["gate"]
    assert g["regional_test"] == "hr_registered" and g["conservative_flags"]
    # interval rule: bootstrap -> analytic -> none
    r = fake_results(interval={"R-null-n25-phi0.1": {"B3": False}})
    assert gate_for_claim(r, 25, 0.05, False)["gate"]["interval_method"] == "analytic_hr"
    r = fake_results(interval={"R-null-n25-phi0.1": {"B3": False, "B3a": False}})
    g = gate_for_claim(r, 25, 0.05, False)["gate"]
    assert not g["interval_enabled"] and g["regional_verdict_enabled"]
    # sen bias failure disables the regional verdict
    r = fake_results(interval={"R-null-n25-phi0.1": {"B4": False}})
    assert not gate_for_claim(r, 25, 0.05, False)["gate"]["regional_verdict_enabled"]
    # cells: none of the batched candidates passes -> unadjusted descriptive mode
    r = fake_results(cells_ok={"C-none-phi0.1": {c: False for c in ["mk_independent", "hr_registered", "hr_all_lags", "yue_wang", "tfpw"]}})
    g = gate_for_claim(r, 25, 0.05, False)["gate"]
    assert g["cells_mode"] == "unadjusted_descriptive" and not g["cells_enabled"] and g["regional_verdict_enabled"]
    # persistence above the tested range disables everything
    g = gate_for_claim(fake_results(), 25, 0.8, False)["gate"]
    assert not (g["regional_verdict_enabled"] or g["interval_enabled"] or g["cells_enabled"])


@pytest.fixture(scope="module")
def synth_bundle(tmp_path_factory):
    d = tmp_path_factory.mktemp("syn")
    make_claim_folder(d / "SYN", ny=10, nx=12, trend_per_decade=0.6, frac_trend=0.8, phi=0.0, seed=3)
    vp = d / "v.json"
    vp.write_text(json.dumps(fake_results()))
    b1 = run_claim(d / "SYN", d / "o1", params=dict(boot_reps=300), validation_path=vp, quiet=True)
    b2 = run_claim(d / "SYN", d / "o2", params=dict(boot_reps=300), validation_path=vp, quiet=True)
    return b1, b2, d


def test_pipeline_deterministic_and_complete(synth_bundle):
    b1, b2, d = synth_bundle
    assert b1["run"]["run_id"] == b2["run"]["run_id"]
    a = json.loads((d / "o1" / "bundle.json").read_text())
    c = json.loads((d / "o2" / "bundle.json").read_text())
    for x in (a, c):
        x["run"].pop("generated_at")
        x["run"].pop("elapsed_seconds")
    assert a == c
    for k in ("run", "claim", "params", "coverage", "regional", "sensitivity", "cells", "validation", "verdict", "finding"):
        assert k in a
    n = a["cells"]["grid"]["ny"] * a["cells"]["grid"]["nx"]
    for k, v in a["cells"]["fields"].items():
        assert len(v) == n, k
    assert len(a["cells"]["rungs"]) == 4
    assert a["verdict"]["text"] and a["finding"]["not_supported"]
    assert a["regional"]["band"]["center"] and a["regional"]["tests"]["mk_hr"]["p"] is not None
    assert "NaN" not in (d / "o1" / "bundle.json").read_text()


def test_pipeline_ladder_flags_in_direction(synth_bundle):
    b, _, _ = synth_bundle
    for r in b["cells"]["rungs"]:
        assert r["flagged_in_direction_cells"] <= r["flagged_cells"]
    assert b["verdict"]["id"] in ("supported", "partly_supported")


def test_pipeline_without_validation_withholds(tmp_path):
    make_claim_folder(tmp_path / "S", ny=8, nx=8, seed=2)
    b = run_claim(tmp_path / "S", tmp_path / "o", params=dict(boot_reps=200), quiet=True)
    assert b["verdict"]["id"] == "withheld"
    assert b["validation"]["gate"]["regional_verdict_enabled"] is False
    assert b["regional"]["band"] is None


def test_pipeline_interval_and_band(synth_bundle):
    b, _, _ = synth_bundle
    sen = b["regional"]["tests"]["sen"]
    lo, hi = sen["interval_used_per_decade"]
    assert lo < sen["slope_per_decade"] < hi
    band = b["regional"]["band"]
    assert all(lo_ <= c <= hi_ for lo_, c, hi_ in zip(band["lo"], band["center"], band["hi"]))
