"""WP3 validation harness (shipped method only) and the gate that turns results into browser-honoured flags.

Pass bars were recorded in event_record/STATS_LOG.md BEFORE the first run:
  B1 regional size within 0.05 +/- 2 SE (too liberal disables the regional verdict; too conservative is only flagged)
  B2 BH FDR <= q + 2 SE (mixed truth, mixed sign) and P(any rejection) <= q + 2 SE under the global null
  B3 bootstrap interval coverage of the true slope >= 0.90 (nominal 95%)
  B4 |Sen bias| <= 2 SE
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter

from . import __version__
from .bootstrap import residual_block_bootstrap
from .synth import ar1_fields, ar1_series
from .trend import benjamini_hochberg, mk_core, ols, sen_ci_analytic

ALPHA = 0.05
Q = 0.10
COVERAGE_BAR = 0.90
REPLICATE_FLOORS = dict(regional_size=4000, regional_cov=1000, cells_fields=200)
PHIS = (0.0, 0.1, 0.2, 0.3, 0.45, 0.6)
NS = (23, 25, 45)
TREND_SD_PER_DECADE = 0.3
B4_FLOOR_SD = 0.025


def _se_prop(p, R):
    return float(np.sqrt(max(p * (1 - p), 1e-12) / R))


def regional_scenario(sid, n, phi, noise="normal", gap_frac=0.0, trend=0.0, R_size=4000, R_cov=1000,
                      boot_reps=2000, block_len=3, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    slope_true = trend / 10.0  # SD per year

    def make(R):
        x = ar1_series(R, n, phi, rng, noise) + slope_true * t[None, :]
        if gap_frac > 0:
            x = np.where(rng.random(x.shape) < gap_frac, np.nan, x)
        return x

    X = make(R_size)
    hr = mk_core(X, t, hr=True)
    m0 = mk_core(X, t, hr=False)
    ok = np.isfinite(hr["p"])
    sig_hr = (hr["p"][ok] < ALPHA)
    sig_m0 = (m0["p"][ok] < ALPHA)
    ols_sig = np.array([ols(x, t)["p"] < ALPHA for x in X[:1500]])
    metrics = {}
    key = "regional_size" if trend == 0 else "regional_power"
    p_hr = float(sig_hr.mean())
    metrics[key] = dict(value=p_hr, se=_se_prop(p_hr, len(sig_hr)), R=int(len(sig_hr)))
    p0 = float(sig_m0.mean())
    metrics[key + "_mk_independent"] = dict(value=p0, se=_se_prop(p0, len(sig_m0)))
    po = float(ols_sig.mean())
    metrics[key + "_ols"] = dict(value=po, se=_se_prop(po, len(ols_sig)), R=int(len(ols_sig)))
    bias = (hr["slope"][ok] - slope_true) * 10.0
    metrics["sen_bias_sd_per_decade"] = dict(value=float(bias.mean()), se=float(bias.std(ddof=1) / np.sqrt(len(bias))))
    # coverage
    Xc = make(R_cov)
    mkc = mk_core(Xc, t, hr=True)
    cov_b, cov_a, width_b = [], [], []
    for i in range(R_cov):
        x = Xc[i]
        if np.isfinite(x).sum() < 8:
            continue
        b = residual_block_bootstrap(x, t, None, block_len=block_len, reps=boot_reps, seed=int(seed * 100003 + i))
        lo, hi = b["slope_ci"]
        cov_b.append(lo <= slope_true <= hi)
        width_b.append((hi - lo) * 10)
        lo2, hi2 = sen_ci_analytic(x, t, float(mkc["var_s"][i]))
        cov_a.append(lo2 <= slope_true <= hi2)
    cb, ca = float(np.mean(cov_b)), float(np.mean(cov_a))
    metrics["interval_coverage_bootstrap"] = dict(value=cb, se=_se_prop(cb, len(cov_b)), R=len(cov_b),
                                                  mean_width_sd_per_decade=float(np.mean(width_b)))
    metrics["interval_coverage_analytic_hr"] = dict(value=ca, se=_se_prop(ca, len(cov_a)))
    # checks
    checks = {}
    if trend == 0:
        se = metrics[key]["se"]
        lo, hi = ALPHA - 2 * se, ALPHA + 2 * se
        side = "ok" if lo <= p_hr <= hi else ("liberal" if p_hr > hi else "conservative")
        checks["B1"] = dict(passed=side != "liberal", within_band=side == "ok", side=side, band=[lo, hi])
    se = metrics["sen_bias_sd_per_decade"]["se"]
    checks["B4"] = dict(passed=abs(metrics["sen_bias_sd_per_decade"]["value"]) <= 2 * se, bar=2 * se)
    checks["B3"] = dict(passed=cb >= COVERAGE_BAR, bar=COVERAGE_BAR, method="residual block bootstrap")
    checks["B3a"] = dict(passed=ca >= COVERAGE_BAR, bar=COVERAGE_BAR, method="analytic Sen CI with Hamed-Rao variance")
    floor_ok = metrics[key]["R"] >= REPLICATE_FLOORS["regional_size"] * (1 - gap_frac * 0 - 0.01) and \
        len(cov_b) >= REPLICATE_FLOORS["regional_cov"] * 0.95
    return dict(id=sid, kind="regional", n=n, phi=phi, noise=noise, gap_frac=gap_frac,
                trend_sd_per_decade=trend, R_size=R_size, R_cov=R_cov, boot_reps=boot_reps, block_len=block_len,
                metrics=metrics, checks=checks, floor_ok=bool(floor_ok))


def cells_scenario(sid, phi, truth="none", n=25, ny=20, nx=20, R=200, seed=2, sigma=2.0):
    """truth: none | positive | mixed. 30% of cells carry a trend of 0.3-0.6 SD/decade."""
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    F = ar1_fields(R, n, ny, nx, phi, rng, sigma=sigma)           # (R, n, ny, nx)
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
    hr = mk_core(X, t, hr=True)
    m0 = mk_core(X, t, hr=False)
    P3 = hr["p"].reshape(R, -1)
    P1 = m0["p"].reshape(R, -1)
    S3 = hr["slope"].reshape(R, -1)
    e = eff.reshape(-1)
    null_cell = e == 0
    fdp = np.zeros(R)
    any_rej = np.zeros(R)
    power = []
    nflag = np.zeros(R)
    for r in range(R):
        rej, _ = benjamini_hochberg(P3[r], Q)
        wrong = rej & (null_cell | (np.sign(S3[r]) != np.sign(e)))
        nf = rej.sum()
        nflag[r] = nf
        fdp[r] = wrong.sum() / nf if nf else 0.0
        any_rej[r] = nf > 0
        if (~null_cell).any():
            power.append((rej & ~null_cell & (np.sign(S3[r]) == np.sign(e))).sum() / (~null_cell).sum())
    metrics = {}
    if (~null_cell).any():
        metrics["bh_fdr"] = dict(value=float(fdp.mean()), se=float(fdp.std(ddof=1) / np.sqrt(R)), R=R)
        metrics["bh_power"] = dict(value=float(np.mean(power)), se=float(np.std(power, ddof=1) / np.sqrt(R)))
        tc = ~null_cell
        metrics["cell_power_rung3"] = dict(value=float(((P3[:, tc] < ALPHA) & (np.sign(S3[:, tc]) == np.sign(e[tc]))).mean()), se=None)
        bias = (S3[:, tc] - e[tc][None]/10.0) * 10.0
        metrics["sen_bias_sd_per_decade"] = dict(value=float(bias.mean()), se=float(bias.mean(axis=1).std(ddof=1) / np.sqrt(R)))
    if null_cell.any():
        metrics["cell_size_rung1"] = dict(value=float((P1[:, null_cell] < ALPHA).mean()), se=None)
        metrics["cell_size_rung3"] = dict(value=float((P3[:, null_cell] < ALPHA).mean()), se=None)
    if truth == "none":
        v = float(any_rej.mean())
        metrics["p_any_bh_rejection"] = dict(value=v, se=_se_prop(v, R), R=R)
    checks = {}
    if truth == "none":
        m = metrics["p_any_bh_rejection"]
        checks["B2"] = dict(passed=m["value"] <= Q + 2 * m["se"], bar=Q + 2 * m["se"], what="P(any rejection)")
    else:
        m = metrics["bh_fdr"]
        checks["B2"] = dict(passed=m["value"] <= Q + 2 * m["se"], bar=Q + 2 * m["se"], what="FDR")
    return dict(id=sid, kind="cells", n=n, phi=phi, truth=truth, grid=[ny, nx], fields=R, spatial_smoothing_sigma=sigma,
                metrics=metrics, checks=checks, floor_ok=bool(R >= REPLICATE_FLOORS["cells_fields"]))


def run_all(out_path, quick=False, seed=11):
    t0 = time.time()
    Rs, Rc, Rf = (400, 100, 30) if quick else (4000, 1000, 200)
    boot_reps = 300 if quick else 2000
    scen = []

    def add(s):
        scen.append(s)
        print(f"[{time.time() - t0:6.0f}s] {s['id']}: " + ", ".join(
            f"{k}={v['value']:.3f}" for k, v in s["metrics"].items() if k in
            ("regional_size", "regional_power", "interval_coverage_bootstrap", "bh_fdr", "p_any_bh_rejection")), flush=True)
    k = 0
    for n in NS:
        for phi in PHIS:
            k += 1
            add(regional_scenario(f"R-null-n{n}-phi{phi}", n, phi, R_size=Rs, R_cov=Rc, boot_reps=boot_reps, seed=seed + k))
    k += 1
    add(regional_scenario("R-null-skewed-n25-phi0.3", 25, 0.3, noise="skewed", R_size=Rs, R_cov=Rc, boot_reps=boot_reps, seed=seed + k))
    k += 1
    add(regional_scenario("R-null-gaps-n25-phi0.3", 25, 0.3, gap_frac=0.12, R_size=Rs, R_cov=Rc, boot_reps=boot_reps, seed=seed + k))
    for n in (25, 45):
        for phi in PHIS:
            k += 1
            add(regional_scenario(f"R-trend-n{n}-phi{phi}", n, phi, trend=TREND_SD_PER_DECADE, R_size=Rs, R_cov=Rc,
                                  boot_reps=boot_reps, seed=seed + k))
    for phi in PHIS:
        for truth in ("none", "positive", "mixed"):
            k += 1
            add(cells_scenario(f"C-{truth}-phi{phi}", phi, truth, R=Rf, seed=seed + k))
    res = dict(
        run=dict(generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"), code_version=__version__,
                 quick=quick, seed=seed, elapsed_seconds=round(time.time() - t0, 1), q=Q, alpha=ALPHA,
                 replicate_floors=REPLICATE_FLOORS, bars=dict(B1="size within 0.05 +/- 2SE (liberal side disables regional verdict)",
                                                              B2="FDR <= q + 2SE; P(any rejection) <= q + 2SE under global null",
                                                              B3="bootstrap interval coverage >= 0.90", B4="|Sen bias| <= 2SE")),
        scenarios=scen)
    fails = [(s["id"], b) for s in scen for b, c in s["checks"].items() if not c["passed"]]
    cons = [s["id"] for s in scen if s["checks"].get("B1", {}).get("side") == "conservative"]
    res["summary"] = dict(n_scenarios=len(scen), failures=[f"{a}:{b}" for a, b in fails], conservative_size=cons,
                          all_floors_ok=all(s["floor_ok"] for s in scen))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(res, indent=1), encoding="utf-8")
    print("summary:", res["summary"])
    return res


# ---------------------------------------------------------------- run B: candidate tests (WP0 method addendum 2)

from .trend import BATCHED_METHODS, REGIONAL_METHODS, boot_mk_p  # noqa: E402

CAND_ORDER = list(REGIONAL_METHODS)
CELL_CANDS = ["hr_registered", "hr_all_lags", "yue_wang", "tfpw"]
R_BATCH, R_BOOT = 4000, 2000


def regional_candidates(sid, n, phi, noise="normal", gap_frac=0.0, trend=0.0, R=R_BATCH, Rb=R_BOOT, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    slope_true = trend / 10.0
    x = ar1_series(R, n, phi, rng, noise) + slope_true * t[None, :]
    if gap_frac > 0:
        x = np.where(rng.random(x.shape) < gap_frac, np.nan, x)
    key = "power" if trend else "size"
    cands = {}
    for name in CAND_ORDER:
        if name in BATCHED_METHODS:
            p = mk_core(x, t, corr=BATCHED_METHODS[name])["p"]
            p = p[np.isfinite(p)]
        else:
            L = int(name.rsplit("L", 1)[1])
            p = np.array([boot_mk_p(x[i], t, L, 499, seed=int(seed * 7919 + i)) for i in range(Rb)])
            p = p[np.isfinite(p)]
        v = float((p < ALPHA).mean())
        cands[name] = {key: dict(value=v, se=_se_prop(v, len(p)), R=int(len(p)))}
    checks = {}
    if not trend:
        for name, m in cands.items():
            se = m["size"]["se"]
            lo, hi = ALPHA - 2 * se, ALPHA + 2 * se
            v = m["size"]["value"]
            side = "ok" if lo <= v <= hi else ("liberal" if v > hi else "conservative")
            checks[name] = dict(passed=side != "liberal", side=side, band=[lo, hi])
    return dict(id=sid, kind="regional", n=n, phi=phi, noise=noise, gap_frac=gap_frac, trend_sd_per_decade=trend,
                candidates=cands, size_checks=checks,
                floor_ok=bool(all(m[key]["R"] >= (R if nm in BATCHED_METHODS else Rb) * 0.98 for nm, m in cands.items())))


def cells_candidates(sid, phi, truth, n=25, ny=20, nx=20, R=200, seed=2, sigma=2.0):
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=float)
    F = ar1_fields(R, n, ny, nx, phi, rng, sigma=sigma)
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
    e = eff.reshape(-1)
    null_cell = e == 0
    cands = {}
    for name in ["mk_independent"] + CELL_CANDS:
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
    return dict(id=sid, kind="cells", n=n, phi=phi, truth=truth, grid=[ny, nx], fields=R,
                spatial_smoothing_sigma=sigma, candidates=cands, floor_ok=bool(R >= REPLICATE_FLOORS["cells_fields"]))


def run_all_b(out_path, quick=False, seed=101):
    t0 = time.time()
    R, Rb, Rf = (400, 100, 30) if quick else (R_BATCH, R_BOOT, 200)
    scen = []

    def add(s):
        scen.append(s)
        if s["kind"] == "regional":
            k = "power" if s["trend_sd_per_decade"] else "size"
            line = " ".join(f"{n[:7]}={m[k]['value']:.3f}" for n, m in s["candidates"].items())
        else:
            line = " ".join(f"{n[:7]}:{'ok' if m['B2_passed'] else 'FAIL'}" for n, m in s["candidates"].items())
        print(f"[{time.time() - t0:6.0f}s] {s['id']}: {line}", flush=True)
    k = 0
    for n in NS:
        for phi in PHIS:
            k += 1
            add(regional_candidates(f"R-null-n{n}-phi{phi}", n, phi, R=R, Rb=Rb, seed=seed + k))
            k += 1
            add(regional_candidates(f"R-trend-n{n}-phi{phi}", n, phi, trend=TREND_SD_PER_DECADE, R=R, Rb=Rb, seed=seed + k))
    k += 1
    add(regional_candidates("R-null-skewed-n25-phi0.3", 25, 0.3, noise="skewed", R=R, Rb=Rb, seed=seed + k))
    k += 1
    add(regional_candidates("R-null-gaps-n25-phi0.3", 25, 0.3, gap_frac=0.12, R=R, Rb=Rb, seed=seed + k))
    for phi in PHIS:
        for truth in ("none", "positive", "mixed"):
            k += 1
            add(cells_candidates(f"C-{truth}-phi{phi}", phi, truth, R=Rf, seed=seed + k))
    res = dict(run=dict(kind="B_candidates", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                        code_version=__version__, quick=quick, seed=seed, elapsed_seconds=round(time.time() - t0, 1),
                        q=Q, alpha=ALPHA, candidates=CAND_ORDER, cell_candidates=CELL_CANDS,
                        replicates=dict(batched=R, bootstrap_mk=Rb, bootstrap_mk_resamples=499, cells_fields=Rf)),
               scenarios=scen)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(res, indent=1), encoding="utf-8")
    return res


def finalize_with_run_a(b_path, a_path, out_path):
    """Merge run A's interval, Sen-bias and coverage results (unchanged method) into run B scenarios."""
    B = json.loads(Path(b_path).read_text(encoding="utf-8"))
    A = json.loads(Path(a_path).read_text(encoding="utf-8"))
    ai = {s["id"]: s for s in A["scenarios"] if s["kind"] == "regional"}
    for s in B["scenarios"]:
        if s["kind"] == "regional" and s["id"] in ai:
            a = ai[s["id"]]
            s["interval"] = dict(source="run A (same bootstrap and analytic interval code)",
                                 coverage_bootstrap=a["metrics"]["interval_coverage_bootstrap"],
                                 coverage_analytic_hr=a["metrics"]["interval_coverage_analytic_hr"],
                                 sen_bias_sd_per_decade=a["metrics"]["sen_bias_sd_per_decade"],
                                 checks={k: a["checks"][k] for k in ("B3", "B3a", "B4")}, floor_ok=a["floor_ok"])
    B["run"]["merged_run_a"] = dict(file=str(a_path), generated_at=A["run"]["generated_at"], seed=A["run"]["seed"])
    fails = []
    for s in B["scenarios"]:
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
    B["summary"] = dict(n_scenarios=len(B["scenarios"]), failures=fails)
    Path(out_path).write_text(json.dumps(B, indent=1), encoding="utf-8")
    return B


