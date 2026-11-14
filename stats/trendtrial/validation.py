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

def _nearest_n(res, n):
    ns = sorted({s["n"] for s in res["scenarios"] if s["kind"] == "regional"})
    return min(ns, key=lambda m: (abs(m - n), m))


def gate_for_claim(res, n_years, phi_hat, has_gaps, q=Q, skew=None):
    """Turn run-B results into browser-honoured flags and the shipped tests for one claim (rules: STATS_LOG addendum 2)."""
    sc = {s["id"]: s for s in res["scenarios"]}
    n_gov = _nearest_n(res, n_years)
    phis = sorted({s["phi"] for s in res["scenarios"] if s["kind"] == "regional" and s["n"] == n_gov})
    reasons, gov, flags = [], [], []
    base = dict(status="run", results_run=res.get("run"), results_summary=res.get("summary"))
    above = [p for p in phis if p >= max(phi_hat, 0.0) - 1e-12]
    off = dict(regional_verdict_enabled=False, interval_enabled=False, interval_method=None, cells_enabled=False,
               cells_mode="off", regional_test=None, cell_test=None, reasons_blocking_verdict=reasons,
               conservative_flags=flags, governing=gov)
    if not above:
        reasons.append(f"persistence in this series (lag-1 {phi_hat:.2f}) is above the tested range")
        return dict(base, gate=off)
    phi_gov = above[0]
    ids_null = [f"R-null-n{n_gov}-phi{phi_gov}"]
    if has_gaps:
        ids_null.append("R-null-gaps-n25-phi0.3")
    if skew is not None and abs(skew) > 0.8:
        ids_null.append("R-null-skewed-n25-phi0.3")
    tr_id = f"R-trend-n{n_gov}-phi{phi_gov}"
    for sid in ids_null + [tr_id]:
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
    interval = [sc[i].get("interval") for i in ids_null + [tr_id]]
    if any(v is None for v in interval):
        reasons.append("interval and Sen-bias results missing for a governing scenario")
        return dict(base, gate=off)
    bias_ok = all(v["checks"]["B4"]["passed"] for v in interval)
    int_ok = all(v["checks"]["B3"]["passed"] for v in interval)
    int_ok_a = all(v["checks"]["B3a"]["passed"] for v in interval)
    if chosen is None:
        reasons.append("no candidate regional test kept its size within 0.05 +/- 2 SE at this series' persistence: " +
                       ", ".join(f"{c} {sc[ids_null[0]]['candidates'][c]['size']['value']:.3f}" for c in CAND_ORDER))
    if not bias_ok:
        reasons.append("Sen slope biased in a governing scenario")
    for i in ids_null:
        v = sc[i]["size_checks"].get(chosen)
        if v and v["side"] == "conservative":
            flags.append(f"regional test conservative in {i}")
    reg_ok = chosen is not None and bias_ok
    method = "bootstrap" if int_ok else ("analytic_hr" if int_ok_a else None)
    cell_ids = {k: f"C-{k}-phi{phi_gov}" for k in ("none", "positive", "mixed")}
    cell_test, cells_mode = None, "unadjusted_descriptive"
    if all(i in sc for i in cell_ids.values()):
        gov += list(cell_ids.values())
        ok_c = [c for c in CELL_CANDS if all(sc[i]["candidates"][c]["B2_passed"] for i in cell_ids.values())
                and all(sc[i]["floor_ok"] for i in cell_ids.values())]
        if ok_c:
            cell_test = max(ok_c, key=lambda c: sc[cell_ids["positive"]]["candidates"][c]["bh_power"]["value"])
            cells_mode = "bh_flags"
        else:
            cell_test = min(CELL_CANDS, key=lambda c: abs(sc[cell_ids["none"]]["candidates"][c]["cell_size"]["value"] - ALPHA))
    return dict(base, gate=dict(
        regional_verdict_enabled=reg_ok, regional_test=chosen if reg_ok else None, interval_enabled=bool(method) and reg_ok,
        interval_method=method if reg_ok else None, cells_enabled=cells_mode == "bh_flags", cells_mode=cells_mode,
        cell_test=cell_test, reasons_blocking_verdict=reasons, conservative_flags=flags, governing=gov, governing_n=n_gov,
        governing_phi=phi_gov,
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
