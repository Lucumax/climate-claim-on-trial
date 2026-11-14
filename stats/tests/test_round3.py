"""Round 3 rules (STATS_LOG R3-1 to R3-7): negative buckets, matched skew scenarios, missing years, display numbers, run identity."""
import copy
import json

import numpy as np
import pytest

from test_verdict_and_pipeline import CANDS, PHIS, _null, _trend, fake_results
from trendtrial import exploratory as E
from trendtrial.pipeline import code_fingerprint, run_claim
from trendtrial.synth import ar1_series, make_claim_folder
from trendtrial.validation import gate_for_claim, governing_buckets

NEG = (-0.7, -0.5, -0.3)
ALLP = NEG + PHIS


def r3_results(null_size=None, power=None):
    """Round-2-style fake results plus negative buckets (all n) and matched skewed nulls over the full grid."""
    null_size, power = null_size or {}, power or {}
    res = fake_results(null_size=null_size, power=power)
    for n in (23, 25, 45):
        for phi in NEG:
            res["scenarios"].append(_null(f"R-null-n{n}-phi{phi}", n, phi, null_size.get(f"R-null-n{n}-phi{phi}", {})))
            res["scenarios"].append(_trend(f"R-trend-n{n}-phi{phi}", n, phi, power.get(f"R-trend-n{n}-phi{phi}", {})))
    have = {s["id"] for s in res["scenarios"]}
    for n in (23, 25, 45):
        for phi in ALLP:
            sid = f"R-null-skewed-n{n}-phi{phi}"
            if sid not in have:
                res["scenarios"].append(_null(sid, n, phi, null_size.get(sid, {})))
    return res


# ---------------------------------------------------------------------------------------------- R3-1
def test_bucket_rule():
    grid = sorted(ALLP)
    assert governing_buckets(grid, -0.668) == [-0.7, -0.5]                    # bracketed, nearer first
    assert governing_buckets(grid, -0.483) == [-0.5, -0.3]
    assert governing_buckets(grid, -0.9) == [-0.7]                           # below the lowest tested value
    assert governing_buckets(grid, -0.3) == [-0.3]
    assert governing_buckets(grid, -0.1) == [0.0, -0.3] or governing_buckets(grid, -0.1) == [-0.3, 0.0]
    assert governing_buckets(grid, 0.048) == [0.1] and governing_buckets(grid, 0.0) == [0.0]
    assert governing_buckets(grid, 0.8) == []
    assert governing_buckets(list(PHIS), -0.6) == [0.0]                       # no negative buckets in the table: old rule, round up to 0


def test_negative_estimate_is_governed_by_both_bracket_buckets():
    # candidate passes in -0.5 but is liberal in -0.7: it may not ship; the other passer does
    res = r3_results(null_size={"R-null-n25-phi-0.7": {"yue_wang": 0.12}},
                     power={"R-trend-n25-phi-0.7": {"yue_wang": 0.9, "hr_registered": 0.4}, "R-trend-n25-phi-0.5": {"yue_wang": 0.9, "hr_registered": 0.4}})
    g = gate_for_claim(res, 25, -0.668, False)["gate"]
    assert g["governing_buckets"] == [-0.7, -0.5] and g["regional_test"] != "yue_wang"
    assert "R-null-n25-phi-0.7" in g["governing"] and "R-null-n25-phi-0.5" in g["governing"]
    assert "bracket" in g["bucket_rule"]
    # the same series with no negative buckets in the table: old rule (round up to 0), and the bundle says so
    g0 = gate_for_claim(fake_results(), 25, -0.668, False)["gate"]
    assert g0["governing_buckets"] == [0.0] and "no negative buckets" in g0["bucket_rule"]
    # a candidate failing in either bracket bucket is excluded everywhere
    res2 = r3_results(null_size={"R-null-n25-phi-0.5": {c: 0.12 for c in CANDS}})
    g2 = gate_for_claim(res2, 25, -0.668, False)["gate"]
    assert not g2["regional_verdict_enabled"] and g2["reasons_blocking_verdict"]


