"""NO2 pair (C-E1, C-E2): the n = 21 validation additions and the table merge (STATS_LOG "C-E1 / C-E2 PRE-RUN ENTRY", CE-3)."""
import importlib.util
import json
from pathlib import Path

import pytest

from test_round3 import r3_results
from test_verdict_and_pipeline import _cells, _null, _trend
from trendtrial.validation import gate_for_claim, pick_cell_family

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_no2.py"
spec = importlib.util.spec_from_file_location("validate_no2", SCRIPT)
VN = importlib.util.module_from_spec(spec)
spec.loader.exec_module(VN)


def n21_regional():
    sc = []
    for sp in VN.regional_specs():
        sid, n, phi, noise, trend, seed = sp
        sc.append(_trend(sid, n, phi, {}) if trend else _null(sid, n, phi, {}))
    return dict(run=dict(kind="N21_regional"), scenarios=sc)


def test_regional_specs_cover_the_grid_with_unique_ids_and_seeds():
    specs = VN.regional_specs()
    assert len(specs) == 27 and len({s[0] for s in specs}) == 27 and len({s[5] for s in specs}) == 27
    assert {s[1] for s in specs} == {21}
    assert min(s[5] for s in specs) > 9001 + 100                  # disjoint from the round-3 seed block (9001 and up, 44 scenarios)
    ids = {s[0] for s in specs}
    assert "R-null-n21-phi-0.7" in ids and "R-trend-n21-phi0.6" in ids and "R-null-skewed-n21-phi0.45" in ids


def test_cell_specs_seeds_are_full_grid_indices():
    full = VN.cell_specs()
    assert len(full) == 2 * 9 * 2 * 3 and len({VN.cell_id(s) for s in full}) == len(full)
    sub = [s for s in full if s[0] == "CE2" and s[2] == 0.1]
    assert len(sub) == 6
    assert [s[4] for s in sub] == [s[4] for s in full if s[0] == "CE2" and s[2] == 0.1]   # same seeds as inside the full grid
    assert VN.FAMILIES_NO2["CE1"]["ny"] * VN.FAMILIES_NO2["CE1"]["nx"] == 3200
    assert VN.FAMILIES_NO2["CE2"]["ny"] * VN.FAMILIES_NO2["CE2"]["nx"] == 1664


def test_merge_adds_n21_and_gate_uses_it_and_refuses_duplicates():
    base = r3_results()
    base["adaptive"] = dict(cells={})
    merged = VN.merged_table(base, regional=n21_regional())
    ids = {s["id"] for s in merged["scenarios"]}
    assert "R-null-n21-phi0.2" in ids and len(merged["scenarios"]) == len(base["scenarios"]) + 27
    assert "R-null-n21-phi0.2" not in {s["id"] for s in base["scenarios"]}     # the base is not modified
    g = gate_for_claim(merged, 21, 0.18, False, use_adaptive=False)["gate"]
    assert g["governing_n"] == 21 and all("n21" in i for i in g["governing"] if i.startswith("R-"))
    g23 = gate_for_claim(base, 21, 0.18, False, use_adaptive=False)["gate"]
    assert g23["governing_n"] == 23                                          # without the additions the old nearest-n rule applies
    with pytest.raises(AssertionError):
        VN.merged_table(merged, regional=n21_regional())


def test_cell_family_for_each_box_and_unadjusted_when_bucket_missing():
    base = r3_results()
    base["adaptive"] = dict(cells={})
    cells = dict(run=dict(kind="N21_cells"), families=VN.FAMILIES_NO2,
                 scenarios=[dict(_cells(f"CF-CE1-{k}-{t}0.2", 0.2, {}), n=21, family="CE1")
                            for k in ("none", "positive", "mixed") for t in ("phi", "het")])
    merged = VN.merged_table(base, regional=n21_regional(), cells=cells)
    assert pick_cell_family(merged, 21, 3200) == "CE1" and pick_cell_family(merged, 21, 1664) == "CE2"
    g = gate_for_claim(merged, 21, 0.18, False, n_cells=3200, use_adaptive=False)["gate"]
    assert g["cell_family"] == "CE1" and g["cells_mode"] == "bh_flags"        # scenarios at the governing bucket 0.2 exist
    g2 = gate_for_claim(merged, 21, 0.18, False, n_cells=1664, use_adaptive=False)["gate"]
    assert g2["cell_family"] == "CE2" and g2["cells_mode"] == "unadjusted_descriptive"   # none run for CE2: descriptive, stated
    assert any("unadjusted" in f for f in g2["conservative_flags"])
