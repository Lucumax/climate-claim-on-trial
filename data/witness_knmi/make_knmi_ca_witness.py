"""Build the KNMI/CRU TS 4.10 station-based air-temperature witness for C-A (sibling of make_knmi_witness.py).

EXPLORATORY CHECK, NOT THE REGISTERED TEST. Nothing here changes data\\C-A\\* or the C-A verdict (withheld).

Run:  stats\\.venv\\Scripts\\python.exe -I data\\witness_knmi\\make_knmi_ca_witness.py
Reads the saved KNMI text copies in this folder (C-A_cru_ts410_tmx_raw.txt, C-A_cru_ts410_tmp_raw.txt), the read-only C-A
bundle (web\\data\\bundle_C-A.json) and web\\data\\witness\\C-A_esa.json. Writes web\\data\\witness\\C-A_knmi.json.

Air temperature at 2 m (CRU tmx) is NOT land surface skin temperature (MODIS, ESA LST). Only trends and year-to-year
changes are compared, never levels.
"""
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
YEARS = list(range(2001, 2026))


def read_monthly(path):
    rows = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        p = line.split()
        rows[int(p[0])] = [float(x) for x in p[1:13]]
    return rows


def jja(rows, years):
    return np.array([np.mean(rows[y][5:8]) for y in years])   # Jun, Jul, Aug = indices 5..7


def trend_block(x, t):
    x = np.asarray(x, float)
    t = np.asarray(t, float)
    mk = mk_core(x[None, :], t, hr=True)
    mk0 = mk_core(x[None, :], t, hr=False)
    lo, hi = sen_ci_analytic(x, t, float(mk["var_s"][0]))
    o = ols(x, t)
    return dict(n=int(np.isfinite(x).sum()), sen_per_decade=float(mk["slope"][0]) * 10,
                sen_ci95_per_decade=[lo * 10, hi * 10],
                p_mk_independent=float(mk0["p"][0]),
                p_hamed_rao_registered=float(regional_test_p(x, t, "hr_registered")["p"]),
                p_yue_wang=float(regional_test_p(x, t, "yue_wang")["p"]),
                tau=float(mk["tau"][0]), ols_per_decade=float(o["slope"]) * 10, ols_p=float(o["p"]))


def agreement(x, y, t):
    r, p = stats.pearsonr(x, y)
    rho, prho = stats.spearmanr(x, y)
    rd, pd_ = stats.pearsonr(np.diff(x), np.diff(y))
    detr = lambda v: v - np.polyval(np.polyfit(t, v, 1), t)
    rt, pt = stats.pearsonr(detr(x), detr(y))
    return dict(pearson_r=float(r), pearson_p=float(p), spearman_rho=float(rho), spearman_p=float(prho),
                r_year_to_year_changes=float(rd), r_year_to_year_changes_p=float(pd_),
                r_detrended=float(rt), r_detrended_p=float(pt), n_years=len(x))


def late_vs_early(d, years, split=2021):
    """Mean of the difference series from `split` on vs before it, plus a Welch t and a permutation p (indicative only)."""
    d = np.asarray(d, float)
    y = np.array(years)
    a, b = d[y < split], d[y >= split]
    w = stats.ttest_ind(b, a, equal_var=False)
    rng = np.random.default_rng(1)
    obs = b.mean() - a.mean()
    perm = []
    for _ in range(20000):
        q = rng.permutation(d)
        perm.append(q[-len(b):].mean() - q[:len(a)].mean())
    pperm = float((np.abs(perm) >= abs(obs)).mean())
    return dict(split_year=split, n_early=int(len(a)), n_late=int(len(b)), mean_early=float(a.mean()), mean_late=float(b.mean()),
                late_minus_early=float(obs), welch_t=float(w.statistic), welch_p=float(w.pvalue), permutation_p=pperm,
                note="indicative only: years are autocorrelated and the late block is short")


def residual_check(x_ref, y, years, fit_to=2020):
    """Regress y on x_ref over years <= fit_to, then look at how far y sits from that line in the later years."""
    y_ = np.array(years)
    m = y_ <= fit_to
    b = np.polyfit(x_ref[m], y[m], 1)
    res = y - np.polyval(b, x_ref)
    sd = float(res[m].std(ddof=2))
    late = res[~m]
    return dict(fit_years=[int(y_[m][0]), int(fit_to)], slope=float(b[0]), intercept=float(b[1]), residual_sd_fit=sd,
                residuals_later_years={str(int(a)): float(r) for a, r in zip(y_[~m], late)},
                mean_residual_later=float(late.mean()), mean_residual_later_in_sd=float(late.mean() / sd),
                note="y = MODIS or ESA anomaly, x = KNMI air-temperature anomaly; a negative later residual means the satellite series sits colder than the 2001-2020 relation to air temperature predicts")


