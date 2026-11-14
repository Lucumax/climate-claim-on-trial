"""POST-RESULT EXPLORATORY checks requested by the round-3 science judge (STATS_LOG 18:06 ET entry).

NOT the registered test, NOT a gate, changes no verdict, bundle or registered number.
One process, OPENBLAS_NUM_THREADS=1, chunked, RAM checked before each chunk, atomic JSON writes.

usage (stats venv):  python scripts/exploratory_r3.py [stage ...]
stages: shadow calp curved cellmem sahel witness web   (default: all, in that order)
reads  web/data/bundle_*.json, data/<id>/{claim.json,monthly.npz}, web/data/witness/*.json,
       stats/out/validation/validation_results.json (+ _n21)
writes stats/out/exploratory/*.json and web/data/exploratory.json
"""
import ctypes
import gc
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np  # noqa: E402
from scipy import stats as sstats  # noqa: E402
from scipy.optimize import curve_fit  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
from trendtrial.aggregate import (block_aggregate, build_cube, climatology, cell_season_series,  # noqa: E402
                                  cos_weights, is_wrap)
from trendtrial.pipeline import DEFAULT_PARAMS, _lag1  # noqa: E402
from trendtrial.trend import BATCHED_METHODS, benjamini_hochberg, mk_core  # noqa: E402
from trendtrial.validation import gate_for_claim  # noqa: E402

OUT = ROOT / "out" / "exploratory"
OUT.mkdir(parents=True, exist_ok=True)
WEB = REPO / "web" / "data"
CASES = ["C-A", "C-B", "C-C", "C-D", "C-E1", "C-E2"]
LABEL = ("POST-RESULT EXPLORATORY check (round-3 science judge, STATS_LOG 18:06 ET entry). Not the registered test, "
         "not a gate; no verdict, bundle or registered number depends on it.")
R_CALP = 4000      # simulated trendless series per (case, memory level)
R_CURVE = 2000     # simulated curved-decline series per noise level
R_REF = 4000       # simulated series per memory level for the per-cell reference
PHIS = [-0.7, -0.5, -0.3, 0.0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.7, 0.8, 0.9]
SEED = 20261114


def free_gb():
    class MS(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong), ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]
    m = MS()
    m.dwLength = ctypes.sizeof(MS)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return m.ullAvailPhys / 1e9


def wait_ram(min_gb=0.8):
    while True:
        f = free_gb()
        if f >= min_gb:
            return f
        print(f"  free RAM {f:.2f} GB < {min_gb}; waiting 60 s", flush=True)
        time.sleep(60)


def write_json(path, obj):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=1, default=float), encoding="utf-8")
    for _ in range(10):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(1)
    raise PermissionError(path)


def bundle(cid):
    return json.loads((WEB / f"bundle_{cid}.json").read_text(encoding="utf-8"))


def mc_se(p, r):
    return math.sqrt(max(p * (1 - p), 1e-12) / r)


# ------------------------------------------------------------------ simulation helpers
def ar1(r, n, phi, rng):
    e = rng.standard_normal((r, n))
    x = np.empty((r, n))
    x[:, 0] = e[:, 0]
    s = math.sqrt(1 - phi * phi)
    for k in range(1, n):
        x[:, k] = phi * x[:, k - 1] + s * e[:, k]
    return x


def mk_s(x):
    n = x.shape[1]
    i0, i1 = np.triu_indices(n, 1)
    return np.sign(x[:, i1] - x[:, i0]).sum(axis=1)


def lag1_batch(x):
    """Vectorised twin of pipeline._lag1 for complete series (OLS straight-line detrend, mean removed)."""
    r, n = x.shape
    t = np.arange(n, dtype=float)
    tc = t - t.mean()
    xc = x - x.mean(axis=1, keepdims=True)
    b = (xc * tc).sum(axis=1) / (tc * tc).sum()
    res = xc - b[:, None] * tc[None, :]
    res = res - res.mean(axis=1, keepdims=True)
    d = (res * res).sum(axis=1)
    num = (res[:, :-1] * res[:, 1:]).sum(axis=1)
    return np.where(d > 0, num / d, 0.0)


