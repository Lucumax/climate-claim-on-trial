"""Round 2 gate rules (STATS_LOG R2-2, R2-3): adaptive-procedure bars and cell families with heterogeneous persistence."""
import copy

from test_verdict_and_pipeline import CANDS, fake_results
from trendtrial.validation import PHIS, gate_for_claim, pick_cell_family

CELLC = ["mk_independent", "hr_registered", "hr_all_lags", "yue_wang", "tfpw"]


def _adaptive_cell(size=0.04, size_rel=0.06, cov=0.93, shown=True):
    def p(v, se=0.003, R=4000):
        return dict(value=v, se=se, R=R)
    base = dict(release_rate=p(0.6), reject_unconditional=p(size), reject_given_release=p(size_rel, 0.005, 2400),
                positive_reject_unconditional=p(0.4), positive_reject_given_release=p(0.65),
                interval_shown_rate=p(0.6 if shown else 0.0),
                interval_coverage_given_shown=dict(value=cov if shown else None, se=0.007, R=600 if shown else 0),
                selected_share={"yue_wang": 0.4, "withheld": 0.4}, buckets={})
    return dict(null=dict(base), trend=dict(base))


def with_adaptive(res, **kw):
    res = copy.deepcopy(res)
    res["adaptive"] = dict(seed_family=2026, cells={f"n{n}-phi{phi}": _adaptive_cell(**kw) for n in (23, 25, 45) for phi in PHIS})
    return res


def family_scenarios(res, fam="CC", n=45, ny=21, nx=41, het_fail=None, hom_fail=None):
    res = copy.deepcopy(res)
    res["cell_families"] = {fam: dict(n=n, ny=ny, nx=nx)}
    for phi in PHIS:
        for k in ("none", "positive", "mixed"):
            for tag, bad in (("phi", hom_fail or {}), ("het", het_fail or {})):
                ok = {c: not bad.get(c, False) for c in CELLC}
                cands = {c: dict(B2_passed=ok[c], cell_size=dict(value=0.05), bh_power=dict(value=0.3 + 0.01 * CELLC.index(c)),
                                 bh_fdr=dict(value=0.05, se=0.01)) for c in CELLC}
                res["scenarios"].append(dict(id=f"CF-{fam}-{k}-{tag}{phi}", kind="cells", n=n, phi=phi, candidates=cands, floor_ok=True))
    return res


def test_adaptive_bar_ap1_withholds_regional_verdict():
    ok = gate_for_claim(with_adaptive(fake_results(), size=0.04), 25, 0.05, False)["gate"]
    assert ok["regional_verdict_enabled"] and ok["adaptive"]["bars"]["AP1"]["passed"]
    bad = gate_for_claim(with_adaptive(fake_results(), size=0.09), 25, 0.05, False)["gate"]
    assert not bad["regional_verdict_enabled"] and any("adaptive procedure" in r for r in bad["reasons_blocking_verdict"])
    assert not bad["interval_enabled"]


def test_adaptive_bar_ap3_disables_interval_only():
    g = gate_for_claim(with_adaptive(fake_results(), cov=0.85), 25, 0.05, False)["gate"]
    assert g["regional_verdict_enabled"] and not g["interval_enabled"] and g["reasons_interval"]
    assert g["adaptive"]["bars"]["AP3"]["passed"] is False


def test_conditional_size_note_is_shown_not_gating():
    g = gate_for_claim(with_adaptive(fake_results(), size=0.04, size_rel=0.09), 25, 0.05, False)["gate"]
    assert g["regional_verdict_enabled"] and g["adaptive_notes"] and "9.0%" in g["adaptive_notes"][0]


def test_missing_adaptive_cell_is_reported():
    res = with_adaptive(fake_results())
    del res["adaptive"]["cells"]["n25-phi0.1"]
    g = gate_for_claim(res, 25, 0.05, False)["gate"]
    assert not g["regional_verdict_enabled"] and g["adaptive"]["status"] == "no_cell"
    g0 = gate_for_claim(fake_results(), 25, 0.05, False)["gate"]       # no adaptive section at all: legacy behaviour
    assert g0["regional_verdict_enabled"] and g0["adaptive"]["status"] == "not_run"


def test_family_pick_and_heterogeneity_rule():
    res = family_scenarios(fake_results())
    res["cell_families"]["CA"] = dict(n=25, ny=28, nx=58)
    res["cell_families"]["CB"] = dict(n=25, ny=16, nx=84)
    assert pick_cell_family(res, 45, 861) == "CC"
    assert pick_cell_family(res, 25, 1624) == "CA" and pick_cell_family(res, 25, 1344) == "CB"
    assert pick_cell_family(res, 60, 861) is None
    g = gate_for_claim(res, 45, 0.05, False, n_cells=861)["gate"]
    assert g["cells_mode"] == "bh_flags" and g["cell_family"] == "CC" and g["cell_table"]["yue_wang"]["heterogeneous_passes"]
    # a test that passes homogeneously but fails with heterogeneous persistence does not qualify
    r2 = family_scenarios(fake_results(), het_fail={c: True for c in CELLC})
    g2 = gate_for_claim(r2, 45, 0.05, False, n_cells=861)["gate"]
    assert g2["cells_mode"] == "unadjusted_descriptive" and not g2["cells_enabled"]
    r3 = family_scenarios(fake_results(), het_fail={"yue_wang": True})
    g3 = gate_for_claim(r3, 45, 0.05, False, n_cells=861)["gate"]
    assert g3["cells_mode"] == "bh_flags" and g3["cell_test"] != "yue_wang"
    # a family wins over the legacy 20 x 20 scenarios: legacy all-pass must not enable cells
    r4 = family_scenarios(fake_results(), hom_fail={c: True for c in CELLC})
    assert gate_for_claim(r4, 45, 0.05, False, n_cells=861)["gate"]["cells_mode"] == "unadjusted_descriptive"