# ---------------------------------------------------------------- gate

def _b4_ok(v):
    b = v.get("sen_bias_sd_per_decade")
    if b and b.get("value") is not None and b.get("se") is not None:
        return abs(b["value"]) <= max(3 * b["se"], B4_FLOOR_SD)
    return bool(v["checks"]["B4"]["passed"])


def _nearest_n(res, n):
    ns = sorted({s["n"] for s in res["scenarios"] if s["kind"] == "regional"})
    return min(ns, key=lambda m: (abs(m - n), m))


def pick_cell_family(res, n_years, n_cells):
    """Round 2 (STATS_LOG R2-3): the cell-validation family whose n is nearest (within 5) and whose cell count is nearest."""
    import math
    fams = res.get("cell_families") or {}
    best = None
    for name, f in fams.items():
        if abs(f["n"] - n_years) > 5:
            continue
        key = (abs(f["n"] - n_years), abs(math.log(max(f["ny"] * f["nx"], 1) / max(n_cells, 1))))
        if best is None or key < best[0]:
            best = (key, name)
    return best[1] if best else None


def governing_buckets(phis, phi_hat):
    """Round 3 (STATS_LOG R3-1). Governing persistence buckets for an estimated detrended lag-1 phi_hat, primary (nearest) first.
    phi_hat >= 0, or a table without negative buckets: the smallest tested phi not below max(phi_hat, 0) (old rule).
    phi_hat < 0 with negative buckets tested: the two tested values that bracket phi_hat (below the lowest only that one)."""
    phis = sorted(phis)
    if phi_hat >= 0 or not any(p < 0 for p in phis):
        above = [p for p in phis if p >= max(phi_hat, 0.0) - 1e-12]
        return [above[0]] if above else []
    lower = [p for p in phis if p <= phi_hat + 1e-12]
    upper = [p for p in phis if p >= phi_hat - 1e-12]
    govs = sorted({x for x in ((max(lower) if lower else None), (min(upper) if upper else None)) if x is not None})
    primary = min(govs, key=lambda p: (abs(p - phi_hat), abs(p)))
    return [primary] + [g for g in govs if g != primary]