# ------------------------------------------------------------------ stage 1: registered-method shadow
def stage_shadow():
    out = {"label": LABEL, "what": "the originally registered regional method alone (Mann-Kendall with the Hamed-Rao "
           "correction, no gate), read from regional.tests.mk_hr and regional.tests.sen of each bundle", "cases": {}}
    for c in CASES:
        b = bundle(c)
        t = b["regional"]["tests"]
        sh = t.get("shipped")
        out["cases"][c] = dict(
            claim=b["claim"]["claim_text"], direction=b["claim"]["direction"], n=t["mk_hr"]["n"],
            registered_mk_hr=dict(p=t["mk_hr"]["p"], tau=t["mk_hr"]["tau"], s=t["mk_hr"]["s"],
                                  hr_factor=t["mk_hr"]["hr_factor"], hr_factor_raw=t["mk_hr"]["hr_factor_raw"]),
            registered_mk_independent_p=t["mk_independent"]["p"],
            sen_per_decade=t["sen"]["slope_per_decade"], ols_per_decade=t["ols"]["slope_per_decade"],
            ols_p=t["ols"]["p"],
            shipped=None if not sh else dict(method=sh["method"], p=sh["p"]),
            verdict=b["verdict"]["id"], verdict_branch=b["verdict"].get("branch"),
            claim_phi_hat=b["validation"].get("claim_phi_hat"), units=b["regional"]["units"])
    # round-2 C-B shipped test (plain Mann-Kendall) is the same number as mk_independent
    out["cases"]["C-B"]["round2_shipped"] = dict(method="mk_independent", p=bundle("C-B")["regional"]["tests"]["mk_independent"]["p"])
    # Holm arithmetic on released p-values (judge point 13); exploratory, not a rule
    def holm(ps):
        order = sorted(ps, key=ps.get)
        adj, run = {}, 0.0
        for i, k in enumerate(order):
            run = max(run, min(1.0, (len(ps) - i) * ps[k]))
            adj[k] = run
        return adj
    pc = {"C-C": out["cases"]["C-C"]["shipped"]["p"], "C-B": out["cases"]["C-B"]["shipped"]["p"],
          "C-D": out["cases"]["C-D"]["shipped"]["p"]}
    pc2 = dict(pc, **{"C-B": out["cases"]["C-B"]["round2_shipped"]["p"]})
    out["holm_released_cases"] = dict(note="Holm-Bonferroni across the three released cases; plain arithmetic on the shipped p-values; "
                                           "exploratory, no verdict uses it", p=pc, holm_adjusted=holm(pc),
                                      with_round2_C_B_p=dict(p=pc2, holm_adjusted=holm(pc2)))
    write_json(OUT / "shadow.json", out)
    print("shadow done", flush=True)
    return out


# ------------------------------------------------------------------ stage 2: calibrated p under AR(1) memory
def stage_calp():
    out = {"label": LABEL, "method": f"observed Mann-Kendall S of the shipped regional series vs |S| of {R_CALP} simulated trendless "
           f"Gaussian AR(1) series of the same length at each memory level phi; two-sided p = (count(|S_sim| >= |S_obs|) + 1) / (R + 1)",
           "R": R_CALP, "seed": SEED, "phis": PHIS, "cases": {}}
    rng = np.random.default_rng(SEED)
    for c in CASES:
        b = bundle(c)
        mk = b["regional"]["tests"]["mk_hr"]
        n, s_obs = int(mk["n"]), abs(float(mk["s"]))
        row = {}
        for phi in PHIS:
            wait_ram()
            cnt = 0
            for a in range(0, R_CALP, 1000):
                x = ar1(1000, n, phi, rng)
                cnt += int((np.abs(mk_s(x)) >= s_obs).sum())
            p = (cnt + 1) / (R_CALP + 1)
            row[f"{phi:g}"] = dict(p=round(p, 5), se=round(mc_se(p, R_CALP), 5), exceed=cnt)
        out["cases"][c] = dict(n=n, abs_S_observed=s_obs, direction=b["claim"]["direction"],
                               claim_phi_hat=b["validation"].get("claim_phi_hat"),
                               governing_buckets=b["validation"]["gate"].get("governing_buckets"), calibrated_p=row)
        print("calp", c, {k: v["p"] for k, v in row.items()}, flush=True)
    write_json(OUT / "calibrated_p.json", out)
    return out


