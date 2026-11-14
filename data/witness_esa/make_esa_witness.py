"""ESA LST CCI IRCDR (multi-sensor) witness for C-A: does an additional multi-sensor record agree with MODIS Terra?

EXPLORATORY CHECK, NOT THE REGISTERED TEST. Nothing here changes data\\C-A\\* or the C-A verdict (withheld).

Run:  stats\\.venv\\Scripts\\python.exe -I data\\witness_esa\\make_esa_witness.py <esa_raw_dir>
  <esa_raw_dir> holds the monthly npz subsets written by data\\scripts\\fetch_esa_lst.py (raw int16, masking OFF) and meta_new.json.
  Loads ONE month at a time. Writes web\\data\\witness\\C-A_esa.json.

Raw-to-physical (CEDA OPeNDAP .das of the 2005-07 file, same for all files): lst = raw*0.01 + 273.15 K (so degC = raw*0.01),
_FillValue -32768, valid_min -8315, valid_max 7685; solze = raw*0.01 deg; n = clear-sky pixel count (no scale);
lcc = land cover class (water 210, snow/ice 220, sea ice 230).
"""
import sys, json, datetime as dt
from pathlib import Path
import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stats"))
from trendtrial.aggregate import build_cube, climatology, cos_weights, regional_monthly, season_mean  # noqa: E402
from trendtrial.trend import mk_core, ols, regional_test_p, sen_ci_analytic  # noqa: E402

RAW = Path(sys.argv[1])
YEARS = list(range(2001, 2025))        # ESA record ends 2024 here; MODIS C-A is cut to the same years
K = 25                                 # 0.01 deg -> 0.25 deg (the C-A grid)
FILL = -32768
MIN_BLOCK_VALID = 0.5                  # same rule as C-A (block valid if >= 50% of fine cells valid)
P = dict(cov_threshold=0.8, min_season_month_frac=2 / 3, min_clim_frac=0.6)
ESA_URL = "https://dap.ceda.ac.uk/thredds/dodsC/neodc/esacci/land_surface_temperature/data/MULTISENSOR_IRCDR/L3S/0.01/v3.00/monthly"
PUG_URL = "https://admin.climate.esa.int/documents/3019/LST-CCI-D4.3-PUG_-_i3r1_-_Product_User_Guide.pdf"
ESA_DOI = "10.5285/b8be3f3993e54d309fddf61ea5d3674f"
ERA_ATSR, ERA_TERRA, ERA_S3B = "ATSR-2/AATSR (ERS-2, Envisat)", "Terra MODIS (ESA L3C V4.50)", "Sentinel-3B SLSTR"


