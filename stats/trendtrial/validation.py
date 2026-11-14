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
PHIS = (0.0, 0.3, 0.6)
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
    checks["B3"] = dict(passed=cb >= COVERAGE_BAR, bar=COVERAGE_BAR)
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


# ---------------------------------------------------------------- gate

def _nearest_n(res, n):
    ns = sorted({s["n"] for s in res["scenarios"] if s["kind"] == "regional"})
    return min(ns, key=lambda m: (abs(m - n), m))


def gate_for_claim(res, n_years, phi_hat, has_gaps, q=Q, skew=None):
    """Turn validation results into browser-honoured flags for one claim (rule recorded in STATS_LOG.md)."""
    sc = {s["id"]: s for s in res["scenarios"]}
    n_gov = _nearest_n(res, n_years)
    phis = sorted({s["phi"] for s in res["scenarios"] if s["kind"] == "regional" and s["n"] == n_gov})
    reasons, gov = [], []
    phi_use = max(phi_hat, 0.0)
    above = [p for p in phis if p >= phi_use - 1e-12]
    if not above:
        reasons.append(f"persistence in this series (lag-1 {phi_hat:.2f}) is above the tested range")
        return dict(status="run", gate=dict(regional_verdict_enabled=False, interval_enabled=False, cells_enabled=False,
                                            reasons_blocking_verdict=reasons, governing=[]),
                    results_summary=res.get("summary"), results_run=res.get("run"))
    phi_gov = above[0]
    ids_null = [f"R-null-n{n_gov}-phi{phi_gov}"]
    if has_gaps:
        ids_null.append("R-null-gaps-n25-phi0.3")
    if skew is not None and abs(skew) > 0.8:
        ids_null.append("R-null-skewed-n25-phi0.3")
    ids_trend = [f"R-trend-n{n_gov}-phi{phi_gov}"] if f"R-trend-n{n_gov}-phi{phi_gov}" in sc else []
    reg_ok, int_ok, flags = True, True, []
    for sid in ids_null + ids_trend:
        s = sc.get(sid)
        if s is None:
            reasons.append(f"no validation scenario {sid}")
            reg_ok = False
            continue
        gov.append(sid)
        c = s["checks"]
        if "B1" in c and not c["B1"]["passed"]:
            reg_ok = False
            reasons.append(f"regional test too liberal in {sid} (size {s['metrics']['regional_size']['value']:.3f})")
        if "B1" in c and c["B1"]["side"] == "conservative":
            flags.append(f"regional test conservative in {sid}")
        if not c["B4"]["passed"]:
            reg_ok = False
            reasons.append(f"Sen slope biased in {sid}")
        if not c["B3"]["passed"]:
            int_ok = False
        if not s["floor_ok"]:
            reg_ok = False
            reasons.append(f"replicate floor not met in {sid}")
    cells_ok = True
    cells_ids = [f"C-{k}-phi{phi_gov}" for k in ("none", "positive", "mixed")]
    for sid in cells_ids:
        s = sc.get(sid)
        if s is None or not s["checks"]["B2"]["passed"] or not s["floor_ok"]:
            cells_ok = False
        if s is not None:
            gov.append(sid)
    return dict(status="run", gate=dict(regional_verdict_enabled=reg_ok, interval_enabled=int_ok and reg_ok,
                                        cells_enabled=cells_ok, reasons_blocking_verdict=reasons,
                                        conservative_flags=flags, governing=gov, governing_n=n_gov,
                                        governing_phi=phi_gov),
                results_summary=res.get("summary"), results_run=res.get("run"))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out/validation/validation_results.json")
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args(argv)
    run_all(a.out, quick=a.quick)


if __name__ == "__main__":
    main()