# ------------------------------------------------------------------ stage 3: curved decline vs the real gate
def stage_curved():
    vres = json.loads((ROOT / "out" / "validation" / "validation_results_n21.json").read_text(encoding="utf-8"))
    out = {"label": LABEL, "method": "fit c + a*exp(-t/tau) to the regional series; simulate that curve plus independent Gaussian "
           "noise (no memory) at the residual SD of the fit (ddof 3, three fitted parameters) x k; for each simulated series take the straight-line-residual lag-1 "
           f"(pipeline definition) and ask the real gate (gate_for_claim, validation_results_n21.json, n 21, no gaps) whether it "
           f"would release a regional verdict. R = {R_CURVE} per noise level, seed {SEED}.", "R": R_CURVE, "cases": {}}
    rng = np.random.default_rng(SEED + 1)
    for c in ["C-E1", "C-E2"]:
        b = bundle(c)
        y = np.array(b["regional"]["anomaly"], float)
        n = len(y)
        t = np.arange(n, dtype=float)
        sgn = -1.0 if b["claim"]["direction"] == "decrease" else 1.0
        # decaying exponential for the fall; the mirrored saturating shape for the rise (same family, sign of a flips)
        f = lambda tt, a, tau, cc: cc + a * np.exp(-tt / tau)
        try:
            popt, _ = curve_fit(f, t, y, p0=[-sgn * 1.5, 4.0, y[-1]], maxfev=20000)
        except Exception as e:  # noqa: BLE001
            out["cases"][c] = dict(error=f"fit failed: {e}")
            continue
        fit = f(t, *popt)
        res = y - fit
        sd0 = float(res.std(ddof=0))
        sd3 = float(res.std(ddof=3))
        phi_real = _lag1(y)
        row = {}
        n_cells = b["cells"]["grid"]["ny"] * b["cells"]["grid"]["nx"]
        for k in (1, 2, 4):
            wait_ram()
            sims = fit[None, :] + k * sd3 * rng.standard_normal((R_CURVE, n))
            l1 = lag1_batch(sims)
            released = 0
            for i in range(R_CURVE):
                sk = float(sstats.skew(sims[i]))
                g = gate_for_claim(vres, n_years=n, phi_hat=float(l1[i]), has_gaps=False, skew=sk, n_cells=int(n_cells))
                released += bool(g["gate"].get("regional_verdict_enabled"))
            pr = released / R_CURVE
            row[f"noise_x{k}"] = dict(
                lag1_median=round(float(np.median(l1)), 3), lag1_p5=round(float(np.percentile(l1, 5)), 3),
                lag1_p95=round(float(np.percentile(l1, 95)), 3),
                share_lag1_le_0p1=round(float((l1 <= 0.1).mean()), 4), share_lag1_gt_0p6=round(float((l1 > 0.6).mean()), 4),
                gate_released=released, gate_released_share=round(pr, 4), gate_released_se=round(mc_se(pr, R_CURVE), 4),
                text=f"the real gate released a verdict in {released} of {R_CURVE} simulated curved-decline series "
                     f"(Monte Carlo SE {mc_se(pr, R_CURVE):.3f})")
        out["cases"][c] = dict(n=n, fit=dict(a=float(popt[0]), tau_years=float(popt[1]), offset=float(popt[2])),
                               residual_sd_ddof0=sd0, residual_sd_ddof3=sd3, real_series_lag1=phi_real,
                               fit_r2=float(1 - (res ** 2).sum() / ((y - y.mean()) ** 2).sum()), by_noise=row)
        print("curved", c, json.dumps(out["cases"][c])[:600], flush=True)
    write_json(OUT / "curved_decline_gate.json", out)
    return out