# ---------------------------------------------------------------------------------------------- R3-2
def test_skewed_claim_uses_its_own_n_and_phi_not_the_legacy_scenario():
    # legacy scenario fails every candidate, the matched ones pass: a lopsided claim at n 23, phi 0.1 is NOT withheld by the legacy one
    res = r3_results(null_size={"R-null-skewed-n25-phi0.3": {c: 0.12 for c in CANDS}})
    g = gate_for_claim(res, 23, 0.05, False, skew=1.4)["gate"]
    assert "matched" in g["skew_scenarios"] and "R-null-skewed-n23-phi0.1" in g["governing"]
    assert "R-null-skewed-n25-phi0.3" not in g["governing"] and g["regional_verdict_enabled"]
    # a matched scenario that fails withholds, and the reason names that scenario (n, phi, noise) and says it is skewness
    res2 = r3_results(null_size={"R-null-skewed-n23-phi0.1": {c: 0.09 for c in CANDS}})
    g2 = gate_for_claim(res2, 23, 0.05, False, skew=1.4)["gate"]
    assert not g2["regional_verdict_enabled"] and g2["withheld_driver"] == "skew"
    txt = g2["reasons_blocking_verdict"][0]
    assert "lopsided noise (skewness 2), 23 seasons, persistence 0.1" in txt and "9.0%" in txt and "only where the noise was lopsided" in txt
    # no skew: the skewed scenarios are not consulted
    assert gate_for_claim(res2, 23, 0.05, False, skew=0.2)["gate"]["regional_verdict_enabled"]
    # fallback to the legacy scenario when the matched ones are absent
    res3 = fake_results(null_size={"R-null-skewed-n25-phi0.3": {c: 0.12 for c in CANDS}})
    g3 = gate_for_claim(res3, 25, 0.05, False, skew=1.4)["gate"]
    assert "legacy" in g3["skew_scenarios"] and not g3["regional_verdict_enabled"]


def test_withheld_reason_blames_dependence_when_symmetric_noise_fails():
    res = r3_results(null_size={"R-null-n23-phi-0.5": {c: 0.08 for c in CANDS}, "R-null-skewed-n23-phi-0.5": {c: 0.09 for c in CANDS}})
    g = gate_for_claim(res, 23, -0.5, False, skew=1.4)["gate"]
    assert g["withheld_driver"] in ("dependence", "dependence+skew")
    assert "symmetric noise" in g["reasons_blocking_verdict"][0]


# ---------------------------------------------------------------------------------------------- R3-3
def _years(drop=(), nan=()):
    t = [y for y in range(1981, 2026) if y not in drop]
    rng = np.random.default_rng(3)
    y = [float(v) for v in ar1_series(1, len(t), 0.0, rng)[0]]
    for yr in nan:
        y[t.index(yr)] = float("nan")
    return t, y


def test_exploratory_gate_complete_series_has_no_gaps():
    t, y = _years()
    g = E.exploratory_gate(y, t=t, period=[1981, 2025])
    assert not g["hasGaps"] and g["missingYears"] == 0 and g["nExpected"] == 45 and g["calibrated"]


def test_exploratory_gate_dropped_year_without_placeholder():
    t, y = _years(drop=(2000,))
    g = E.exploratory_gate(y, t=t)                                      # no period: the hole in the year axis is enough
    assert g["hasGaps"] and g["missingYears"] == 1 and g["nExpected"] == 45 and g["nValid"] == 44
    assert not g["calibrated"] and "gaps" in g["reasons"] and "missing 1 of the 45 years" in g["caveat"]


def test_exploratory_gate_dropped_year_with_nan_placeholder():
    t, y = _years(nan=(2000,))
    g = E.exploratory_gate(y, t=t)
    assert g["hasGaps"] and g["missingYears"] == 1 and g["nExpected"] == 45 and not g["calibrated"]


