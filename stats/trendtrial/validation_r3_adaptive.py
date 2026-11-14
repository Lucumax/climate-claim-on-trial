"""Round 3 adaptive-procedure runs (STATS_LOG R3-4): negative true persistence (normal noise) and skewed noise over the full grid."""
from __future__ import annotations

import datetime as dt
import json
import time
from multiprocessing import Pool
from pathlib import Path

from . import __version__
from .validation import PHIS, TREND_SD_PER_DECADE
from .validation_r2 import adaptive_cell
from .validation_r3 import NEG_PHIS, SKEW_PHIS, _retry, atomic_write_text

SEED_FAMILY = 2027


def _job(args):
    return _retry(adaptive_cell, args)


def run(res_path, out_path, workers=4, R=4000, Rcov=1000):
    t0 = time.time()
    res = json.loads(Path(res_path).read_text(encoding="utf-8"))
    jobs, k = [], 0
    # R3-4 asks for the negative phis (normal) and the skewed grid. The normal phi >= 0 cells are also re-run here (seed family 2027,
    # new gate) because the release logic changed for series with a negative phi_hat, so the round-2 cells no longer describe the real procedure.
    for noise, phis in (("normal", SKEW_PHIS), ("skewed", SKEW_PHIS)):
        for n in (23, 25, 45):
            for phi in phis:
                for trend in (0.0, TREND_SD_PER_DECADE):
                    k += 1
                    jobs.append((res, n, phi, trend, SEED_FAMILY * 100 + k, R, Rcov, noise))
    cells = {}
    with Pool(workers, maxtasksperchild=3) as pool:
        for o in pool.imap_unordered(_job, jobs):
            key = f"n{o['n']}-phi{o['true_phi']}" + ("-skewed" if o["noise"] == "skewed" else "")
            kind = "trend" if o["trend_sd_per_decade"] else "null"
            cells.setdefault(key, {})[kind] = o
            print(f"[{time.time() - t0:6.0f}s] {key} {kind}: release {o['release_rate']['value']:.3f} "
                  f"rej_uncond {o['reject_unconditional']['value']:.4f} rej|rel {o['reject_given_release']['value']} "
                  f"cov {o['interval_coverage_given_shown']['value']}", flush=True)
    out = dict(kind="adaptive_procedure_validation_round3", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
               code_version=__version__, seed_family=SEED_FAMILY, replicates=dict(series=R, coverage=Rcov, bootstrap_reps=2000),
               bars=dict(AP1="unconditional size <= 0.05 + 2 SE at the claim's own (n, phi, noise)", AP2="power reported, no bar",
                         AP3="selected-interval coverage given shown >= 0.90 (null and trend)"),
               elapsed_seconds=round(time.time() - t0, 1), cells=cells)
    atomic_write_text(out_path, json.dumps(out, indent=1))
    return out
