"""Build the station-based KNMI/CRU TS 4.10 witness files for C-B and C-C.

Run:  stats\\.venv\\Scripts\\python.exe -I data\\witness_knmi\\make_knmi_witness.py
Reads the saved KNMI text copies in this folder and the (read-only) case bundles.
Writes web\\data\\witness\\C-B_knmi.json and C-C_knmi.json. Registered results are not changed.
"""
import calendar
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stats"))
from trendtrial.trend import mk_core, ols, regional_test_p, sen_ci_analytic  # noqa: E402

HERE = ROOT / "data" / "witness_knmi"
OUT = ROOT / "web" / "data" / "witness"

CITATION = ("KNMI Climate Explorer, Royal Netherlands Meteorological Institute; data: CRU TS 4.10, "
            "Harris et al. 2020 / University of East Anglia CRU")


def read_monthly(path):
    rows = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        p = line.split()
        rows[int(p[0])] = [float(x) for x in p[1:13]]
    return rows


def trend_block(x, t, method=None, method_label=None, witness=False):
    x = np.asarray(x, float)
    t = np.asarray(t, float)
    mk = mk_core(x[None, :], t, hr=True)
    mk0 = mk_core(x[None, :], t, hr=False)
    lo, hi = sen_ci_analytic(x, t, float(mk["var_s"][0]))
    o = ols(x, t)
    reg = regional_test_p(x, t, method) if method else None
    return {
        "n": int(np.isfinite(x).sum()),
        "sen_per_decade": float(mk["slope"][0]) * 10,
        "sen_ci95_per_decade": [lo * 10, hi * 10],
        "sen_ci_method": "analytic Sen interval (Gilbert) with Hamed-Rao variance, same routine as the registered test",
        "mk_p_independent_years": float(mk0["p"][0]),
        "mk_p_hamed_rao": float(mk["p"][0]),
        "mk_tau": float(mk["tau"][0]),
        "mk_p_registered_method": (float(reg["p"]) if reg else None),
        "registered_method_name": method,
        "registered_method_label": method_label,
        "registered_method_note": ("the case series' own validated test applied to this comparison record; "
                                   "exploratory here, because the case's validation does not transfer to another record"
                                   if (method and witness) else None),
        "ols_per_decade": float(o["slope"]) * 10,
        "ols_p": float(o["p"]),
    }


def agreement(x, y, t):
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    r, p = stats.pearsonr(x, y)
    rho, prho = stats.spearmanr(x, y)
    # year-to-year changes (removes any shared trend)
    rd, pd_ = stats.pearsonr(np.diff(x), np.diff(y))
    # detrended (remove each series' own OLS line)
    def detr(v):
        b = np.polyfit(t, v, 1)
        return v - np.polyval(b, t)
    rt, pt = stats.pearsonr(detr(x), detr(y))
    return {
        "pearson_r": float(r), "pearson_p": float(p),
        "spearman_rho": float(rho), "spearman_p": float(prho),
        "r_year_to_year_changes": float(rd), "r_year_to_year_changes_p": float(pd_),
        "r_detrended": float(rt), "r_detrended_p": float(pt),
        "n_years": int(len(x)),
    }


def registered_ref(bundle):
    r = bundle["regional"]
    iv = r["interval"]["selected"]
    return {
        "note": "Copied read-only from the registered case bundle. Nothing in this file changes it.",
        "sen_per_decade": bundle["finding"]["change_per_decade"]["value"],
        "interval_95": [iv["low"], iv["high"]],
        "interval_method": iv["method_label"],
        "shipped_test": r["tests"]["shipped"]["label"],
        "shipped_p": r["tests"]["shipped"]["p"],
        "verdict_block_keys": list(bundle["verdict"].keys()) if isinstance(bundle["verdict"], dict) else None,
    }