def _scenario_label(sid):
    """Plain-language label of a regional null scenario id."""
    import re
    m = re.match(r"R-null-(skewed-|gaps-)?n(\d+)-phi(-?[0-9.]+)$", sid)
    if not m:
        return sid
    kind, n, phi = m.group(1), m.group(2), float(m.group(3))
    noise = {"skewed-": "lopsided noise (skewness 2)", "gaps-": "12% of years missing"}.get(kind, "symmetric noise")
    return f"{noise}, {n} seasons, persistence {phi:g}"


def explain_no_passer(sc, ids_null, bar_cands):
    """Round 3 (R3-2): the withheld reason, written from the scenarios that actually failed, never from a fixed sentence."""
    ref = "yue_wang"
    rows, bad_kinds, bad = [], set(), []
    for i in ids_null:
        ch = sc[i]["size_checks"]
        n_bad = sum(1 for c in bar_cands if not ch[c]["passed"])
        sz = sc[i]["candidates"][ref]["size"]
        side = ch[ref]["side"]
        rows.append(f"{_scenario_label(i)}: Yue-Wang {100 * sz['value']:.1f}% ({'too many false alarms' if side == 'liberal' else ('too few false alarms' if side == 'conservative' else 'within the bar')}; "
                    f"{n_bad} of {len(bar_cands)} candidate tests gave too many false alarms)")
        if n_bad:
            bad.append(i)
            bad_kinds.add("skew" if "-skewed-" in i else ("gaps" if "-gaps-" in i else "dependence"))
    if not bad_kinds:
        driver = "none"
    elif bad_kinds == {"skew"}:
        driver = "skew"
    elif bad_kinds == {"gaps"}:
        driver = "gaps"
    elif "dependence" in bad_kinds and len(bad_kinds) == 1:
        driver = "dependence"
    else:
        driver = "+".join(sorted(bad_kinds))
    lead = {"skew": "The tests kept their size with symmetric noise at this length and persistence; they failed only where the noise was lopsided.",
            "dependence": "The tests failed already with symmetric noise at this length and persistence, so the cause is the dependence between years (with so few years), not lopsidedness.",
            "gaps": "The tests failed only in the scenario with missing years.",
            "none": "Every scenario passed for at least one test, but no single test passed in all of them."}.get(driver, "More than one condition failed: " + ", ".join(sorted(bad_kinds)) + ".")
    text = ("No candidate regional test kept its false-positive rate within 0.05 +/- 2 SE in every simulation matched to this series. " + lead +
            " Sizes of Yue-Wang (the best-calibrated candidate; share of trendless synthetic series called significant, intended 5%): " + "; ".join(rows) + ".")
    return text, driver