# ------------------------------------------------------------------ stage 4/5: per-cell memory, Sahel map
def cell_inputs(cid):
    claim = json.loads((REPO / "data" / cid / "claim.json").read_text(encoding="utf-8"))
    b = bundle(cid)
    P = dict(DEFAULT_PARAMS)  # the pipeline defaults; the bundle copy of min_season_month_frac is rounded (0.666667)
    z = np.load(REPO / "data" / cid / "monthly.npz")
    values = z["values"].astype(np.float64)
    lat = z["lat"].astype(float)
    lon = z["lon"].astype(float)
    year, month = z["year"], z["month"]
    ny, nx = len(lat), len(lon)
    support = z["support"].astype(bool) if "support" in z.files else np.ones((ny, nx), bool)
    months = list(claim["season_months"])
    if not is_wrap(months):
        months = sorted(months)
    y0, y1 = claim["period"]
    years = list(range(int(y0), int(y1) + 1))
    k = int(b["coverage"]["cell_agg_k"])
    if k > 1:
        masked = np.where(support[None], values, np.nan)
        cube_c = build_cube(block_aggregate(masked, k), year, month, years, months)
        ny_c, nx_c = ny // k, nx // k
        lat_c = lat[:ny_c * k].reshape(ny_c, k).mean(axis=1)
        support_c = block_aggregate(support.astype(float), k, 0.0) >= 0.5
    else:
        cube_c = build_cube(values, year, month, years, months)
        lat_c, support_c, ny_c, nx_c = lat, support, ny, nx
    del values
    clim_c = climatology(cube_c, P["min_clim_frac"])
    raw, an = cell_season_series(cube_c, clim_c, P["min_season_month_frac"])
    Xan = an.reshape(len(years), -1).T
    nvy = np.isfinite(Xan).sum(axis=1)
    min_years = max(P["min_valid_years_abs"], math.ceil(P["min_valid_years_frac"] * len(years)))
    cell_ok = support_c.reshape(-1) & (nvy >= min_years)
    w = cos_weights(lat_c, nx_c).reshape(-1)
    return dict(b=b, Xan=Xan, cell_ok=cell_ok, w=w, t=np.asarray(years, float), n_years=len(years),
                sgn=1.0 if b["claim"]["direction"] == "increase" else -1.0)


