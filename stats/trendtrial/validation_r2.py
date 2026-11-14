"""Round 2 validation (rules: event_record/STATS_LOG.md "ROUND 2 (Sonnet B2)", recorded before any run).

Parts
  n23      interval coverage and Sen bias at n = 23 with a trend (R2-4), merged into the gate table
  cells    cell FDR checks at the real shapes with homogeneous and heterogeneous per-cell persistence (R2-3)
  adaptive the whole adaptive procedure (estimate phi -> scenario -> method -> test -> interval), R2-1 / R2-2
  merge    writes the single file the gate reads (round 1 file stays as validation_results_round1.json)

usage (from stats/):  python -m trendtrial.validation_r2 --part cells --workers 12 --out out/validation/r2_cells.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from scipy import stats
from scipy.ndimage import gaussian_filter

from . import __version__
from .bootstrap import residual_block_bootstrap
from .synth import ar1_series
from .trend import BATCHED_METHODS, REGIONAL_METHODS, benjamini_hochberg, boot_mk_p, mk_core, sen_ci_analytic
from .validation import (ALPHA, COVERAGE_BAR, PHIS, Q, TREND_SD_PER_DECADE, CELL_CANDS, gate_for_claim,
                         regional_scenario, _se_prop)

# family: n, ny, nx, sigma (cells), fields
FAMILIES = {
    "CC": dict(n=45, ny=21, nx=41, sigma=2.0, fields=200, note="C-C, MERRA-2 0.5 x 0.625 deg, 861 cells"),
    "CA": dict(n=25, ny=28, nx=58, sigma=4.0, fields=200, note="C-A, MODIS LST 0.25 deg, 1,624 cells"),
    "CB": dict(n=25, ny=16, nx=84, sigma=2.0, fields=200, note="C-B, IMERG aggregated to 0.5 deg (k = 5), 1,344 cells"),
    "CD": dict(n=23, ny=5, nx=6, sigma=1.0, fields=600, note="C-D provisional, Wisconsin 1 deg, 30 cells"),
}
HET_SD = 0.10
HET_RANGE = (-0.1, 0.6)
HET_SIGMA = 4.0
TRUTHS = ("none", "positive", "mixed")
CELL_FUNCS = ["mk_independent"] + CELL_CANDS


# ------------------------------------------------------------------------------------ cells with per-cell phi
def ar1_fields_phi(R, n, ny, nx, phi_map, rng, sigma=2.0, burn=30):
    """AR(1) in time with a per-cell phi map (ny, nx); spatially smoothed innovations, unit marginal variance."""
    total = n + burn
    out = np.empty((R, n, ny, nx))
    sm = (0, sigma, sigma)
    probe = gaussian_filter(rng.standard_normal((200, ny, nx)), sigma=sm, mode="wrap")
    sd = probe.std()
    phi = np.asarray(phi_map, float)[None]
    s = np.sqrt(1 - phi ** 2)
    x = gaussian_filter(rng.standard_normal((R, ny, nx)), sigma=sm, mode="wrap") / sd
    for k in range(1, total):
        e = gaussian_filter(rng.standard_normal((R, ny, nx)), sigma=sm, mode="wrap") / sd
        x = phi * x + s * e
        if k >= burn:
            out[:, k - burn] = x
    return out


def phi_map_for(g, hetero, ny, nx, rng):
    if not hetero:
        return np.full((ny, nx), float(g))
    z = gaussian_filter(rng.standard_normal((ny, nx)), HET_SIGMA, mode="wrap")
    z = (z - z.mean()) / z.std()
    return np.clip(g + HET_SD * z, *HET_RANGE)


def cell_family_scenario(spec):
    fam, truth, g, hetero, seed = spec
    f = FAMILIES[fam]
    n, ny, nx, sigma, R = f["n"], f["ny"], f["nx"], f["sigma"], f["fields"]
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    pm = phi_map_for(g, hetero, ny, nx, rng)
    F = ar1_fields_phi(R, n, ny, nx, pm, rng, sigma=sigma)
    eff = np.zeros((ny, nx))
    if truth != "none":
        sm = gaussian_filter(rng.standard_normal((ny, nx)), 2.5)
        mask = sm > np.quantile(sm, 0.70)
        mag = rng.uniform(0.3, 0.6, size=(ny, nx))
        sgn = np.ones((ny, nx))
        if truth == "mixed":
            sgn = np.where(gaussian_filter(rng.standard_normal((ny, nx)), 2.5) > 0, 1.0, -1.0)
        eff = np.where(mask, mag * sgn, 0.0)
    F = F + (eff / 10.0)[None, None] * t[None, :, None, None]
    X = F.transpose(0, 2, 3, 1).reshape(R * ny * nx, n)
    del F
    e = eff.reshape(-1)
    null_cell = e == 0
    cands = {}
    for name in CELL_FUNCS:
        r = mk_core(X, t, corr=BATCHED_METHODS[name])
        P = r["p"].reshape(R, -1)
        S = r["slope"].reshape(R, -1)
        fdp, anyr, pw = np.zeros(R), np.zeros(R), []
        for k in range(R):
            rej, _ = benjamini_hochberg(P[k], Q)
            wrong = rej & (null_cell | (np.sign(S[k]) != np.sign(e)))
            nf = rej.sum()
            fdp[k] = wrong.sum() / nf if nf else 0.0
            anyr[k] = nf > 0
            if (~null_cell).any():
                pw.append((rej & ~null_cell & (np.sign(S[k]) == np.sign(e))).sum() / (~null_cell).sum())
        m = dict(cell_size=dict(value=float((P[:, null_cell] < ALPHA).mean()) if null_cell.any() else None))
        if truth == "none":
            v = float(anyr.mean())
            m["p_any_bh_rejection"] = dict(value=v, se=_se_prop(v, R))
            passed = v <= Q + 2 * m["p_any_bh_rejection"]["se"]
        else:
            m["bh_fdr"] = dict(value=float(fdp.mean()), se=float(fdp.std(ddof=1) / np.sqrt(R)))
            m["bh_power"] = dict(value=float(np.mean(pw)), se=float(np.std(pw, ddof=1) / np.sqrt(R)))
            passed = m["bh_fdr"]["value"] <= Q + 2 * m["bh_fdr"]["se"]
        m["B2_passed"] = bool(passed)
        cands[name] = m
    tag = ("het" if hetero else "phi") + f"{g}"
    return dict(id=f"CF-{fam}-{truth}-{tag}", kind="cells", family=fam, n=n, phi=g, hetero=bool(hetero), truth=truth,
                grid=[ny, nx], fields=R, spatial_smoothing_sigma=sigma,
                phi_map=dict(mean=float(pm.mean()), sd=float(pm.std()), min=float(pm.min()), max=float(pm.max()),
                             share_above_0_1=float((pm > 0.1).mean()), share_above_0_2=float((pm > 0.2).mean())),
                candidates=cands, floor_ok=bool(R >= 200))


def run_cells(out_path, workers=3, seed=7000, families=None, phis=PHIS, only_phis=None):
    """Order: persistence ascending (the grid values that matter first), results written after every scenario."""
    t0 = time.time()
    specs = []
    k = 0
    for g in phis:
        for fam in (families or FAMILIES):
            for hetero in (False, True):
                for truth in TRUTHS:
                    k += 1
                    specs.append((fam, truth, g, hetero, seed + k))
    if only_phis is not None:   # seeds stay those of the full grid, so a split run gives the same scenarios
        specs = [sp for sp in specs if sp[2] in only_phis]
    res = []

    def dump(done):
        out = dict(run=dict(kind="R2_cells", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                            code_version=__version__, seed=seed, elapsed_seconds=round(time.time() - t0, 1), q=Q,
                            complete=done, n_planned=len(specs), het=dict(sd=HET_SD, range=HET_RANGE, sigma=HET_SIGMA)),
                   families=FAMILIES, scenarios=sorted(res, key=lambda s: s["id"]))
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(json.dumps(out, indent=1), encoding="utf-8")
    with Pool(workers, maxtasksperchild=4) as pool:
        for s in pool.imap_unordered(cell_family_scenario, specs):
            res.append(s)
            line = " ".join(f"{n[:6]}:{'ok' if m['B2_passed'] else 'FAIL'}" for n, m in s["candidates"].items())
            print(f"[{time.time() - t0:6.0f}s] {s['id']}: {line}", flush=True)
            dump(len(res) == len(specs))
    return res


# ------------------------------------------------------------------------------------ n = 23 trend intervals
def _n23_job(args):
    phi, seed = args
    return regional_scenario(f"R-trend-n23-phi{phi}", 23, phi, trend=TREND_SD_PER_DECADE, R_size=4000, R_cov=1000,
                             boot_reps=2000, seed=seed)


def run_n23(out_path, workers=6):
    t0 = time.time()
    jobs = [(phi, 301 + i) for i, phi in enumerate(PHIS)]
    with Pool(workers) as pool:
        res = pool.map(_n23_job, jobs)
    out = dict(run=dict(kind="R2_n23_trend_interval", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                        code_version=__version__, seeds=[j[1] for j in jobs], elapsed_seconds=round(time.time() - t0, 1)),
               scenarios=res)
    Path(out_path).write_text(json.dumps(out, indent=1), encoding="utf-8")
    for s in res:
        print(s["id"], {k: round(v["value"], 3) for k, v in s["metrics"].items() if k.startswith(("interval", "regional"))})
    return out


# ------------------------------------------------------------------------------------ adaptive procedure
def lag1_batch(X):
    """Lag-1 autocorrelation of OLS-detrended rows (same as pipeline._lag1, vectorised)."""
    n = X.shape[1]
    t = np.arange(n, dtype=float)
    A = np.vstack([np.ones(n), t]).T
    H = A @ np.linalg.inv(A.T @ A) @ A.T
    r = X - X @ H.T
    r = r - r.mean(axis=1, keepdims=True)
    d = (r * r).sum(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(d > 0, (r[:, :-1] * r[:, 1:]).sum(axis=1) / d, 0.0)


class GateMemo:
    """Gate decisions for the adaptive procedure, keyed by (governing phi or None, skew flag), via the real gate."""

    def __init__(self, res, n):
        self.res, self.n, self.cache = res, n, {}
        self.phis = sorted({s["phi"] for s in res["scenarios"] if s["kind"] == "regional" and s.get("n") == _nearest(res, n)})

    def bucket(self, phi_hat):
        above = [p for p in self.phis if p >= max(phi_hat, 0.0) - 1e-12]
        return above[0] if above else None

    def decide(self, bucket, skew_flag):
        key = (bucket, skew_flag)
        if key not in self.cache:
            if bucket is None:
                self.cache[key] = dict(regional_verdict_enabled=False, regional_test=None, interval_enabled=False,
                                       interval_method=None, reasons=["persistence above tested range"])
            else:
                g = gate_for_claim(self.res, self.n, bucket, False, skew=(1.0 if skew_flag else 0.0),
                                   use_adaptive=False)["gate"]
                self.cache[key] = g
        return self.cache[key]


def _nearest(res, n):
    ns = sorted({s["n"] for s in res["scenarios"] if s["kind"] == "regional"})
    return min(ns, key=lambda m: (abs(m - n), m))


def adaptive_cell(args):
    res, n, phi, trend, seed, R, Rcov = args
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    X = ar1_series(R, n, phi, rng, "normal") + (trend / 10.0) * t[None, :]
    slope_true = trend / 10.0
    phi_hat = lag1_batch(X)
    skew = stats.skew(X, axis=1)
    memo = GateMemo(res, n)
    buckets = [memo.bucket(p) for p in phi_hat]
    sflag = np.abs(skew) > 0.8
    # p-values of every batched method for every series; bootstrap candidates only where selected
    P = {m: mk_core(X, t, corr=c) for m, c in BATCHED_METHODS.items()}
    hr = P["hr_registered"]
    released = np.zeros(R, bool)
    reject = np.zeros(R, bool)
    pos_reject = np.zeros(R, bool)
    chosen = np.empty(R, dtype=object)
    imethod = np.empty(R, dtype=object)
    for i in range(R):
        g = memo.decide(buckets[i], bool(sflag[i]))
        if g["regional_verdict_enabled"]:
            m = g["regional_test"]
            released[i] = True
            chosen[i] = m
            imethod[i] = g["interval_method"] if g["interval_enabled"] else None
            if m in P:
                p = P[m]["p"][i]
                sl = P[m]["slope"][i]
            else:
                p = boot_mk_p(X[i], t, int(m.rsplit("L", 1)[1]), 499, seed=int(seed * 7919 + i))
                sl = hr["slope"][i]
            reject[i] = bool(p < ALPHA)
            pos_reject[i] = bool(p < ALPHA and sl > 0)
        else:
            chosen[i] = "withheld"
            imethod[i] = None
    # intervals on the first Rcov series
    cov, width, shown_i = [], [], 0
    for i in range(min(R, Rcov)):
        if not released[i] or imethod[i] is None:
            continue
        shown_i += 1
        x = X[i]
        if imethod[i] == "bootstrap":
            b = residual_block_bootstrap(x, t, None, block_len=3, reps=2000, seed=int(seed * 100003 + i))
            lo, hi = b["slope_ci"]
        else:
            lo, hi = sen_ci_analytic(x, t, float(hr["var_s"][i]))
        cov.append(lo <= slope_true <= hi)
        width.append((hi - lo) * 10)

    def prop(k, N):
        v = k / N if N else None
        return dict(value=None if v is None else float(v), se=_se_prop(v, N) if N else None, R=int(N))
    nrel = int(released.sum())
    out = dict(n=n, true_phi=phi, trend_sd_per_decade=trend, R=R, R_cov=int(min(R, Rcov)),
               release_rate=prop(nrel, R),
               reject_unconditional=prop(int(reject.sum()), R),
               reject_given_release=prop(int(reject.sum()), nrel),
               positive_reject_unconditional=prop(int(pos_reject.sum()), R),
               positive_reject_given_release=prop(int(pos_reject.sum()), nrel),
               interval_shown_rate=prop(shown_i, int(min(R, Rcov))),
               interval_coverage_given_shown=prop(int(np.sum(cov)), len(cov)) if cov else dict(value=None, se=None, R=0),
               interval_mean_width_sd_per_decade=float(np.mean(width)) if width else None,
               phi_hat_mean=float(phi_hat.mean()), phi_hat_sd=float(phi_hat.std()),
               share_skew_flag=float(sflag.mean()))
    bk = {}
    for b in sorted({str(x) for x in buckets}):
        idx = np.array([str(x) == b for x in buckets])
        rel_b = released & idx
        bk[b] = dict(count=int(idx.sum()), share=float(idx.mean()), released=int(rel_b.sum()),
                     reject_given_bucket=prop(int((reject & idx).sum()), int(idx.sum())))
    out["buckets"] = bk
    sel = {}
    for m in list(REGIONAL_METHODS) + ["withheld"]:
        c = int(np.sum(chosen == m))
        if c:
            sel[m] = c / R
    out["selected_share"] = sel
    im = {}
    for m in ("bootstrap", "analytic_hr"):
        c = int(np.sum(imethod == m))
        if c:
            im[m] = c
    out["interval_method_counts"] = im
    return out


def run_adaptive(res_path, out_path, workers=12, seed=2026, R=4000, Rcov=1000):
    t0 = time.time()
    res = json.loads(Path(res_path).read_text(encoding="utf-8"))
    jobs, k = [], 0
    for n in (23, 25, 45):
        for phi in PHIS:
            for trend in (0.0, TREND_SD_PER_DECADE):
                k += 1
                jobs.append((res, n, phi, trend, seed * 100 + k, R, Rcov))
    cells = {}
    with Pool(workers) as pool:
        for o in pool.imap_unordered(adaptive_cell, jobs):
            key = f"n{o['n']}-phi{o['true_phi']}"
            cells.setdefault(key, {})["trend" if o["trend_sd_per_decade"] else "null"] = o
            kind = "trend" if o["trend_sd_per_decade"] else "null"
            print(f"[{time.time() - t0:6.0f}s] {key} {kind}: release {o['release_rate']['value']:.3f} "
                  f"rej_uncond {o['reject_unconditional']['value']:.4f} rej|rel {o['reject_given_release']['value']} "
                  f"cov {o['interval_coverage_given_shown']['value']}", flush=True)
    out = dict(kind="adaptive_procedure_validation", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
               code_version=__version__, seed_family=seed, replicates=dict(series=R, coverage=Rcov, bootstrap_reps=2000),
               bars=dict(AP1="unconditional size <= 0.05 + 2 SE at the claim's own (n, phi)",
                         AP2="power reported, no bar", AP3="selected-interval coverage given shown >= 0.90 (null and trend)"),
               elapsed_seconds=round(time.time() - t0, 1), cells=cells)
    Path(out_path).write_text(json.dumps(out, indent=1), encoding="utf-8")
    return out


# ------------------------------------------------------------------------------------ merge
def merge(round1, n23, cells, adaptive, out_path):
    R1 = json.loads(Path(round1).read_text(encoding="utf-8"))
    N = json.loads(Path(n23).read_text(encoding="utf-8")) if n23 else None
    C = json.loads(Path(cells).read_text(encoding="utf-8")) if cells else None
    A = json.loads(Path(adaptive).read_text(encoding="utf-8")) if adaptive else None
    idx = {s["id"]: s for s in R1["scenarios"]}
    if N:
        for s in N["scenarios"]:
            tgt = idx.get(s["id"])
            m = s["metrics"]
            tgt["interval"] = dict(source="round 2 (n = 23 trend scenario, same bootstrap and analytic interval code)",
                                   coverage_bootstrap=m["interval_coverage_bootstrap"],
                                   coverage_analytic_hr=m["interval_coverage_analytic_hr"],
                                   sen_bias_sd_per_decade=m["sen_bias_sd_per_decade"],
                                   checks={k: s["checks"][k] for k in ("B3", "B3a", "B4")}, floor_ok=s["floor_ok"])
        R1["run"]["merged_round2_n23"] = N["run"]
    if C:
        R1["scenarios"] += C["scenarios"]
        R1["cell_families"] = C["families"]
        R1["run"]["merged_round2_cells"] = C["run"]
    if A:
        R1["adaptive"] = A
        R1["run"]["merged_round2_adaptive"] = dict(generated_at=A["generated_at"], seed_family=A["seed_family"])
    fails = []
    for s in R1["scenarios"]:
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
    R1["summary"] = dict(n_scenarios=len(R1["scenarios"]), failures=fails)
    Path(out_path).write_text(json.dumps(R1, indent=1), encoding="utf-8")
    return R1


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=["n23", "cells", "adaptive", "merge"], required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--res", default="out/validation/validation_results.json")
    ap.add_argument("--n23")
    ap.add_argument("--cells")
    ap.add_argument("--adaptive")
    ap.add_argument("--families", default=None)
    ap.add_argument("--phis", default=None, help="comma list of true phi values (cells part)")
    a = ap.parse_args(argv)
    if a.part == "n23":
        run_n23(a.out, a.workers)
    elif a.part == "cells":
        run_cells(a.out, a.workers, families=a.families.split(",") if a.families else None,
                  only_phis=[float(x) for x in a.phis.split(",")] if a.phis else None)
    elif a.part == "adaptive":
        run_adaptive(a.res, a.out, a.workers)
    else:
        merge(a.res, a.n23, a.cells, a.adaptive, a.out)


if __name__ == "__main__":
    main()