def test_exploratory_gate_years_absent_at_the_ends_need_the_period():
    t, y = _years(drop=(1981, 2024, 2025))
    assert not E.exploratory_gate(y, t=t)["hasGaps"]                    # without a period nothing shows
    g = E.exploratory_gate(y, t=t, period=[1981, 2025])
    assert g["hasGaps"] and g["missingYears"] == 3 and g["nExpected"] == 45 and not g["calibrated"]


def test_pipeline_drops_every_month_of_2000(tmp_path):
    make_claim_folder(tmp_path / "G", ny=10, nx=12, years=(1981, 2025), months=(6, 7, 8), trend_per_decade=0.6, frac_trend=0.8, phi=0.0, seed=3)
    z = dict(np.load(tmp_path / "G" / "monthly.npz"))
    keep = z["year"] != 2000
    z = {k: (v[keep] if k in ("values", "year", "month") else v) for k, v in z.items()}
    np.savez_compressed(tmp_path / "G" / "monthly.npz", **z)
    vp = tmp_path / "v.json"
    vp.write_text(json.dumps(r3_results()))
    b = run_claim(tmp_path / "G", tmp_path / "o", params=dict(boot_reps=200), validation_path=vp, quiet=True)
    assert b["coverage"]["years_absent"] == [2000] and 2000 in b["coverage"]["years_dropped"]
    assert b["coverage"]["years_total"] == 45 and b["coverage"]["years_valid"] == 44
    assert not b["validation"]["gate"]["regional_verdict_enabled"] or "R-null-gaps-n25-phi0.3" in b["validation"]["gate"]["governing"]
    # a series with the gap scenario failing (as in the real validation) is withheld
    res = r3_results(null_size={"R-null-gaps-n25-phi0.3": {c: 0.12 for c in CANDS}})
    vp.write_text(json.dumps(res))
    b2 = run_claim(tmp_path / "G", tmp_path / "o2", params=dict(boot_reps=200), validation_path=vp, quiet=True)
    assert b2["verdict"]["id"] == "withheld" and not b2["validation"]["gate"]["regional_verdict_enabled"]
    assert "R-null-gaps-n25-phi0.3" in b2["validation"]["gate"]["governing"]
    assert "1 of the 45 seasons" in b2["validation"]["gate"]["reasons_blocking_verdict"][0] and "2000" in b2["validation"]["gate"]["reasons_blocking_verdict"][0]


# ---------------------------------------------------------------------------------------------- R3-6, R3-7
def _adaptive(n, phi, noise="normal", size=0.043, rg=0.066, cov=(0.925, 0.938)):
    def p(v, se=0.003, R=4000):
        return dict(value=v, se=se, R=R)
    base = dict(release_rate=p(0.63), reject_unconditional=p(size), reject_given_release=p(rg, 0.005, 2520),
                positive_reject_unconditional=p(0.4), positive_reject_given_release=p(0.65), interval_shown_rate=p(0.6),
                interval_coverage_given_shown=dict(value=cov[0], se=0.008, R=600), selected_share={}, buckets={})
    tr = dict(base)
    tr["interval_coverage_given_shown"] = dict(value=cov[1], se=0.008, R=600)
    return dict(null=base, trend=tr)