def stage_cellmem():
    out = {"label": LABEL, "method": "lag-1 autocorrelation of each analysed cell's own annual (or seasonal) anomaly series after "
           "removing a straight line (pipeline _lag1), over the cells the shipped cell ladder analyses; reference = the same "
           f"estimate in {R_REF} simulated AR(1) series of the claim's length at each true memory level", "R_ref": R_REF,
           "seed": SEED, "cases": {}}
    rng = np.random.default_rng(SEED + 2)
    for c in CASES:
        wait_ram(1.0 if c == "C-B" else 0.8)
        d = cell_inputs(c)
        b = d["b"]
        idx = np.where(d["cell_ok"])[0]
        assert len(idx) == b["cells"]["n_valid_cells"], (c, len(idx), b["cells"]["n_valid_cells"])
        l1 = np.array([_lag1(d["Xan"][i]) for i in idx])
        n = d["n_years"]
        ref = {}
        for phi in [-0.7, -0.5, -0.3, 0.0, 0.1, 0.2, 0.3, 0.45, 0.6]:
            est = lag1_batch(ar1(R_REF, n, phi, rng))
            ref[f"{phi:g}"] = dict(median=round(float(np.median(est)), 3), p5=round(float(np.percentile(est, 5)), 3),
                                   p95=round(float(np.percentile(est, 95)), 3))
        med = float(np.median(l1))
        closest = min(ref, key=lambda k: abs(ref[k]["median"] - med))
        gb = b["validation"]["gate"].get("governing_buckets") or []
        near = min(gb, key=lambda g: abs(g - med)) if gb else None
        out["cases"][c] = dict(
            n_cells=int(len(idx)), n_years=n, regional_phi_hat=b["validation"].get("claim_phi_hat"), governing_buckets=gb,
            cell_lag1=dict(median=round(med, 3), p5=round(float(np.percentile(l1, 5)), 3), p25=round(float(np.percentile(l1, 25)), 3),
                           p75=round(float(np.percentile(l1, 75)), 3), p95=round(float(np.percentile(l1, 95)), 3),
                           share_positive=round(float((l1 > 0).mean()), 3), share_above_minus0p3=round(float((l1 > -0.3).mean()), 3)),
            simulated_estimate_at_true_memory=ref, closest_simulated_true_memory_to_cell_median=float(closest),
            nearest_governing_bucket=near,
            median_far_from_buckets=(None if near is None else bool(abs(med - near) > 0.2)),
            far_rule="flag when the median cell estimate is more than 0.2 from the nearest governing bucket (an exploratory display rule, not a gate)")
        print("cellmem", c, json.dumps(out["cases"][c]["cell_lag1"]), "closest sim", closest, flush=True)
        del d
        gc.collect()
    write_json(OUT / "cell_memory.json", out)
    return out


def bh_area(Xan, idx, t, w, cell_ok, sgn, corr, q=0.10):
    m = mk_core(Xan[idx], t, corr=corr)
    ncell = Xan.shape[0]
    p = np.full(ncell, np.nan)
    p[idx] = m["p"]
    sl = np.full(ncell, np.nan)
    sl[idx] = m["slope"] * 10
    rej, _ = benjamini_hochberg(p, q)
    f = rej & cell_ok
    fd = f & (sl * sgn > 0)
    wv = w[cell_ok].sum()
    return dict(flagged_cells=int(f.sum()), flagged_area_frac=float(w[f].sum() / wv),
                flagged_in_direction_cells=int(fd.sum()), flagged_in_direction_area_frac=float(w[fd].sum() / wv),
                unadjusted_p05_area_frac=float(w[(p < 0.05) & cell_ok].sum() / wv))


