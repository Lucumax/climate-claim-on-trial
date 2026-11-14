"""Validation additions for the NO2 pair C-E1 / C-E2 (rules: event_record/STATS_LOG.md "C-E1 / C-E2 PRE-RUN ENTRY", CE-3).

Nothing existing is changed or re-run. Adds, for n = 21 (the nearest tested n was 23):
  regional  R-null-n21-phi*, R-trend-n21-phi*, R-null-skewed-n21-phi*  (phi in the 9-value R3 grid)
  adaptive  the whole adaptive procedure at n = 21, normal and skewed noise (seed family 2028)
  cells     cell families CE1 (40 x 80) and CE2 (32 x 52), n = 21, only at the requested persistence values (full-grid seeds)
  merge     validation_results.json + the above -> validation_results_n21.json (validation_results.json is not touched)

usage (from stats/):  python scripts/validate_no2.py regional --out out/validation/n21_regional.json
Everything runs in ONE process (the machine is shared); every write is atomic; every part resumes after a crash.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from trendtrial import __version__  # noqa: E402
from trendtrial import validation_r2 as V2  # noqa: E402
from trendtrial.validation import PHIS, TREND_SD_PER_DECADE  # noqa: E402
from trendtrial.validation_r3 import NEG_PHIS, SKEW_PHIS, _interval_block, _read_resume, _retry  # noqa: E402
from trendtrial.validation_r3 import atomic_write_text as _atomic_write_text  # noqa: E402


def atomic_write_text(path, text, tries=8):
    """Atomic write (temp file + os.replace); on Windows os.replace can fail with PermissionError while a scanner holds the file, so retry."""
    for k in range(tries):
        try:
            return _atomic_write_text(path, text)
        except PermissionError:
            if k == tries - 1:
                raise
            time.sleep(1 + k)


N_CLAIM = 21
SEED0_REGIONAL = 9101
SEED_FAMILY_ADAPTIVE = 2028
SEED0_CELLS = 9700
GRID = SKEW_PHIS                      # (-0.7, -0.5, -0.3, 0, 0.1, 0.2, 0.3, 0.45, 0.6)

FAMILIES_NO2 = {
    "CE1": dict(n=N_CLAIM, ny=40, nx=80, sigma=4.0, fields=200, note="C-E1, OMI NO2 0.25 deg, eastern US box, 3,200 cells"),
    "CE2": dict(n=N_CLAIM, ny=32, nx=52, sigma=4.0, fields=200, note="C-E2, OMI NO2 0.25 deg, Indo-Gangetic box, 1,664 cells"),
}


def regional_specs(n=N_CLAIM, phis=GRID, seed0=SEED0_REGIONAL):
    """(id, n, phi, noise, trend, seed). Order and seeds are fixed by this function, never by what is already on disk."""
    specs, k = [], 0
    for phi in phis:
        for trend in (0.0, TREND_SD_PER_DECADE):
            k += 1
            specs.append((f"R-{'trend' if trend else 'null'}-n{n}-phi{phi}", n, phi, "normal", trend, seed0 + k))
    for phi in phis:
        k += 1
        specs.append((f"R-null-skewed-n{n}-phi{phi}", n, phi, "skewed", 0.0, seed0 + k))
    return specs


def cell_specs(phis=GRID, families=("CE1", "CE2"), seed0=SEED0_CELLS):
    """(family, truth, g, hetero, seed) over the FULL grid; the seed is the index in the full grid (so a subset equals a full run)."""
    specs, k = [], 0
    for fam in families:
        for g in phis:
            for hetero in (False, True):
                for truth in V2.TRUTHS:
                    k += 1
                    specs.append((fam, truth, g, hetero, seed0 + k))
    return specs


def cell_id(sp):
    return f"CF-{sp[0]}-{sp[1]}-{'het' if sp[3] else 'phi'}{sp[2]}"


def _regional_job(spec):
    from trendtrial.validation import regional_candidates, regional_scenario
    sid, n, phi, noise, trend, seed = spec
    cand = regional_candidates(sid, n, phi, noise=noise, trend=trend, seed=seed)
    scen = regional_scenario(sid, n, phi, noise=noise, trend=trend, seed=seed + 500000)
    cand["interval"] = _interval_block(scen)
    return cand


def run_regional(out_path):
    t0 = time.time()
    specs = regional_specs()
    res = _read_resume(out_path)
    done = {s["id"] for s in res}
    todo = [sp for sp in specs if sp[0] not in done]

    def dump():
        out = dict(run=dict(kind="N21_regional", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                            code_version=__version__, seed0=SEED0_REGIONAL, complete=len(res) == len(specs), n_planned=len(specs),
                            elapsed_seconds=round(time.time() - t0, 1)),
                   scenarios=sorted(res, key=lambda s: s["id"]))
        atomic_write_text(out_path, json.dumps(out, indent=1))
    for sp in todo:
        s = _retry(_regional_job, sp)
        res.append(s)
        k = "power" if s["trend_sd_per_decade"] else "size"
        print(f"[{time.time() - t0:6.0f}s] {s['id']}: " + " ".join(f"{n[:7]}={m[k]['value']:.3f}" for n, m in s["candidates"].items()), flush=True)
        dump()
    return res


def merged_table(base, regional=None, cells=None, adaptive=None):
    """The validation table the gate reads: `base` (a loaded validation_results.json) plus the n = 21 additions. Pure function."""
    R = json.loads(json.dumps(base))
    ids = {s["id"] for s in R["scenarios"]}
    for src, key in ((regional, "merged_n21_regional"), (cells, "merged_n21_cells")):
        if not src:
            continue
        for s in src["scenarios"]:
            assert s["id"] not in ids, s["id"]
            R["scenarios"].append(s)
            ids.add(s["id"])
        R["run"][key] = src["run"]
    if cells:
        for f, spec in cells.get("families", {}).items():
            R.setdefault("cell_families", {})[f] = spec
    if adaptive:
        for k, v in adaptive["cells"].items():
            assert k not in R["adaptive"]["cells"], k
            R["adaptive"]["cells"][k] = v
        R["run"]["merged_n21_adaptive"] = dict(generated_at=adaptive["generated_at"], seed_family=adaptive["seed_family"],
                                               replicates=adaptive.get("replicates"))
    fails = []
    for s in R["scenarios"]:
        if s["kind"] == "regional":
            for nm, c in s.get("size_checks", {}).items():
                if not c["passed"]:
                    fails.append(f"{s['id']}:{nm}:liberal")
            for b, c in s.get("interval", {}).get("checks", {}).items():
                if not c["passed"]:
                    fails.append(f"{s['id']}:{b}")
        else:
            for nm, m in s["candidates"].items():
                if not m["B2_passed"]:
                    fails.append(f"{s['id']}:{nm}:B2")
    R["summary"] = dict(n_scenarios=len(R["scenarios"]), failures=fails)
    return R


def run_adaptive(base_path, regional_path, out_path, R=4000, Rcov=1000):
    """Whole adaptive procedure at n = 21. Needs the n = 21 regional scenarios in the table the gate looks up."""
    t0 = time.time()
    base = json.loads(Path(base_path).read_text(encoding="utf-8"))
    table = merged_table(base, regional=json.loads(Path(regional_path).read_text(encoding="utf-8")))
    jobs, k = [], 0
    for noise in ("normal", "skewed"):
        for phi in GRID:
            for trend in (0.0, TREND_SD_PER_DECADE):
                k += 1
                jobs.append((table, N_CLAIM, phi, trend, SEED_FAMILY_ADAPTIVE * 100 + k, R, Rcov, noise))
    partial = Path(str(out_path) + ".partial")
    cells = {}
    if partial.exists() and partial.stat().st_size > 0:
        try:
            cells = json.loads(partial.read_text(encoding="utf-8"))
        except ValueError:
            cells = {}
    for job in jobs:
        _, n, phi, trend, _, _, _, noise = job
        key = f"n{n}-phi{phi}" + ("-skewed" if noise == "skewed" else "")
        kind = "trend" if trend else "null"
        if kind in cells.get(key, {}):
            continue
        o = _retry(V2.adaptive_cell, job)
        cells.setdefault(key, {})[kind] = o
        atomic_write_text(partial, json.dumps(cells))
        print(f"[{time.time() - t0:6.0f}s] {key} {kind}: release {o['release_rate']['value']:.3f} "
              f"rej_uncond {o['reject_unconditional']['value']:.4f} rej|rel {o['reject_given_release']['value']} "
              f"cov {o['interval_coverage_given_shown']['value']}", flush=True)
    out = dict(kind="adaptive_procedure_validation_n21", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
               code_version=__version__, seed_family=SEED_FAMILY_ADAPTIVE, replicates=dict(series=R, coverage=Rcov, bootstrap_reps=2000),
               elapsed_seconds=round(time.time() - t0, 1), cells=cells)
    atomic_write_text(out_path, json.dumps(out, indent=1))
    return out


def run_cells(out_path, phis, families):
    """Cell FDR scenarios of the requested families at the requested persistence values only (full-grid seeds)."""
    t0 = time.time()
    V2.FAMILIES.update(FAMILIES_NO2)
    phis = [float(p) for p in phis]
    specs = [sp for sp in cell_specs() if sp[0] in families and any(abs(sp[2] - p) < 1e-9 for p in phis)]
    res = _read_resume(out_path)
    done = {s["id"] for s in res}
    todo = [sp for sp in specs if cell_id(sp) not in done]

    def dump():
        out = dict(run=dict(kind="N21_cells", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                            code_version=__version__, seed0=SEED0_CELLS, complete=len(res) == len(specs), n_planned=len(specs),
                            persistence_run=phis, persistence_grid=list(GRID), elapsed_seconds=round(time.time() - t0, 1),
                            het=dict(sd=V2.HET_SD, range_nonneg=V2.HET_RANGE, range_neg=V2.HET_RANGE_NEG, sigma=V2.HET_SIGMA)),
                   families={f: FAMILIES_NO2[f] for f in sorted({sp[0] for sp in specs})},
                   scenarios=sorted(res, key=lambda s: s["id"]))
        atomic_write_text(out_path, json.dumps(out, indent=1))
    for sp in todo:
        s = _retry(V2.cell_family_scenario, sp)
        res.append(s)
        print(f"[{time.time() - t0:6.0f}s] {s['id']}: " + " ".join(f"{n[:6]}:{'ok' if m['B2_passed'] else 'FAIL'}" for n, m in s["candidates"].items()), flush=True)
        dump()
    if not todo:
        dump()
    return res


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("part", choices=["regional", "adaptive", "cells", "merge"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default=str(ROOT / "out" / "validation" / "validation_results.json"))
    ap.add_argument("--regional")
    ap.add_argument("--adaptive")
    ap.add_argument("--cells", nargs="*", default=[])
    ap.add_argument("--phis", nargs="*", default=[])
    ap.add_argument("--families", nargs="*", default=["CE1", "CE2"])
    a = ap.parse_args(argv)
    if a.part == "regional":
        run_regional(a.out)
    elif a.part == "adaptive":
        run_adaptive(a.base, a.regional, a.out)
    elif a.part == "cells":
        run_cells(a.out, a.phis, a.families)
    else:
        load = lambda p: json.loads(Path(p).read_text(encoding="utf-8"))
        cells = None
        for c in a.cells:               # several cell files (one per box) are concatenated
            d = load(c)
            if cells is None:
                cells = d
            else:
                cells["scenarios"] += d["scenarios"]
                cells["families"].update(d["families"])
        R = merged_table(load(a.base), regional=load(a.regional) if a.regional else None, cells=cells,
                         adaptive=load(a.adaptive) if a.adaptive else None)
        atomic_write_text(a.out, json.dumps(R, indent=1))
        print("merged:", R["summary"]["n_scenarios"], "scenarios;", len(R["summary"]["failures"]), "failed checks")


if __name__ == "__main__":
    main()