def block_stat(a, valid):
    """k x k block mean of a over valid cells; block NaN if < MIN_BLOCK_VALID of cells valid."""
    ny, nx = a.shape
    a = np.where(valid, a, 0.0).reshape(ny // K, K, nx // K, K)
    v = valid.reshape(ny // K, K, nx // K, K)
    cnt = v.sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        m = a.sum(axis=(1, 3)) / cnt
    m[cnt / (K * K) < MIN_BLOCK_VALID] = np.nan
    return m


def load_esa():
    meta = json.loads((RAW / "meta_new.json").read_text())
    keys, lst_b, sol_b, n_b = [], [], [], []
    for y in YEARS:
        for mth in (6, 7, 8):
            k = f"{y}-{mth:02d}"
            f = RAW / f"{k}.npz"
            if not f.exists():
                continue
            z = np.load(f)
            lat, lon = z["lat"].astype(float), z["lon"].astype(float)
            raw = z["lst"]
            ok = (raw != FILL) & (raw >= -8315) & (raw <= 7685) & (z["n"] > 0)
            ok &= ~np.isin(z["lcc"], (210, 220, 230))        # not water / snow / sea ice
            lst_b.append(block_stat(raw.astype(np.float64) * 0.01, ok))
            sz = z["solze"]
            sol_b.append(block_stat(sz.astype(np.float64) * 0.01, ok & (sz != FILL)))
            n_b.append(block_stat(z["n"].astype(np.float64), ok))
            keys.append(k)
            del z, raw, ok
    lat_c = lat.reshape(-1, K).mean(1)
    lon_c = lon.reshape(-1, K).mean(1)
    return meta, keys, np.array(lst_b), np.array(sol_b), np.array(n_b), lat_c, lon_c


def regional_series(vals, year, month, support, lat):
    """Same chain as the case pipeline: cube -> per-cell per-month climatology -> anomalies -> cos-lat regional month -> JJA mean."""
    vals = np.where(support[None], vals, np.nan)
    cube = build_cube(vals, year, month, YEARS, [6, 7, 8])
    clim = climatology(cube, P["min_clim_frac"])
    w = cos_weights(lat, vals.shape[2])
    anom = cube - clim[None]
    denom = support[None] & np.isfinite(clim)
    reg_m, frac, _ = regional_monthly(anom, w, denom, P["cov_threshold"])
    ser, nvm = season_mean(reg_m, P["min_season_month_frac"])
    cl = np.nanmean(clim, axis=0)
    ok = support & np.isfinite(cl)
    level = float((w[ok] * cl[ok]).sum() / w[ok].sum())
    return ser, level


def raw_regional_mean(vals, year, support, lat):
    """Plain JJA regional mean (no anomalies), for descriptive series only (solar zenith, n)."""
    w = cos_weights(lat, vals.shape[2])
    out = []
    for y in YEARS:
        mm = []
        for i in np.where(year == y)[0]:
            ok = support & np.isfinite(vals[i])
            mm.append((vals[i][ok] * w[ok]).sum() / w[ok].sum())
        out.append(float(np.mean(mm)))
    return out


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


def rnd(v, d=4):
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
    meta, keys, esa, sol, nobs, lat_c, lon_c = load_esa()
    year = np.array([int(k[:4]) for k in keys])
    month = np.array([int(k[5:]) for k in keys])
    print("ESA months loaded", len(keys), esa.shape)

    ca = np.load(ROOT / "data" / "C-A" / "monthly.npz")
    lat, lon, sup = ca["lat"], ca["lon"], ca["support"].astype(bool)
    assert np.allclose(lat, lat_c, atol=1e-6) and np.allclose(lon, lon_c, atol=1e-6), "ESA blocks do not line up with the C-A grid"
    mod = ca["values"].astype(np.float64)
    my, mm = ca["year"], ca["month"]
    sel = np.isin(my, YEARS)
    mod, my, mm = mod[sel], my[sel], mm[sel]

    # ---- footprints
    esa_valid_all = np.isfinite(esa).all(axis=0)
    esa_valid_frac = np.isfinite(esa).mean(axis=0)
    mod_ok = np.isfinite(np.where(sup[None], mod, np.nan)).all(axis=0)
    n_support = int(sup.sum())
    n_esa_all = int((sup & esa_valid_all).sum())
    fp_both = sup & esa_valid_all & mod_ok
    fp_relaxed = sup & (esa_valid_frac >= 0.9)
    print("C-A support", n_support, "| ESA valid all months", n_esa_all, "| fixed footprint", int(fp_both.sum()), "| relaxed", int(fp_relaxed.sum()))

    t = np.array(YEARS, float)
    w = json.loads((ROOT / "web" / "data" / "witness" / "C-A.json").read_text(encoding="utf-8"))
    w_vt, w_power_t2m = w["series"]["view_time_utc_h"], w["series"]["power_t2m_degC"]

    def both(fpm):
        e, e_level = regional_series(esa, year, month, fpm, lat)
        m_, m_level = regional_series(mod, my, mm, fpm, lat)
        return dict(esa=e, mod=m_, esa_level=e_level, mod_level=m_level)

    main_ = both(fp_both)
    relaxed = both(fp_relaxed)
    modis_own = regional_series(mod, my, mm, sup, lat)

    bundle = json.loads((ROOT / "stats" / "out" / "C-A" / "bundle.json").read_text(encoding="utf-8"))
    reg_sen = bundle["regional"]["tests"]["sen"]["slope_per_decade"]
    reg_p = bundle["regional"]["tests"]["mk_hr"]["p"]

    e, m_ = main_["esa"], main_["mod"]
    assert np.isfinite(e).all() and np.isfinite(m_).all(), (e, m_)
    tb_e, tb_m = trend_block(e, t), trend_block(m_, t)
    tb_m_own = trend_block(modis_own[0], t)
    diff = e - m_
    tb_d = trend_block(diff, t)
    ag = agreement(e, m_, t)
    tb_e_rel, tb_m_rel = trend_block(relaxed["esa"], t), trend_block(relaxed["mod"], t)
    ag_rel = agreement(relaxed["esa"], relaxed["mod"], t)
    tb_e20, tb_m20 = trend_block(e[:20], t[:20]), trend_block(m_[:20], t[:20])
    print("ESA", tb_e["sen_per_decade"], tb_e["p_hamed_rao_registered"], tb_e["p_yue_wang"], tb_e["p_mk_independent"])
    print("MODIS same fp", tb_m["sen_per_decade"], tb_m["p_hamed_rao_registered"], tb_m["p_yue_wang"], tb_m["p_mk_independent"])
    print("MODIS own support 2001-24", tb_m_own["sen_per_decade"], tb_m_own["p_hamed_rao_registered"])
    print("registered 2001-25", reg_sen, reg_p, "| r", ag["pearson_r"], "| diff trend", tb_d["sen_per_decade"], tb_d["p_hamed_rao_registered"])

    # ---- sensors, eras, steps
    sens = {y: sorted({meta[k]["platform"] + " " + meta[k]["sensor"] for k in keys if k.startswith(str(y))}) for y in YEARS}
    eras = {ERA_ATSR: [y for y in YEARS if y <= 2011], ERA_TERRA: [y for y in YEARS if 2012 <= y <= 2018], ERA_S3B: [y for y in YEARS if y >= 2019]}
    idx = {y: i for i, y in enumerate(YEARS)}
    era_rows, era_r = [], {}
    for name, ys in eras.items():
        ii = [idx[y] for y in ys]
        d = diff[ii]
        era_rows.append(dict(era=name, years=[ys[0], ys[-1]], n=len(ys), mean_diff_esa_minus_modis=float(d.mean()), sd=float(d.std(ddof=1))))
        r = stats.pearsonr(e[ii], m_[ii])
        era_r[name] = dict(r=float(r[0]), p=float(r[1]), n=len(ys))
    # descriptive step model on the difference: one level per sensor change (2012 Terra in, 2019 Sentinel-3B in) plus one at 2021 (start of Terra's overpass drift)
    X = np.column_stack([np.ones(len(YEARS)), (t >= 2012).astype(float), (t >= 2019).astype(float), (t >= 2021).astype(float)])
    beta = np.linalg.lstsq(X, diff, rcond=None)[0]
    res = diff - X @ beta
    dfree = len(YEARS) - X.shape[1]
    se = np.sqrt(np.diag(res @ res / dfree * np.linalg.inv(X.T @ X)))
    pv = 2 * stats.t.sf(np.abs(beta / se), dfree)
    steps = dict(model="difference (ESA minus MODIS) = a + c2012*[year>=2012] + c2019*[year>=2019] + c2021*[year>=2021]; OLS levels, descriptive, not a test of cause; years are autocorrelated so the p values are indicative only",
                 step_2012_degC=float(beta[1]), step_2012_se=float(se[1]), step_2012_p=float(pv[1]),
                 step_2019_degC=float(beta[2]), step_2019_se=float(se[2]), step_2019_p=float(pv[2]),
                 step_2021_degC=float(beta[3]), step_2021_se=float(se[3]), step_2021_p=float(pv[3]), df=int(dfree))
    vt_a = np.array(w_vt[:24], float)
    r_vt = stats.pearsonr(vt_a, diff)
    # sensitivity: drop 2001 (July-August only, ATSR-2)
    tb_e02, tb_m02 = trend_block(e[1:], t[1:]), trend_block(m_[1:], t[1:])
    # independent air-temperature cross-check (NASA POWER, already in the C-A witness file; over the C-A land support, so a slightly larger footprint)
    t2m = np.array(w_power_t2m[:24], float)
    t2m_anom = t2m - t2m.mean()
    e_c, m_c = e - e.mean(), m_ - m_.mean()
    air = dict(note="NASA POWER T2M (regional JJA mean over the C-A land support, from the C-A witness file); anomalies re-centered on 2001-2024; footprint differs slightly from the fixed footprint",
               esa=dict(pearson_r=float(stats.pearsonr(e_c, t2m_anom)[0]), mean_gap_2021_2024=float((e_c - t2m_anom)[-4:].mean()), mean_gap_2001_2020=float((e_c - t2m_anom)[:20].mean())),
               modis=dict(pearson_r=float(stats.pearsonr(m_c, t2m_anom)[0]), mean_gap_2021_2024=float((m_c - t2m_anom)[-4:].mean()), mean_gap_2001_2020=float((m_c - t2m_anom)[:20].mean())),
               power_t2m_trend=trend_block(t2m_anom, t), esa_minus_t2m_trend=trend_block(e_c - t2m_anom, t), modis_minus_t2m_trend=trend_block(m_c - t2m_anom, t))
    d_late = float(diff[[idx[y] for y in (2021, 2022, 2023, 2024)]].mean())
    d_early = float(diff[[idx[y] for y in range(2001, 2021)]].mean())

    sol_y = raw_regional_mean(sol, year, fp_both, lat)
    n_y = raw_regional_mean(nobs, year, fp_both, lat)
    vt = w["series"]["view_time_utc_h"][:24]

    same_sign = bool(np.sign(tb_e["sen_per_decade"]) == np.sign(tb_m["sen_per_decade"]))
    overlap = not (tb_e["sen_ci95_per_decade"][1] < tb_m["sen_ci95_per_decade"][0] or tb_e["sen_ci95_per_decade"][0] > tb_m["sen_ci95_per_decade"][1])

    src_rows = [dict(first_month=k, platform=meta[k]["platform"], sensor=meta[k]["sensor"], source=meta[k]["source"])
                for i, k in enumerate(keys) if i == 0 or meta[k]["source"] != meta[keys[i - 1]]["source"]]
    result = dict(
        claim_id="C-A",
        status="additional multi-sensor comparison record, exploratory check, not the registered test; the C-A verdict (withheld) is unchanged",
        title="A second witness from space: the ESA LST CCI multi-sensor record (ATSR-2, AATSR, Terra MODIS, Sentinel-3B SLSTR)",
        generated_utc=now,
        witness=dict(
            name="ESA Land Surface Temperature Climate Change Initiative (LST_cci), IRCDR multi-sensor L3S, monthly daytime, 0.01 degree, v3.00",
            doi=ESA_DOI,
            product_user_guide="ESA LST_cci Product User Guide LST-CCI-D4.3-PUG v3.1 (15 Jan 2024), section 4.9 / Table 15 (pp. 41-43) and section 6.2 (p. 62). " + PUG_URL,
            data_url=ESA_URL,
            access="anonymous OPeNDAP subsets (box 30-37N, 90W-75.5W, June-August), raw int16 scaled here; fetch script data/scripts/fetch_esa_lst.py",
            sensor_sources_in_order=src_rows,
            important_caveat=("From June 2012 to May 2019 the ESA multi-sensor record is itself built from MODIS on Terra (ESA's own L3C V4.50 processing of Terra MODIS). "
                              "So ESA is independent of the NASA MOD11C3 product and of Terra's late-record drift only in 2001-2011 (ATSR-2/AATSR) and 2019-2024 (Sentinel-3B); "
                              "in 2012-2018 it shares the Terra instrument with C-A."),
            time_of_day_handling=("The user guide says the multi-sensor record is intercalibrated to IASI and then given a temporal correction to a common local equatorial crossing time, "
                                  "with Terra MODIS as the reference sensor. It documents this for the v2.0 record; the v3.00 monthly files used here carry no time-correction variable, "
                                  "so how far the correction applies to these v3.00 daytime months is not confirmed from the files."),
            known_breaks=("The guide names the sensor transitions (ATSR-2 to AATSR 2002, AATSR to Terra MODIS 2012, Terra MODIS to Sentinel-3 SLSTR) and warns that inconsistencies or discontinuities may occur "
                          "when sensors change; its stability line for the ATSR-2/AATSR period is -0.41 to 0.25 K per decade (global, against air temperature). No step sizes are published for this region."),
        ),
        case=dict(claim_text=w["claim_text"], box=dict(lat_min=30, lat_max=37, lon_min=-90, lon_max=-75.5), season="JJA", period_compared=[2001, 2024],
                  note="ESA stops at 2024 here, so MODIS C-A is cut to the same 24 seasons. 2001 has July and August only (ESA has no June 2001 file)."),
        units=dict(temperature="degC", anomaly="degC"),
        years=YEARS,
        series=dict(
            esa_jja_anomaly_degC=e, modis_terra_jja_anomaly_degC=m_, esa_minus_modis_degC=diff,
            esa_jja_mean_level_degC=main_["esa_level"], modis_jja_mean_level_degC=main_["mod_level"],
            modis_terra_view_time_utc_h=vt,
            esa_mean_solar_zenith_deg=sol_y, esa_mean_clear_sky_pixels_per_0p01_cell_month=n_y,
            sensors_per_year={str(y): sens[y] for y in YEARS}),
        footprint=dict(
            rule=("fixed footprint: the C-A land-support cells (0.25 degree) that are valid in every ESA month and every MODIS month. A 0.25 degree cell is valid in a month if at least 50% of its 625 "
                  "fine ESA pixels are valid (not water/snow, lst in range, n>0), the same 50% rule as C-A. Anomalies are per cell and per calendar month against the 2001-2024 mean "
                  "of that cell, then cos(latitude)-weighted, then averaged over June-August."),
            cells_ca_land_support=n_support, cells_esa_valid_all_months_in_support=n_esa_all, cells_fixed_footprint=int(fp_both.sum()),
            cells_relaxed_sensitivity=int(fp_relaxed.sum()), esa_months_loaded=len(keys), esa_months_expected=72,
            missing_month="2001-06: no file exists on the CEDA server (HTTP 404 on the .das request); the record here starts in July 2001",
            grid_cells=[int(len(lat)), int(len(lon))]),
        trend=dict(
            esa=tb_e, modis_terra_same_footprint_2001_2024=tb_m, modis_terra_registered_support_2001_2024=tb_m_own,
            modis_terra_registered_2001_2025=dict(sen_per_decade=reg_sen, p_hamed_rao_registered=reg_p, note="copied read-only from the C-A bundle (25 seasons)"),
            esa_minus_modis=tb_d,
            sensitivity_relaxed_footprint=dict(esa=tb_e_rel, modis=tb_m_rel, agreement=ag_rel, cells=int(fp_relaxed.sum())),
            sensitivity_2001_2020_before_terra_drift=dict(esa=tb_e20, modis=tb_m20),
            sensitivity_2002_2024_without_2001=dict(esa=tb_e02, modis=tb_m02),
            air_temperature_cross_check=air,
            p_note=("No regional test is shipped for C-A (the gate withheld the verdict). p_hamed_rao_registered is the Hamed-Rao Mann-Kendall used as the registered headline; "
                    "p_yue_wang is the Yue-Wang variant, which stayed closest to nominal size for this series in the gate table; p_mk_independent treats years as independent.")),
        agreement=dict(esa_vs_modis=ag, pearson_r_by_era=era_r),
        sensor_changes=dict(era_mean_difference=era_rows, step_model=steps, mean_diff_2021_2024=d_late, mean_diff_2001_2020=d_early, difference_vs_terra_view_time=dict(pearson_r=float(r_vt[0]), p=float(r_vt[1]), n=24, note='dominated by the four drift years; a correlation of two series that both change at the end is not evidence of cause'),
                            note="Anomaly differences, ESA minus MODIS Terra, same footprint. Steps are descriptive; there are 6 to 11 seasons per era."),
        reading=dict(same_sign=same_sign, esa_ci_overlaps_modis_ci=bool(overlap)),
        method_notes=["Registered C-A uses MOD11C3 0.05 degree block-meaned to 0.25 degree; ESA 0.01 degree is block-meaned 25x25 to the same grid.",
                      "Statistics are the shipped stats\\trendtrial functions (mk_core, sen_ci_analytic, regional_test_p, ols); Sen slope in degC per decade.",
                      "ESA lst is the mean of clear-sky daytime observations in the month; the monthly files keep no overpass time beyond solze and n.",
                      "Exploratory check; nothing here changes the registered result or the withheld verdict."],
        provenance=dict(esa_doi=ESA_DOI, esa_product_page="https://catalogue.ceda.ac.uk/uuid/e67b02b814bf4a78b9ec90b4259f0741/",
                        esa_opendap_base=ESA_URL, pug=PUG_URL,
                        modis_product="MOD11C3 V061, doi 10.5067/MODIS/MOD11C3.061 (data/C-A/monthly.npz)",
                        script="data/witness_esa/make_esa_witness.py", fetch_script="data/scripts/fetch_esa_lst.py",
                        scaling_source=ESA_URL + "/2005/07/ESACCI-LST-L3S-LST-IRCDR_-0.01deg_1MONTHLY_DAY-20050701000000-fv3.00.nc.das"),
    )
    outp = ROOT / "web" / "data" / "witness" / "C-A_esa.json"
    outp.write_text(json.dumps(rnd(result), indent=1), encoding="utf-8")
    print("wrote", outp)
    print(json.dumps(rnd(dict(steps=steps, eras=era_rows, r_eras=era_r, d_late=d_late, d_early=d_early, tb_d=tb_d, ag=ag, tb_e20=tb_e20, tb_m20=tb_m20, e02=tb_e02, m02=tb_m02, air=air, r_vt=r_vt,
                              rel_esa=tb_e_rel, rel_mod=tb_m_rel, rel_ag=ag_rel, esa_ci=tb_e["sen_ci95_per_decade"], mod_ci=tb_m["sen_ci95_per_decade"],
                              e=e, m=m_, sol=sol_y, n=n_y)), indent=0))


if __name__ == "__main__":
    main()