def stage_sahel():
    wait_ram(1.0)
    d = cell_inputs("C-B")
    idx = np.where(d["cell_ok"])[0]
    r3 = bh_area(d["Xan"], idx, d["t"], d["w"], d["cell_ok"], d["sgn"], BATCHED_METHODS["tfpw"])
    r2 = bh_area(d["Xan"], idx, d["t"], d["w"], d["cell_ok"], d["sgn"], BATCHED_METHODS["hr_all_lags"])
    b = d["b"]
    shipped = [r for r in b["cells"]["rungs"] if r["rung"] == 4][0]
    res = json.loads((ROOT / "out" / "validation" / "validation_results.json").read_text(encoding="utf-8"))
    power = {}
    for s in res["scenarios"]:
        if s["kind"] == "cells" and s["id"].startswith("CF-CB-positive") or (s["kind"] == "cells" and s["id"].startswith("CF-CB-mixed")):
            power[s["id"]] = {k: (v.get("bh_power") or {}).get("value") for k, v in s["candidates"].items()
                              if k in ("hr_all_lags", "tfpw", "yue_wang", "hr_registered")}
            power[s["id"]]["n"] = s["n"]
    sel = {k: v for k, v in power.items() if k.rsplit("-", 1)[-1] in ("0.7",) or k.endswith(("phi0.0", "phi-0.5", "phi-0.3", "phi-0.7"))}
    size = {}
    for s_ in res["scenarios"]:
        if s_["kind"] == "cells" and s_["id"].startswith("CF-CB-none-phi"):
            size[s_["id"].split("none-phi")[1]] = {k: dict(cell_size=(v.get("cell_size") or {}).get("value"), B2_passed=v.get("B2_passed"))
                                                   for k, v in s_["candidates"].items() if k in ("hr_all_lags", "tfpw")}
    out = dict(label=LABEL, cell_size_in_trendless_simulated_cells_by_memory=dict(
        note="share of cells flagged by the per-cell p < 0.05 rule in trendless simulated C-B fields (nominal 0.05), and whether the "
             "Benjamini-Hochberg map check B2 passed, by true memory; read from validation_results.json", by_phi=size), round3_tfpw_recomputed=r3, round2_hr_all_lags_recomputed=r2,
               round3_in_bundle=dict(flagged_cells=shipped["flagged_cells"], flagged_area_frac=shipped["flagged_area_frac"],
                                     flagged_in_direction_area_frac=shipped["flagged_in_direction_area_frac"]),
               round2_in_log="210 cells, 15.6% of area (STATS_LOG 12:20 ET entry); round2_reference.json has in-direction 15.06%",
               map_power_at_25_seasons_from_validation_results=dict(
                   note="share of truly changing cells found (bh_power) in the simulated C-B cell family (n 25); read from "
                        "stats/out/validation/validation_results.json (round-3 file), no new simulation. positive = 30% of cells carry "
                        "0.3 to 0.6 SD per decade; mixed = mixed-sign truth.", scenarios=sel))
    write_json(OUT / "sahel_map.json", out)
    print("sahel", json.dumps({k: out[k] for k in ("round3_tfpw_recomputed", "round2_hr_all_lags_recomputed", "round3_in_bundle")}), flush=True)
    print("sahel power", json.dumps(sel), flush=True)
    return out


# ------------------------------------------------------------------ stage 6: witness differences (read only)
def stage_witness():
    a = json.loads((WEB / "witness" / "C-A_knmi.json").read_text(encoding="utf-8"))
    c = json.loads((WEB / "witness" / "C-C_knmi.json").read_text(encoding="utf-8"))
    pre = a["divergence_from_2021"]["trend_of_difference_before_2021"]["knmi_minus_modis"]
    full = a["stats"]["difference_knmi_minus_modis_registered"]
    dm = c["stats"]["difference_knmi_minus_merra2"]
    out = dict(
        label=LABEL + " Read from the existing witness files; nothing recomputed.",
        C_A_station_minus_MODIS_Terra=dict(
            source="web/data/witness/C-A_knmi.json (CRU TS 4.10 tmx station-based JJA maximum air temperature minus MODIS Terra LST anomaly)",
            period_2001_2020=dict(n=pre["n"], sen_per_decade=pre["sen_per_decade"], ci95=pre["sen_ci95_per_decade"],
                                  p_mk=pre["p_mk_independent"], p_hamed_rao=pre["p_hamed_rao_registered"], p_yue_wang=pre["p_yue_wang"],
                                  ols_per_decade=pre["ols_per_decade"], ols_p=pre["ols_p"]),
            period_2001_2025=dict(n=full["n"], sen_per_decade=full["sen_per_decade"], ci95=full["sen_ci95_per_decade"],
                                  p_hamed_rao=full["p_hamed_rao_registered"], p_yue_wang=full["p_yue_wang"]),
            reading="station air temperature rises about 0.5 degC per decade faster than MODIS skin temperature already over 2001-2020, before the 2021 drift years"),
        C_C_station_minus_MERRA2=dict(
            source="web/data/witness/C-C_knmi.json (CRU TS 4.10 annual mean temperature, land points, minus our MERRA-2 regional series)",
            period="1981-2025", n=dm["n"], sen_per_decade=dm["sen_per_decade"], ci95=dm["sen_ci95_per_decade"],
            p_mk_hamed_rao=dm["mk_p_hamed_rao"], ols_per_decade=dm["ols_per_decade"], ols_p=dm["ols_p"],
            reading="MERRA-2 warms about 0.06 degC per decade faster than the station record (station minus MERRA-2 is negative); "
                    "the MERRA-2 box includes sea cells, CRU is land only"))
    write_json(OUT / "witness_differences.json", out)
    print("witness", json.dumps(out)[:500], flush=True)
    return out