def test_display_numbers_and_skewed_adaptive_cell():
    res = r3_results()
    res["adaptive"] = dict(seed_family=2027, cells={})
    for n in (23, 25, 45):
        for phi in ALLP:
            res["adaptive"]["cells"][f"n{n}-phi{phi}"] = _adaptive(n, phi)
            res["adaptive"]["cells"][f"n{n}-phi{phi}-skewed"] = _adaptive(n, phi, "skewed", size=0.045, rg=0.071, cov=(0.88, 0.90))
    g = gate_for_claim(res, 45, 0.05, False, skew=0.2)
    from trendtrial.pipeline import build_display
    d = build_display(g["gate"], dict(method="analytic_hr"))
    assert d["interval_text"].startswith("nominal 95% interval; measured coverage 92.5% in trendless simulations and 93.8% in simulations with a trend, at this claim's setting")
    assert d["false_positive_text"].startswith("false-alarm rate among simulated records that received a verdict, at this setting: 6.6% (overall 4.3%)")
    assert "Simulation standard error 0.5 / 0.3 points. 2,520 of 4,000 trendless simulated records received a verdict" in d["false_positive_text"]
    assert "Simulation standard error 0.8 / 0.8 points, from 600 / 600 simulated series" in d["interval_text"]
    assert d["false_positive_released"]["R"] == 2520 and d["false_positive_overall"]["R"] == 4000 and d["interval_coverage_null"]["R"] == 600
    g2 = gate_for_claim(res, 45, 0.05, False, skew=1.1)["gate"]                    # lopsided claim: the skewed adaptive cell governs
    assert g2["adaptive"]["cell"].endswith("-skewed") and g2["adaptive"]["noise"] == "skewed"
    assert "lopsided" in build_display(g2, None)["setting_text"]
    assert build_display(g2, None)["interval_text"] is None                       # no interval shown: no coverage quoted
    assert build_display(gate_for_claim(fake_results(), 25, 0.05, False)["gate"], None)["status"] == "not_available"


def test_ap1_limit_is_five_percent_plus_two_se():
    res = r3_results()
    res["adaptive"] = dict(seed_family=2027, cells={f"n{n}-phi{p}": _adaptive(n, p) for n in (23, 25, 45) for p in ALLP})
    g = gate_for_claim(res, 45, 0.05, False)["gate"]
    assert g["adaptive"]["bars"]["AP1"]["bar"] == pytest.approx(0.05 + 2 * 0.003)          # about 0.056, not 0.047


def test_run_identity_is_a_content_hash_and_supersedes_are_listed(tmp_path, monkeypatch):
    sha, files = code_fingerprint()
    assert len(sha) == 64 and any(p == "pipeline.py" for p, _ in files) and any(p == "gate_table.json" for p, _ in files)
    make_claim_folder(tmp_path / "S", ny=8, nx=8, seed=2, claim_id="C-C")
    vp = tmp_path / "v.json"
    vp.write_text(json.dumps(fake_results()))
    b = run_claim(tmp_path / "S", tmp_path / "o", params=dict(boot_reps=200), validation_path=vp, quiet=True)
    assert b["run"]["code_sha256"] == sha and b["run"]["code_files"] and b["run"]["run_id"].startswith("run-")
    assert any(x["run_id"] == "run-bdb2a144421d" and x["status"] == "superseded" for x in b["run"]["supersedes"])
    # a changed source file changes the run id even though the version label is the same
    import trendtrial.pipeline as P
    monkeypatch.setattr(P, "code_fingerprint", lambda: ("0" * 64, files))
    b2 = run_claim(tmp_path / "S", tmp_path / "o2", params=dict(boot_reps=200), validation_path=vp, quiet=True)
    assert b2["run"]["run_id"] != b["run"]["run_id"] and b2["run"]["code_version"] == b["run"]["code_version"]


def test_exploratory_skewed_caveat_comes_from_the_matched_scenarios():
    rng = np.random.default_rng(11)
    y = ar1_series(1, 25, 0.0, rng, "skewed")[0] + 5.0
    g = E.exploratory_gate(list(y), t=list(range(1990, 2015)))
    if "skewed" not in g["reasons"]:                       # make sure the fixture really is lopsided
        y = np.exp(np.asarray(y) / 2)
        g = E.exploratory_gate(list(y), t=list(range(1990, 2015)))
    assert "skewed" in g["reasons"] and not g["calibrated"]
    assert "In simulations with lopsided noise at 25 points" in g["caveat"] and "% of trendless synthetic series" in g["caveat"]
    assert "too liberal when the noise was lopsided" not in g["caveat"]
    assert all(r.get("skewed_size") is not None for r in E.TABLE["rows"])
