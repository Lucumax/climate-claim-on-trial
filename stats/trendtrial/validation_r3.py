"""Round 3 validation (rules: event_record/STATS_LOG.md "ROUND 3 (Sonnet B3)", recorded before any run).

Parts
  regional   negative persistence (phi -0.7, -0.5, -0.3) at n 23, 25, 45 and skewed-noise nulls over the full grid (R3-1, R3-2)
  cells      cell FDR scenarios at negative g for CB, CD, CD2 and CD2 at every g (R3-5)
  adaptive   whole adaptive procedure at negative phi (normal noise) and with skewed noise (R3-4)
  merge      adds everything to the round-2 gate table and writes the file the gate reads

usage (from stats/):  python -m trendtrial.validation_r3 --part regional --workers 6 --out out/validation/r3_regional.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import tempfile
import time
from multiprocessing import Pool
from pathlib import Path

from . import __version__
from .validation import PHIS, TREND_SD_PER_DECADE, NS, regional_candidates, regional_scenario

NEG_PHIS = (-0.7, -0.5, -0.3)
SKEW_PHIS = NEG_PHIS + PHIS
SEED0 = 9001


def atomic_write_text(path, text):
    """Write to a temp file in the same folder, flush to disk, then os.replace: a failed write never leaves an empty or torn JSON."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _read_resume(path):
    """Scenarios of an earlier partial run, or [] if the file is missing, empty or unreadable (a crashed run left it empty)."""
    p = Path(path)
    try:
        if p.exists() and p.stat().st_size > 0:
            return json.loads(p.read_text(encoding="utf-8"))["scenarios"]
    except (OSError, ValueError, KeyError):
        pass
    return []


def _interval_block(a):
    return dict(source="round 3 (same bootstrap and analytic interval code)",
                coverage_bootstrap=a["metrics"]["interval_coverage_bootstrap"],
                coverage_analytic_hr=a["metrics"]["interval_coverage_analytic_hr"],
                sen_bias_sd_per_decade=a["metrics"]["sen_bias_sd_per_decade"],
                checks={k: a["checks"][k] for k in ("B3", "B3a", "B4")}, floor_ok=a["floor_ok"])


def _retry(fn, arg, tries=6):
    """The laptop is shared with other jobs and numpy sometimes cannot allocate; wait and retry (same seed, same result)."""
    for k in range(tries):
        try:
            return fn(arg)
        except MemoryError:
            time.sleep(5 * (k + 1))
    return fn(arg)


def cell_job(spec):
    from . import validation_r2 as V2
    return _retry(V2.cell_family_scenario, spec)


def regional_job(spec):
    return _retry(_regional_job, spec)


def _regional_job(spec):
    sid, n, phi, noise, trend, seed = spec
    cand = regional_candidates(sid, n, phi, noise=noise, trend=trend, seed=seed)
    scen = regional_scenario(sid, n, phi, noise=noise, trend=trend, seed=seed + 500000)
    cand["interval"] = _interval_block(scen)
    return cand


def regional_specs():
    specs, k = [], 0
    for n in NS:
        for phi in NEG_PHIS:
            for trend in (0.0, TREND_SD_PER_DECADE):
                k += 1
                sid = f"R-{'trend' if trend else 'null'}-n{n}-phi{phi}"
                specs.append((sid, n, phi, "normal", trend, SEED0 + k))
    for n in NS:
        for phi in SKEW_PHIS:
            if n == 25 and phi == 0.3:
                continue          # the legacy scenario R-null-skewed-n25-phi0.3 already exists (same definition)
            k += 1
            specs.append((f"R-null-skewed-n{n}-phi{phi}", n, phi, "skewed", 0.0, SEED0 + k))
    return specs


def run_regional(out_path, workers=6):
    t0 = time.time()
    specs = regional_specs()
    res = []
    res = _read_resume(out_path)
    if res:      # resume: keep finished scenarios (same seeds, so identical to a fresh run)
        done = {s["id"] for s in res}
        specs = [sp for sp in specs if sp[0] not in done]
        n_all = len(res) + len(specs)
    else:
        n_all = len(specs)

    def dump(done):
        out = dict(run=dict(kind="R3_regional", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                            code_version=__version__, seed0=SEED0, complete=done, n_planned=n_all,
                            elapsed_seconds=round(time.time() - t0, 1)),
                   scenarios=sorted(res, key=lambda s: s["id"]))
        atomic_write_text(out_path, json.dumps(out, indent=1))
    with Pool(workers, maxtasksperchild=2) as pool:
        for s in pool.imap_unordered(regional_job, specs):
            res.append(s)
            k = "power" if s["trend_sd_per_decade"] else "size"
            print(f"[{time.time() - t0:6.0f}s] {s['id']}: " + " ".join(f"{n[:7]}={m[k]['value']:.3f}" for n, m in s["candidates"].items()), flush=True)
            dump(len(res) == n_all)
    return res