def main():
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    OUT.mkdir(parents=True, exist_ok=True)

    # ---------------- C-B ----------------
    bB = json.loads((ROOT / "web/data/bundle_C-B.json").read_text(encoding="utf-8"))
    pre = read_monthly(HERE / "C-B_cru_ts410_pre_raw.txt")
    years = list(range(2001, 2026))
    t = np.array(years, float)
    jjas = []
    for y in years:
        m = pre[y]
        dim = [calendar.monthrange(y, k)[1] for k in (6, 7, 8, 9)]
        mm = [m[5], m[6], m[7], m[8]]  # Jun..Sep (indices 5..8)
        jjas.append(sum(mm) / sum(dim))  # mm/month summed over JJAS / 122 days = mm/day
    jjas = np.array(jjas)
    k_anom = jjas - jjas.mean()
    assert bB["regional"]["years"] == years
    imerg_anom = np.array(bB["regional"]["anomaly"], float)
    imerg_base = float(bB["regional"]["baseline_mean"])
    imerg_abs = imerg_anom + imerg_base
    tb_k = trend_block(jjas, t, bB['regional']['tests']['shipped']['method'], bB['regional']['tests']['shipped']['label'], witness=True)
    tb_i = trend_block(imerg_anom, t, bB['regional']['tests']['shipped']['method'], bB['regional']['tests']['shipped']['label'])
    tb_diff = trend_block(k_anom - (imerg_anom - imerg_anom.mean()), t)
    ag = agreement(jjas, imerg_abs, t)
    same_sign = bool(np.sign(tb_k["sen_per_decade"]) == np.sign(tb_i["sen_per_decade"]))
    ci_i = bB["regional"]["interval"]["selected"]
    overlap = not (tb_k["sen_ci95_per_decade"][1] < ci_i["low"] or tb_k["sen_ci95_per_decade"][0] > ci_i["high"])
    cb = {
        "claim_id": "C-B",
        "status": "station-based partner-agency witness, exploratory check, not the registered test",
        "title": "A second witness from the ground: station-based rainfall from KNMI Climate Explorer",
        "generated_utc": now,
        "witness": {
            "name": "KNMI Climate Explorer (Royal Netherlands Meteorological Institute)",
            "dataset": "CRU TS 4.10 precipitation (pre), 0.5 degree, land points, 1901-2025",
            "dataset_authors": "Harris et al. 2020; University of East Anglia Climatic Research Unit (CRU)",
            "how_made": ("Climate Explorer 'Monthly observations' > Precipitation > CRU TS 4.10 (land) 0.5 deg, "
                         "'Make average' over lat 10-18N, lon 17W-25E, land points only (more than 50 percent land "
                         "from the CRU land/sea mask, at least 30 percent valid points), monthly series left in "
                         "mm/month; JJAS mean computed here as the sum of the four months divided by their days"),
            "page_url": "https://climexp.knmi.nl/data/icru4_pre_-17-25E_10-18N_firstyear-lastyear_n_5lan.dat",
            "accessed": "2026-11-14 (KNMI run stamp 2026-11-14 19:38:00)",
            "saved_copy": "data/witness_knmi/C-B_cru_ts410_pre_raw.txt",
            "citation": CITATION,
            "kind": "station-based gridded analysis (rain gauges interpolated to 0.5 degree), built from gauges rather than satellite or model output; it shares many gauges with IMERG Final, so it is not fully independent of that record",
        },
        "case": {"claim_text": bB["claim"]["claim_text"] if isinstance(bB.get("claim"), dict) and "claim_text" in bB["claim"] else "Wet-season rainfall over the central Sahel has increased",
                 "box": {"lat_min": 10, "lat_max": 18, "lon_min": -17, "lon_max": 25},
                 "season": "JJAS", "period": [2001, 2025]},
        "units": {"rain": "mm/day"},
        "years": years,
        "series": {
            "knmi_cru_jjas_mm_day": [round(float(v), 4) for v in jjas],
            "knmi_cru_jjas_anomaly_mm_day": [round(float(v), 4) for v in k_anom],
            "our_imerg_regional_anomaly_mm_day": [round(float(v), 4) for v in imerg_anom],
            "our_imerg_jjas_mm_day": [round(float(v), 4) for v in imerg_abs],
        },
        "levels": {
            "knmi_mean_mm_day": float(jjas.mean()),
            "imerg_mean_mm_day": float(imerg_abs.mean()),
            "note": ("IMERG level is the regional anomaly plus the registered baseline mean from the bundle "
                     "(cell anomalies, cos-latitude weighted, ocean cells included in the box); CRU is land points only, "
                     "so the levels are not expected to match and only the year-to-year behaviour and the trend are compared."),
        },
        "stats": {
            "knmi_cru": tb_k,
            "our_imerg": tb_i,
            "difference_knmi_minus_imerg": tb_diff,
            "agreement": ag,
            "same_sign_of_trend": same_sign,
            "knmi_ci_overlaps_registered_interval": bool(overlap),
        },
        "registered_reference": registered_ref(bB),
        "caveat": ("CRU TS is built from rain-gauge stations, so it does not depend on satellites or on a reanalysis model, "
                   "but it has its own limits: stations are sparse across the Sahel and counts have changed over time, so "
                   "where there are few gauges the grid leans on the long-term average and on distant stations. It also "
                   "covers land only, while our box includes some ocean. Treat it as a cross-check on direction and "
                   "year-to-year behaviour, not as ground truth."),
        "scope_note": "exploratory check, not the registered test. The registered result is the trend test in the case bundle; nothing here replaces it.",
    }
    (OUT / "C-B_knmi.json").write_text(json.dumps(cb, indent=1), encoding="utf-8")

    # ---------------- C-C ----------------
    bC = json.loads((ROOT / "web/data/bundle_C-C.json").read_text(encoding="utf-8"))
    tmp = read_monthly(HERE / "C-C_cru_ts410_tmp_raw.txt")
    yearsC = list(range(1981, 2026))
    tC = np.array(yearsC, float)
    ann = np.array([np.mean(tmp[y]) for y in yearsC])
    kC_anom = ann - ann.mean()
    assert bC["regional"]["years"] == yearsC
    merra_anom = np.array(bC["regional"]["anomaly"], float)
    merra_base = float(bC["regional"]["baseline_mean"])
    merra_abs = merra_anom + merra_base
    tc_k = trend_block(ann, tC, bC['regional']['tests']['shipped']['method'], bC['regional']['tests']['shipped']['label'], witness=True)
    tc_m = trend_block(merra_anom, tC, bC['regional']['tests']['shipped']['method'], bC['regional']['tests']['shipped']['label'])
    tc_diff = trend_block(kC_anom - (merra_anom - merra_anom.mean()), tC)
    agC = agreement(ann, merra_abs, tC)
    ci_m = bC["regional"]["interval"]["selected"]
    overlapC = not (tc_k["sen_ci95_per_decade"][1] < ci_m["low"] or tc_k["sen_ci95_per_decade"][0] > ci_m["high"])
    cc = {
        "claim_id": "C-C",
        "status": "station-based partner-agency witness, exploratory check, not the registered test",
        "title": "A second witness from the ground: station-based air temperature from KNMI Climate Explorer",
        "generated_utc": now,
        "witness": {
            "name": "KNMI Climate Explorer (Royal Netherlands Meteorological Institute)",
            "dataset": "CRU TS 4.10 mean temperature (tmp), 0.5 degree, land points, 1901-2025",
            "dataset_authors": "Harris et al. 2020; University of East Anglia Climatic Research Unit (CRU)",
            "how_made": ("Climate Explorer 'Monthly observations' > Temperature (Land) > CRU TS 4.10 0.5 deg, "
                         "'Make average' over lat 60-70N, lon 165W-140W, land points only (more than 50 percent land "
                         "from the CRU land/sea mask, at least 30 percent valid points), monthly series in degrees "
                         "Celsius; annual mean computed here as the plain mean of the twelve monthly values"),
            "page_url": "https://climexp.knmi.nl/data/icru4_tmp_-165--140E_60-70N_firstyear-lastyear_n_5lan.dat",
            "accessed": "2026-11-14 (KNMI run stamp 2026-11-14 19:39:13)",
            "saved_copy": "data/witness_knmi/C-C_cru_ts410_tmp_raw.txt",
            "citation": CITATION,
            "kind": "station-based gridded analysis (weather stations interpolated to 0.5 degree), built from stations rather than satellite or model output",
        },
        "case": {"claim_text": bC["claim"]["claim_text"] if isinstance(bC.get("claim"), dict) and "claim_text" in bC["claim"] else "Near-surface air temperature over interior and western Alaska has risen",
                 "box": {"lat_min": 60, "lat_max": 70, "lon_min": -165, "lon_max": -140},
                 "season": "annual mean", "period": [1981, 2025]},
        "units": {"temperature": "degC"},
        "years": yearsC,
        "series": {
            "knmi_cru_annual_mean_degC": [round(float(v), 3) for v in ann],
            "knmi_cru_anomaly_degC": [round(float(v), 3) for v in kC_anom],
            "our_merra2_regional_anomaly_degC": [round(float(v), 3) for v in merra_anom],
            "our_merra2_annual_mean_degC": [round(float(v), 3) for v in merra_abs],
        },
        "levels": {
            "knmi_mean_degC": float(ann.mean()),
            "merra2_mean_degC": float(merra_abs.mean()),
            "note": ("MERRA-2 level is the regional anomaly plus the registered baseline mean from the bundle (cos-latitude "
                     "weights on cell anomalies, all cells in the box); CRU is land points only. Anomalies are each "
                     "relative to their own 1981-2025 mean."),
        },
        "stats": {
            "knmi_cru": tc_k,
            "our_merra2": tc_m,
            "difference_knmi_minus_merra2": tc_diff,
            "agreement": agC,
            "same_sign_of_trend": bool(np.sign(tc_k["sen_per_decade"]) == np.sign(tc_m["sen_per_decade"])),
            "knmi_ci_overlaps_registered_interval": bool(overlapC),
        },
        "registered_reference": registered_ref(bC),
        "caveat": ("CRU TS is built from weather-station records, so it does not depend on satellites or on a reanalysis "
                   "model, but it has its own limits: stations are sparse in interior and northern Alaska and their number "
                   "has changed over time, so some grid cells lean on distant stations or on the long-term average. It "
                   "covers land only and is an analysis of anomalies added to a climatology. Treat it as a cross-check on "
                   "direction and year-to-year behaviour, not as ground truth."),
        "scope_note": "exploratory check, not the registered test. The registered result is the trend test in the case bundle; nothing here replaces it.",
    }
    (OUT / "C-C_knmi.json").write_text(json.dumps(cc, indent=1), encoding="utf-8")

    def brief(tag, k, o, ag, reg):
        print(tag)
        for nm, b in (("KNMI", k), ("ours", o)):
            print(f"  {nm}: Sen {b['sen_per_decade']:+.3f}/dec CI [{b['sen_ci95_per_decade'][0]:+.3f},{b['sen_ci95_per_decade'][1]:+.3f}] "
                  f"MK p indep {b['mk_p_independent_years']:.4f} registered-method {b['mk_p_registered_method']:.4f} HR {b['mk_p_hamed_rao']:.4f} OLS {b['ols_per_decade']:+.3f} p {b['ols_p']:.4f}")
        print("  agree:", {kk: round(v, 4) for kk, v in ag.items() if isinstance(v, float)})
        print("  registered:", reg["sen_per_decade"], reg["interval_95"], reg["shipped_test"], reg["shipped_p"])
    brief("C-B", tb_k, tb_i, ag, cb["registered_reference"])
    print("  diff trend:", tb_diff["sen_per_decade"], tb_diff["mk_p_independent_years"])
    print("  levels", cb["levels"]["knmi_mean_mm_day"], cb["levels"]["imerg_mean_mm_day"], "same sign", same_sign, "overlap", overlap)
    brief("C-C", tc_k, tc_m, agC, cc["registered_reference"])
    print("  diff trend:", tc_diff["sen_per_decade"], tc_diff["mk_p_independent_years"])
    print("  levels", cc["levels"]["knmi_mean_degC"], cc["levels"]["merra2_mean_degC"], "overlap", overlapC)


if __name__ == "__main__":
    main()