def gate_for_claim(res, n_years, phi_hat, has_gaps, q=Q, skew=None, n_cells=None, use_adaptive=True, govs=None):
    """Turn validation results into browser-honoured flags and the shipped tests for one claim (rules: STATS_LOG
    addendum 2 and round 2: R2-2 adaptive-procedure bars, R2-3 cell families)."""
    sc = {s["id"]: s for s in res["scenarios"]}
    n_gov = _nearest_n(res, n_years)
    phis = sorted({s["phi"] for s in res["scenarios"] if s["kind"] == "regional" and s["n"] == n_gov})
    reasons, gov, flags = [], [], []
    base = dict(status="run", results_run=res.get("run"), results_summary=res.get("summary"))
    govs = list(govs) if govs else governing_buckets(phis, phi_hat)
    off = dict(regional_verdict_enabled=False, interval_enabled=False, interval_method=None, cells_enabled=False,
               cells_mode="off", regional_test=None, cell_test=None, reasons_blocking_verdict=reasons,
               conservative_flags=flags, governing=gov)
    if not govs:
        reasons.append(f"persistence in this series (lag-1 {phi_hat:.2f}) is above the tested range")
        return dict(base, gate=off)
    phi_gov = govs[0]
    has_neg = any(p < 0 for p in phis)
    bucket_rule = ("estimated lag-1 is negative: governed by the two tested values that bracket it (" + " and ".join(f"{g:g}" for g in govs) + ")"
                   if phi_hat < 0 and has_neg and len(govs) > 1 else
                   ("estimated lag-1 is negative: governed by the lowest tested value, " + f"{phi_gov:g}" if phi_hat < 0 and has_neg else
                    ("estimated lag-1 is negative but this validation table has no negative buckets: rounded up to 0 (old rule)" if phi_hat < 0 else
                     f"smallest tested persistence not below the estimate: {phi_gov:g}")))
    ids_null = [f"R-null-n{n_gov}-phi{g}" for g in govs]
    if has_gaps:
        ids_null.append("R-null-gaps-n25-phi0.3")
    skew_matched = False
    if skew is not None and abs(skew) > 0.8:
        matched = [f"R-null-skewed-n{n_gov}-phi{g}" for g in govs]
        if all(i in sc for i in matched):
            ids_null += matched
            skew_matched = True
        else:
            ids_null.append("R-null-skewed-n25-phi0.3")
    tr_ids = [f"R-trend-n{n_gov}-phi{g}" for g in govs]
    tr_id = tr_ids[0]
    for sid in ids_null + tr_ids:
        if sid not in sc:
            reasons.append(f"no validation scenario {sid}")
            return dict(base, gate=off)
        gov.append(sid)
    passers = [c for c in CAND_ORDER if all(sc[i]["size_checks"][c]["passed"] and sc[i]["floor_ok"] for i in ids_null)]
    chosen = None
    if passers:
        pw = {c: sc[tr_id]["candidates"][c]["power"] for c in passers}
        best = max(pw.values(), key=lambda m: m["value"])
        for c in passers:  # earlier candidate wins within 0.5 SE of the best power
            if pw[c]["value"] >= best["value"] - 0.5 * best["se"]:
                chosen = c
                break
    interval = [sc[i].get("interval") for i in ids_null + tr_ids]
    if any(v is None for v in interval):
        reasons.append("interval and Sen-bias results missing for a governing scenario")
        return dict(base, gate=off)
    # bar B4 as amended before C-A, C-B, C-D were run (WP0 registration, "Bar B4 amended"): pass if |bias| <= 3 SE or <= 0.025 SD/decade
    bias_ok = all(_b4_ok(v) for v in interval)
    int_ok = all(v["checks"]["B3"]["passed"] for v in interval)
    int_ok_a = all(v["checks"]["B3a"]["passed"] for v in interval)
    reason_driver = None
    if chosen is None:
        txt, reason_driver = explain_no_passer(sc, ids_null, CAND_ORDER)
        reasons.append(txt)
    if not bias_ok:
        reasons.append("Sen slope biased in a governing scenario")
    for i in ids_null:
        v = sc[i]["size_checks"].get(chosen)
        if v and v["side"] == "conservative":
            sz = sc[i]["candidates"][chosen]["size"]["value"]
            pw_ = sc[tr_id]["candidates"][chosen]["power"]["value"]
            flags.append(f"the chosen test is conservative in simulations matched to this series ({_scenario_label(i)}): it called a trend in "
                         f"{100 * sz:.1f}% of trendless synthetic series (intended 5%), and in the matching trend scenario it found a "
                         f"0.3 SD per decade trend in {100 * pw_:.0f}% of series. A non-significant result carries little weight here.")
    interval_table = {
        "bootstrap": dict(passed=bool(int_ok), coverage_by_scenario={i: sc[i]["interval"].get("coverage_bootstrap") for i in ids_null + tr_ids}),
        "analytic_hr": dict(passed=bool(int_ok_a), coverage_by_scenario={i: sc[i]["interval"].get("coverage_analytic_hr") for i in ids_null + tr_ids}),
    }
    adaptive, adaptive_notes, ap_interval_ok = None, [], True
    have_ad = bool(use_adaptive and res.get("adaptive"))
    ad_cells = ((res.get("adaptive") or {}).get("cells") or {}) if have_ad else {}
    ad_key = f"n{n_gov}-phi{phi_gov}"
    skewed_claim = skew is not None and abs(skew) > 0.8
    if skewed_claim and f"{ad_key}-skewed" in ad_cells:
        ad_key += "-skewed"          # R3-4: the skewed-noise adaptive cell governs a lopsided claim
    ac = ad_cells.get(ad_key) if have_ad else None
    if use_adaptive and not have_ad:
        adaptive = dict(status="not_run")
    ap1 = True
    if ac:
        nl, tr = ac["null"], ac["trend"]
        size = nl["reject_unconditional"]
        ap1 = size["value"] <= ALPHA + 2 * size["se"]
        rg = nl["reject_given_release"]
        cn, ct = nl["interval_coverage_given_shown"], tr["interval_coverage_given_shown"]
        cov_vals = [c["value"] for c in (cn, ct) if c["R"] and c["value"] is not None]
        ap3 = None if not cov_vals else all(v >= COVERAGE_BAR for v in cov_vals)
        ap_interval_ok = ap3 is not False
        adaptive = dict(
            status="run", cell=ad_key, n=n_gov, true_phi=phi_gov, noise=("skewed" if ad_key.endswith("-skewed") else "normal"),
            seed_family=res["adaptive"].get("seed_family"),
            size_unconditional=size, release_rate=nl["release_rate"], size_given_release=rg,
            power_unconditional=tr["positive_reject_unconditional"], power_given_release=tr["positive_reject_given_release"],
            interval_coverage_null=cn, interval_coverage_trend=ct, interval_shown_rate=nl["interval_shown_rate"],
            selected_share=nl["selected_share"], buckets=nl["buckets"],
            bars=dict(AP1=dict(passed=bool(ap1), bar=ALPHA + 2 * size["se"], what="unconditional size of the whole procedure"),
                      AP3=dict(passed=ap3, bar=COVERAGE_BAR, what="coverage of the selected interval, given shown")))
        if not ap1:
            reasons.append(f"the whole adaptive procedure (estimate persistence, pick scenario and test, then test) falsely "
                           f"called a trend in {100 * size['value']:.1f}% of trendless synthetic series with persistence "
                           f"{phi_gov} and {n_gov} seasons (limit {100 * (ALPHA + 2 * size['se']):.1f}%)")
        if chosen is not None and bias_ok and rg["value"] is not None and rg["value"] > ALPHA + 2 * rg["se"]:
            adaptive_notes.append(f"Among series for which a verdict was released, {100 * rg['value']:.1f}% of trendless synthetic "
                                  f"series were called significant at persistence {phi_gov} ({n_gov} seasons), above the nominal 5%; "
                                  f"the procedure withholds the verdict for the most persistent series, which keeps the overall "
                                  f"false-positive rate at {100 * size['value']:.1f}%.")
    elif have_ad:
        adaptive = dict(status="no_cell", cell=ad_key)
        reasons.append("the adaptive procedure was not validated at this series length and persistence")
    reg_ok = chosen is not None and bias_ok and (not have_ad or (ac is not None and ap1))
    method = "bootstrap" if int_ok else ("analytic_hr" if int_ok_a else None)
    reasons_interval = []
    if not ap_interval_ok:
        method = None
        if chosen is not None and bias_ok:
            reasons_interval.append("the interval chosen for this series' persistence covered the true slope in fewer than 90% of "
                                    "synthetic series when run inside the whole adaptive procedure")
    cell_test, cells_mode, family, cell_table = None, "unadjusted_descriptive", None, None
    fam = pick_cell_family(res, n_years, n_cells) if n_cells else None
    if fam:
        family = fam
        homog = {k: [f"CF-{fam}-{k}-phi{g}" for g in govs] for k in ("none", "positive", "mixed")}   # primary bucket first
        het = {k: [f"CF-{fam}-{k}-het{g}" for g in govs] for k in ("none", "positive", "mixed")}
        allids = [i for v in homog.values() for i in v] + [i for v in het.values() for i in v]
        if all(i in sc for i in allids):
            gov += allids
            floor = all(sc[i]["floor_ok"] for i in allids)
            cell_table = {c: dict(homogeneous_passes=all(sc[i]["candidates"][c]["B2_passed"] for v in homog.values() for i in v),
                                  heterogeneous_passes=all(sc[i]["candidates"][c]["B2_passed"] for v in het.values() for i in v),
                                  bh_power=sc[homog["positive"][0]]["candidates"][c]["bh_power"]["value"]) for c in CELL_CANDS}
            ok_c = [c for c in CELL_CANDS if cell_table[c]["homogeneous_passes"] and cell_table[c]["heterogeneous_passes"] and floor]
            if ok_c:
                cell_test = chosen if chosen in ok_c else max(ok_c, key=lambda c: cell_table[c]["bh_power"])
                cells_mode = "bh_flags"
            else:
                cell_test = min(CELL_CANDS, key=lambda c: abs(sc[homog["none"][0]]["candidates"][c]["cell_size"]["value"] - ALPHA))
        else:
            flags.append(f"no cell validation scenarios for family {fam} at persistence {', '.join(f'{g:g}' for g in govs)}; the map is unadjusted and descriptive")
    else:
        cell_ids = {k: f"C-{k}-phi{phi_gov}" for k in ("none", "positive", "mixed")}
        if all(i in sc for i in cell_ids.values()):
            gov += list(cell_ids.values())
            ok_c = [c for c in CELL_CANDS if all(sc[i]["candidates"][c]["B2_passed"] for i in cell_ids.values())
                    and all(sc[i]["floor_ok"] for i in cell_ids.values())]
            if ok_c:
                cell_test = chosen if chosen in ok_c else max(
                    ok_c, key=lambda c: sc[cell_ids["positive"]]["candidates"][c]["bh_power"]["value"])
                cells_mode = "bh_flags"
            else:
                cell_test = min(CELL_CANDS, key=lambda c: abs(sc[cell_ids["none"]]["candidates"][c]["cell_size"]["value"] - ALPHA))
    return dict(base, gate=dict(
        regional_verdict_enabled=reg_ok, regional_test=chosen if reg_ok else None, interval_enabled=bool(method) and reg_ok,
        interval_method=method if reg_ok else None, cells_enabled=cells_mode == "bh_flags", cells_mode=cells_mode,
        cell_test=cell_test, cell_family=family, cell_table=cell_table, reasons_blocking_verdict=reasons,
        reasons_interval=reasons_interval, interval_table=interval_table, adaptive_notes=adaptive_notes, conservative_flags=flags, governing=gov,
        governing_n=n_gov, governing_phi=phi_gov, governing_buckets=govs, bucket_rule=bucket_rule,
        skew_scenarios=("matched to the claim's own length and persistence" if skew_matched else ("legacy single scenario (n 25, phi 0.3)" if skewed_claim else None)),
        withheld_driver=reason_driver, adaptive=adaptive,
        candidate_table={c: dict(size=sc[ids_null[0]]["candidates"][c]["size"]["value"],
                                 power=sc[tr_id]["candidates"][c]["power"]["value"],
                                 passes=c in passers) for c in CAND_ORDER}))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out/validation/validation_results.json")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--run", choices=["A", "B"], default="B")
    ap.add_argument("--merge-a", default=None, help="path to run A results; merge into B after the run")
    a = ap.parse_args(argv)
    if a.run == "A":
        run_all(a.out, quick=a.quick)
    else:
        run_all_b(a.out, quick=a.quick)
        if a.merge_a:
            finalize_with_run_a(a.out, a.merge_a, a.out.replace(".json", "_merged.json"))


if __name__ == "__main__":
    main()