def run_cells(out_path, workers=3):
    from . import validation_r2 as V2
    t0 = time.time()
    specs, k = [], 9500
    plan = [("CB", g) for g in NEG_PHIS] + [("CD", g) for g in NEG_PHIS] + [("CD2", g) for g in SKEW_PHIS]
    for fam, g in plan:
        for hetero in (False, True):
            for truth in V2.TRUTHS:
                k += 1
                specs.append((fam, truth, g, hetero, k))
    res = []
    res = _read_resume(out_path)
    if res:
        done_ids = {x["id"] for x in res}
        specs = [sp for sp in specs if f"CF-{sp[0]}-{sp[1]}-{'het' if sp[3] else 'phi'}{sp[2]}" not in done_ids]
    n_all = len(res) + len(specs)

    def dump(done):
        out = dict(run=dict(kind="R3_cells", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                            code_version=__version__, complete=done, n_planned=n_all,
                            elapsed_seconds=round(time.time() - t0, 1),
                            het=dict(sd=V2.HET_SD, range_nonneg=V2.HET_RANGE, range_neg=V2.HET_RANGE_NEG, sigma=V2.HET_SIGMA)),
                   families={f: V2.FAMILIES[f] for f in ("CB", "CD", "CD2")}, scenarios=sorted(res, key=lambda s: s["id"]))
        atomic_write_text(out_path, json.dumps(out, indent=1))
    with Pool(workers, maxtasksperchild=4) as pool:
        for s in pool.imap_unordered(cell_job, specs):
            res.append(s)
            print(f"[{time.time() - t0:6.0f}s] {s['id']}: " + " ".join(f"{n[:6]}:{'ok' if m['B2_passed'] else 'FAIL'}" for n, m in s["candidates"].items()), flush=True)
            dump(len(res) == n_all)
    return res


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=["regional", "cells", "adaptive", "merge"], required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--res", default="out/validation/validation_results_round2.json")
    ap.add_argument("--regional")
    ap.add_argument("--cells")
    ap.add_argument("--adaptive")
    a = ap.parse_args(argv)
    if a.part == "regional":
        run_regional(a.out, a.workers)
    elif a.part == "cells":
        run_cells(a.out, a.workers)
    elif a.part == "adaptive":
        from . import validation_r3_adaptive as A
        A.run(a.res, a.out, a.workers)
    else:
        merge(a.res, a.regional, a.cells, a.adaptive, a.out)


def merge(round2, regional, cells, adaptive, out_path):
    R = json.loads(Path(round2).read_text(encoding="utf-8"))
    ids = {s["id"] for s in R["scenarios"]}
    if regional:
        Rg = json.loads(Path(regional).read_text(encoding="utf-8"))
        for s in Rg["scenarios"]:
            assert s["id"] not in ids, s["id"]
            R["scenarios"].append(s)
            ids.add(s["id"])
        R["run"]["merged_round3_regional"] = Rg["run"]
    if cells:
        C = json.loads(Path(cells).read_text(encoding="utf-8"))
        for s in C["scenarios"]:
            assert s["id"] not in ids, s["id"]
            R["scenarios"].append(s)
            ids.add(s["id"])
        for f, spec in C["families"].items():
            R.setdefault("cell_families", {}).setdefault(f, spec)
        R["run"]["merged_round3_cells"] = C["run"]
    if adaptive:
        A = json.loads(Path(adaptive).read_text(encoding="utf-8"))
        for k, v in A["cells"].items():
            if k in R["adaptive"]["cells"]:
                R["adaptive"]["cells"][k].update(v)
            else:
                R["adaptive"]["cells"][k] = v
        R["adaptive"]["seed_family"] = A["seed_family"]      # every normal-noise cell was re-run under the round-3 gate (round 2: seed family 2026)
        R["adaptive"]["note"] = "round 3: all cells re-run with the round-3 gate (negative buckets, matched skew scenarios); round-2 cells are in validation_results_round2.json"
        R["adaptive"]["generated_at"] = A["generated_at"]
        R["adaptive"]["replicates"] = A.get("replicates")
        R["run"]["merged_round3_adaptive"] = dict(generated_at=A["generated_at"], seed_family=A["seed_family"])
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
    atomic_write_text(out_path, json.dumps(R, indent=1))
    return R


if __name__ == "__main__":
    main()