# ------------------------------------------------------------------ compact web file
def stage_web():
    parts = {}
    for name in ("shadow", "calibrated_p", "curved_decline_gate", "cell_memory", "sahel_map", "witness_differences"):
        p = OUT / f"{name}.json"
        parts[name] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
    web = dict(label=LABEL, note="Compact copy of stats/out/exploratory/*.json for the site. Every number here is exploratory and "
                                 "post-result; the six verdicts are unchanged and none of this is a registered test.")
    if parts["shadow"]:
        web["shadow"] = {c: dict(n=v["n"], registered_p=v["registered_mk_hr"]["p"], sen_per_decade=v["sen_per_decade"],
                                 shipped=v["shipped"], verdict=v["verdict"], ols_per_decade=v["ols_per_decade"], units=v["units"])
                         for c, v in parts["shadow"]["cases"].items()}
        web["shadow"]["C-B"]["round2_shipped"] = parts["shadow"]["cases"]["C-B"]["round2_shipped"]
        web["holm_released_cases"] = parts["shadow"]["holm_released_cases"]
    if parts["calibrated_p"]:
        web["calibrated_p"] = dict(R=parts["calibrated_p"]["R"], method=parts["calibrated_p"]["method"], cases={
            c: dict(n=v["n"], abs_S=v["abs_S_observed"], p={k: x["p"] for k, x in v["calibrated_p"].items()})
            for c, v in parts["calibrated_p"]["cases"].items()})
    if parts["curved_decline_gate"]:
        web["curved_decline_gate"] = dict(R=parts["curved_decline_gate"]["R"], cases={
            c: ({k: x for k, x in v.items() if k in ("n", "fit", "residual_sd_ddof0", "real_series_lag1", "error")} |
                {"by_noise": {k: {y: z for y, z in x.items() if y in ("lag1_median", "share_lag1_le_0p1", "gate_released",
                                                                          "gate_released_share", "gate_released_se")}
                              for k, x in (v.get("by_noise") or {}).items()}})
            for c, v in parts["curved_decline_gate"]["cases"].items()})
    if parts["cell_memory"]:
        web["cell_memory"] = {c: dict(n_cells=v["n_cells"], regional_phi_hat=v["regional_phi_hat"], governing_buckets=v["governing_buckets"],
                                      cell_lag1=v["cell_lag1"], closest_simulated_true_memory=v["closest_simulated_true_memory_to_cell_median"],
                                      median_far_from_buckets=v["median_far_from_buckets"])
                              for c, v in parts["cell_memory"]["cases"].items()}
    if parts["sahel_map"]:
        s = parts["sahel_map"]
        web["sahel_map"] = dict(round3_tfpw=s["round3_tfpw_recomputed"], round2_hr_all_lags=s["round2_hr_all_lags_recomputed"],
                                round3_in_bundle=s["round3_in_bundle"],
                                map_power=s["map_power_at_25_seasons_from_validation_results"]["scenarios"])
    if parts["witness_differences"]:
        web["witness_differences"] = parts["witness_differences"]
    write_json(WEB / "exploratory.json", web)
    print("web/data/exploratory.json written", flush=True)


STAGES = dict(shadow=stage_shadow, calp=stage_calp, curved=stage_curved, cellmem=stage_cellmem, sahel=stage_sahel,
              witness=stage_witness, web=stage_web)

if __name__ == "__main__":
    todo = sys.argv[1:] or list(STAGES)
    for s in todo:
        t0 = time.time()
        print(f"== stage {s} (free RAM {wait_ram():.2f} GB)", flush=True)
        STAGES[s]()
        print(f"== stage {s} done in {time.time() - t0:.0f} s", flush=True)