def rnd(v, d=6):
    if isinstance(v, dict):
        return {k: rnd(x, d) for k, x in v.items()}
    if isinstance(v, (list, tuple, np.ndarray)):
        return [rnd(x, d) for x in v]
    if isinstance(v, (float, np.floating)):
        return None if not np.isfinite(v) else round(float(v), d)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def main():
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    OUT.mkdir(parents=True, exist_ok=True)
    tmx = read_monthly(HERE / "C-A_cru_ts410_tmx_raw.txt")
    tmp = read_monthly(HERE / "C-A_cru_ts410_tmp_raw.txt")
    t = np.array(YEARS, float)
    k_abs = jja(tmx, YEARS)
    k_anom = k_abs - k_abs.mean()
    kp_abs = jja(tmp, YEARS)
    kp_anom = kp_abs - kp_abs.mean()

    b = json.loads((ROOT / "web/data/bundle_C-A.json").read_text(encoding="utf-8"))
    assert b["regional"]["years"] == YEARS
    mod_anom = np.array(b["regional"]["anomaly"], float)       # registered MODIS Terra regional JJA anomaly, 2001-2025
    mod_base = float(b["regional"]["baseline_mean"])
    e = json.loads((ROOT / "web/data/witness/C-A_esa.json").read_text(encoding="utf-8"))
    Y24 = e["years"]
    assert Y24 == YEARS[:24]
    esa24 = np.array(e["series"]["esa_jja_anomaly_degC"], float)
    modfp24 = np.array(e["series"]["modis_terra_jja_anomaly_degC"], float)   # MODIS on ESA fixed footprint
    t24 = t[:24]
    k24 = k_anom[:24]

    tb_k25, tb_m25 = trend_block(k_anom, t), trend_block(mod_anom, t)
    tb_k24, tb_m24, tb_e24 = trend_block(k24, t24), trend_block(modfp24, t24), trend_block(esa24, t24)
    tb_kp = trend_block(kp_anom, t)
    mod_c = mod_anom - mod_anom.mean()
    d_km = k_anom - mod_c
    d_ke = (k24 - k24.mean()) - (esa24 - esa24.mean())
    d_km24 = (k24 - k24.mean()) - (modfp24 - modfp24.mean())
    tb_dkm, tb_dke, tb_dkm24 = trend_block(d_km, t), trend_block(d_ke, t24), trend_block(d_km24, t24)
    ag_km = agreement(k_anom, mod_anom, t)
    ag_ke = agreement(k24, esa24, t24)
    ag_km24 = agreement(k24, modfp24, t24)
    ag_kpm = agreement(kp_anom, mod_anom, t)

    div = dict(
        knmi_minus_modis_registered_2001_2025=late_vs_early(d_km, YEARS),
        knmi_minus_esa_2001_2024=late_vs_early(d_ke, Y24),
        knmi_minus_modis_same_footprint_2001_2024=late_vs_early(d_km24, Y24),
        residual_modis_on_knmi=residual_check(k_anom, mod_c, YEARS),
        residual_esa_on_knmi=residual_check(k24, esa24 - esa24.mean(), Y24),
        residual_modis_footprint24_on_knmi=residual_check(k24, modfp24 - modfp24.mean(), Y24),
        trend_of_difference_before_2021=dict(knmi_minus_modis=trend_block(d_km[:20], t[:20]),
                                             knmi_minus_esa=trend_block(d_ke[:20], t24[:20])),
        modis_tail_2021_2025_anomaly=[float(x) for x in mod_anom[-5:]],
        knmi_tail_2021_2025_anomaly=[float(x) for x in k_anom[-5:]],
    )
    sens20 = dict(knmi=trend_block(k_anom[:20], t[:20]), modis_registered=trend_block(mod_anom[:20], t[:20]),
                  agreement=agreement(k_anom[:20], mod_anom[:20], t[:20]))
    sens02 = dict(knmi=trend_block(k_anom[1:24], t[1:24]), esa=trend_block(esa24[1:], t24[1:]), modis=trend_block(modfp24[1:], t24[1:]))

    reg = b["regional"]
    same_sign_km = bool(np.sign(tb_k25["sen_per_decade"]) == np.sign(tb_m25["sen_per_decade"]))
    same_sign_ke = bool(np.sign(tb_k24["sen_per_decade"]) == np.sign(tb_e24["sen_per_decade"]))
    ov = lambda a, c: not (a["sen_ci95_per_decade"][1] < c["sen_ci95_per_decade"][0] or a["sen_ci95_per_decade"][0] > c["sen_ci95_per_decade"][1])

    result = dict(
        claim_id="C-A",
        status=("station-based air-temperature witness, exploratory check, not the registered test; the C-A verdict (withheld) is unchanged. "
                "It measures a different quantity (2 m air temperature, daily maximum) from the case (land surface skin temperature at the satellite overpass)."),
        title="A third witness from the ground: station-based summer daily maximum air temperature from KNMI Climate Explorer",
        generated_utc=now,
        witness=dict(
            name="KNMI Climate Explorer (Royal Netherlands Meteorological Institute)",
            dataset="CRU TS 4.10 maximum temperature (tmx), 0.5 degree, land points, 1901-2025",
            dataset_authors="Harris et al. 2020; University of East Anglia Climatic Research Unit (CRU)",
            how_made=("Climate Explorer 'Monthly observations' > Maximum temperature (land) > CRU TS 4.10 0.5 deg, 'Make average' over lat 30-37N, "
                      "lon 90W-75.5W, land points only (more than 50 percent land from the CRU land/sea mask, at least 30 percent valid points), "
                      "monthly series in degrees Celsius; JJA mean computed here as the plain mean of June, July and August"),
            page_url="https://climexp.knmi.nl/data/icru4_tmx_-90--75.5E_30-37N_firstyear-lastyear_n_5lan.dat",
            accessed="2026-11-14 (KNMI run stamp 2026-11-14 20:56:29)",
            saved_copy="data/witness_knmi/C-A_cru_ts410_tmx_raw.txt",
            sensitivity_dataset="CRU TS 4.10 mean temperature (tmp), same box and mask, saved copy data/witness_knmi/C-A_cru_ts410_tmp_raw.txt (run stamp 2026-11-14 20:57:13)",
            citation=CITATION,
            kind="station-based gridded analysis (weather stations interpolated to 0.5 degree); uses no satellite or reanalysis input, so it shares no input with MODIS or the ESA LST record",
            sensors="none (ground stations only)"),
        case=dict(claim_text="Summer daytime land surface temperature over the Southeastern United States has risen",
                  box=dict(lat_min=30, lat_max=37, lon_min=-90, lon_max=-75.5), season="JJA", period=[2001, 2025]),
        quantity_warning=("CRU tmx is the monthly mean of daily maximum air temperature at 2 m. The case product is MODIS Terra daytime land surface (skin) temperature at roughly "
                          "10:30 local overpass; ESA LST is also skin temperature. Skin and air temperature differ in level (skin is usually warmer by day, by an amount that depends on vegetation, "
                          "soil moisture and cloud), so levels are never compared; only trends and year-to-year changes are."),
        units=dict(temperature="degC", anomaly="degC"),
        years=YEARS,
        series=dict(
            knmi_cru_tmx_jja_degC=k_abs, knmi_cru_tmx_jja_anomaly_degC=k_anom,
            knmi_cru_tmp_jja_degC=kp_abs, knmi_cru_tmp_jja_anomaly_degC=kp_anom,
            modis_terra_registered_jja_anomaly_degC=mod_anom,
            modis_terra_same_footprint_as_esa_anomaly_degC=modfp24.tolist() + [None],
            esa_jja_anomaly_degC=esa24.tolist() + [None],
            knmi_minus_modis_registered_degC=d_km,
            knmi_minus_esa_degC=d_ke.tolist() + [None]),
        levels=dict(knmi_tmx_jja_mean_degC=float(k_abs.mean()), knmi_tmp_jja_mean_degC=float(kp_abs.mean()), modis_jja_mean_level_degC=mod_base,
                    note="levels are shown only so nobody mistakes the series for the same thing; they are different quantities and are not compared"),
        stats=dict(
            knmi_tmx_2001_2025=tb_k25, modis_terra_registered_2001_2025=tb_m25,
            knmi_tmx_2001_2024=tb_k24, esa_2001_2024=tb_e24, modis_same_footprint_2001_2024=tb_m24,
            knmi_tmp_2001_2025_sensitivity=tb_kp,
            difference_knmi_minus_modis_registered=tb_dkm,
            difference_knmi_minus_esa=tb_dke,
            difference_knmi_minus_modis_same_footprint=tb_dkm24,
            agreement_knmi_vs_modis_registered=ag_km, agreement_knmi_vs_esa=ag_ke, agreement_knmi_vs_modis_same_footprint=ag_km24,
            agreement_knmi_tmp_vs_modis_registered=ag_kpm,
            same_sign_knmi_modis=same_sign_km, same_sign_knmi_esa=same_sign_ke,
            knmi_ci_overlaps_modis_ci=bool(ov(tb_k25, tb_m25)), knmi_ci_overlaps_esa_ci=bool(ov(tb_k24, tb_e24)),
            sensitivity_2001_2020=sens20, sensitivity_2002_2024_without_2001=sens02),
        divergence_from_2021=div,
        registered_reference=dict(
            note="Copied read-only from the registered C-A bundle. Nothing in this file changes it.",
            sen_per_decade=reg["tests"]["sen"]["slope_per_decade"],
            hamed_rao_p=reg["tests"]["mk_hr"]["p"], verdict=b["verdict"]["id"]),
        caveat=("CRU TS tmx is built from weather-station records and does not depend on satellites or on a reanalysis model, but it has limits: the station network "
                "has changed over time; tmx is derived from gridded mean temperature and diurnal temperature range (the range from fewer stations than the mean), so it leans on "
                "interpolation and on the long-term climatology where stations are few; it covers land points only (the box includes Atlantic and Gulf ocean, which MODIS and ESA also drop, "
                "but the land masks differ); and the daily maximum falls in the afternoon, not at the satellite overpass. A match or mismatch in trend does not prove which satellite series is right. "
                "No causal claim is made."),
        scope_note="exploratory check, not the registered test. The registered result is the trend test in the case bundle (verdict withheld); nothing here replaces or changes it.",
        provenance=dict(script="data/witness_knmi/make_knmi_ca_witness.py", saved_copies=["data/witness_knmi/C-A_cru_ts410_tmx_raw.txt", "data/witness_knmi/C-A_cru_ts410_tmp_raw.txt"],
                        modis_source="web/data/bundle_C-A.json regional.anomaly (registered MOD11C3 V061 regional JJA anomaly, 25 seasons)",
                        esa_source="web/data/witness/C-A_esa.json (ESA LST CCI multi-sensor, 24 seasons; MODIS on ESA fixed footprint)"),
    )
    outp = OUT / "C-A_knmi.json"
    outp.write_text(json.dumps(rnd(result), indent=1), encoding="utf-8")
    print("wrote", outp)

    def pr(tag, bl):
        print(f"{tag}: n {bl['n']} Sen {bl['sen_per_decade']:+.3f}/dec CI [{bl['sen_ci95_per_decade'][0]:+.3f},{bl['sen_ci95_per_decade'][1]:+.3f}] "
              f"HR p {bl['p_hamed_rao_registered']:.4f} YW p {bl['p_yue_wang']:.4f} MKind {bl['p_mk_independent']:.4f} OLS {bl['ols_per_decade']:+.3f} p {bl['ols_p']:.3f}")
    for k_, v_ in (("KNMI tmx 01-25", tb_k25), ("MODIS reg 01-25", tb_m25), ("KNMI tmx 01-24", tb_k24), ("ESA 01-24", tb_e24), ("MODIS fp 01-24", tb_m24),
                   ("KNMI tmp 01-25", tb_kp), ("diff K-MODIS", tb_dkm), ("diff K-ESA", tb_dke), ("diff K-MODISfp", tb_dkm24)):
        pr(k_, v_)
    for k_, v_ in (("agree K~MODIS", ag_km), ("agree K~ESA", ag_ke), ("agree K~MODISfp", ag_km24), ("agree Ktmp~MODIS", ag_kpm)):
        print(k_, {a: round(c, 3) for a, c in v_.items() if isinstance(c, float)})
    print("divergence", json.dumps(rnd(div), indent=0)[:4500])
    print("sens20", {k_: (v_ if k_ == "agreement" else (v_['sen_per_decade'], v_['p_hamed_rao_registered'])) for k_, v_ in sens20.items()})
    print("sens02", {k_: (v_['sen_per_decade'], v_['p_hamed_rao_registered']) for k_, v_ in sens02.items()})
    print("tail knmi", k_anom[-5:], "modis", mod_anom[-5:])


if __name__ == "__main__":
    main()
