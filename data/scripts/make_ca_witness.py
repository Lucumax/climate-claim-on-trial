"""C-A 'cross-examine the witness' panel data: MODIS Terra Day_view_time, POWER TS and T2M, and the exploratory checks.
EXPLORATORY CHECK, NOT THE REGISTERED TEST. Nothing here changes data\\C-A\\claim.json or monthly.npz.

Two stages (the data venv has no scipy; the stats venv has no netCDF4/earthaccess):
  data\\.venv\\Scripts\\python.exe -I data\\scripts\\make_ca_witness.py fetch <scratch_dir>
      75 own DAP4 requests for Day_view_time (one variable per request), 5 threads; POWER regional monthly TS and T2M
      (10-degree tiles, no key). Raw intermediates go to <scratch_dir> (outside the repo). Token: via _token.py, never printed.
  stats\\.venv\\Scripts\\python.exe -I data\\scripts\\make_ca_witness.py build <scratch_dir>
      block-means view time with the same land support, writes data\\C-A\\C-A_view_time.npz, C-A_view_time_provenance.json
      and web\\data\\witness\\C-A.json.
"""
import sys, json, hashlib, time, re, importlib.util, datetime as dt
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                      # data\
REPO = ROOT.parent
CA = ROOT / "C-A"
POWER = "https://power.larc.nasa.gov/api/temporal/monthly/regional"
TILES = [(-90, -80), (-80, -75.5)]      # 10-degree longitude tiles; latitude 30-37 is a single 7-degree tile
YEARS = list(range(2001, 2026))


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def sha_bytes(b): return hashlib.sha256(b).hexdigest()


# ------------------------------------------------------------------ fetch stage
def stage_fetch(scratch):
    import pickle, requests
    from concurrent.futures import ThreadPoolExecutor
    fe = _load("fetch_earthdata", HERE / "fetch_earthdata.py")
    if not _load("_token", HERE / "_token.py").ensure_token(): sys.exit("TOKEN_MISSING")
    import earthaccess
    if not getattr(earthaccess.login(strategy="environment"), "authenticated", False): sys.exit("AUTH_FAIL")
    session = earthaccess.get_requests_https_session()
    gl = json.loads((CA / "C-A_cmr_granules.json").read_text())["granules"]
    t0 = time.time()

    def one(g):
        for a in range(3):
            try:
                hrs, attrs = fe.a_view_time_opendap(session, g)
                return g, hrs, attrs
            except Exception as e:
                if a == 2: raise
                time.sleep(5 * (a + 1))
    out = []
    with ThreadPoolExecutor(5) as ex:
        for i, r in enumerate(ex.map(one, gl)):
            out.append(r)
            if i % 10 == 0: print("view time", i, round(time.time() - t0), "s", flush=True)
    hrs = np.stack([o[1] for o in out]).astype(np.float32)          # (75, 140, 290) south-north, hours UTC
    np.savez_compressed(Path(scratch) / "vt_native.npz", hrs=hrs, year=[o[0]["year"] for o in out], month=[o[0]["month"] for o in out],
                        ur=[o[0]["granule_ur"] for o in out], sha=[sha_bytes(o[1].tobytes()) for o in out],
                        attrs=json.dumps(out[0][2]))
    print("view time done", round(time.time() - t0), "s; native", hrs.shape, "valid frac", float(np.isfinite(hrs).mean()), flush=True)

    # POWER: one parameter per call, tiles in longitude
    urls, P = [], {}
    for par in ("TS", "T2M"):
        cells = {}
        for lo, hi in TILES:
            params = {"parameters": par, "community": "RE", "latitude-min": 30, "latitude-max": 37, "longitude-min": lo, "longitude-max": hi,
                      "start": 2001, "end": 2025, "format": "JSON"}
            for a in range(4):
                r = requests.get(POWER, params=params, timeout=300)
                if r.status_code == 200: break
                time.sleep(5 * (a + 1))
            r.raise_for_status(); urls.append(r.url)
            for f in r.json()["features"]:
                lon, lat = f["geometry"]["coordinates"][:2]
                cells[(lat, lon)] = f["properties"]["parameter"][par]
            print("POWER", par, lo, hi, len(cells), flush=True)
        P[par] = cells
    pickle.dump(dict(P=P, urls=urls, retrieved_utc=dt.datetime.now(dt.timezone.utc).isoformat()), open(Path(scratch) / "power.pkl", "wb"))
    print("POWER done", flush=True)


# ------------------------------------------------------------------ build stage
def sen(x, y=YEARS):
    from scipy import stats as st
    s, ic, lo, hi = st.theilslopes(x, y, alpha=0.95)
    return dict(per_decade=round(s * 10, 3), ci95_low=round(lo * 10, 3), ci95_high=round(hi * 10, 3),
                mann_kendall_p=round(float(st.kendalltau(y, x)[1]), 3))


def ols(X, y):
    """OLS with intercept; returns coefficients, 95% CI (t, n-k df), p-values."""
    from scipy import stats as st
    X = np.column_stack([np.ones(len(y))] + list(X)); n, k = X.shape
    b = np.linalg.lstsq(X, y, rcond=None)[0]; res = y - X @ b; s2 = res @ res / (n - k)
    se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X))); t = st.t.ppf(0.975, n - k)
    p = 2 * st.t.sf(np.abs(b / se), n - k)
    r2 = 1 - (res @ res) / ((y - y.mean()) @ (y - y.mean()))
    return b, se, b - t * se, b + t * se, p, r2, n - k


def stage_build(scratch):
    import pickle
    from scipy import stats as st
    fe = _load("fetch_earthdata", HERE / "fetch_earthdata.py")      # only for block_mean / block_axis (no network in import)
    d = np.load(CA / "monthly.npz")
    lat, lon, sup = d["lat"], d["lon"], d["support"]
    year, month, lst = d["year"], d["month"], d["values"].astype(np.float64)
    v = np.load(Path(scratch) / "vt_native.npz")
    assert (v["year"] == year).all() and (v["month"] == month).all(), "granule order differs from monthly.npz"
    nat = v["hrs"].astype(np.float64)
    vt = fe.block_mean(nat, 5).astype(np.float32)                  # same 5 x 5 rule (valid if >= 50% of native cells valid)
    assert vt.shape == lst.shape
    # the view time can only be used where LST is a land cell in the support
    vt_sup = np.where(sup[None], vt, np.nan)
    vt_valid_in_support = float(np.isfinite(vt_sup[:, sup]).mean())

    # ---- UTC or local solar? test the east-west gradient of the mean view time over support cells
    vm = np.nanmean(vt_sup, axis=0)
    lons_grid = np.broadcast_to(lon[None, :], sup.shape)
    ok = sup & np.isfinite(vm)
    slope_h_per_deg = np.polyfit(lons_grid[ok], vm[ok], 1)[0]       # UTC: about -1/15 = -0.067 h per degree of longitude

    W = np.cos(np.deg2rad(lat))[:, None] * np.ones(len(lon))[None, :]

    def reg(cube, extra=None):
        out = np.full(cube.shape[0], np.nan)
        for i in range(cube.shape[0]):
            m = sup & np.isfinite(cube[i]); out[i] = (cube[i][m] * W[m]).sum() / W[m].sum()
        return out

    def jja(m): return np.array([m[year == y].mean() for y in YEARS])
    lst_y = jja(reg(lst))
    vt_utc_y = jja(reg(vt_sup))
    solar_off = np.broadcast_to((lon / 15.0)[None, :], sup.shape)
    vt_loc = vt_sup + solar_off[None]
    vt_loc_y = jja(reg(vt_loc))
    centre_lon = float(np.average(lons_grid[sup], weights=W[sup]))     # land-support centroid (area weighted)
    box_centre_lon = (-90 + -75.5) / 2

    # ---- POWER: same land cells (nearest 0.25-degree block is in the support), cos-lat weights, JJA mean of monthly regional means
    pk = pickle.load(open(Path(scratch) / "power.pkl", "rb"))

    def pser(par):
        cells = [c for c in pk["P"][par] if 30 <= c[0] <= 37 and -90 <= c[1] <= -75.5]
        keep = [c for c in cells if sup[np.argmin(abs(lat - c[0])), np.argmin(abs(lon - c[1]))]]
        w = np.cos(np.deg2rad([c[0] for c in keep]))
        arr = np.array([[pk["P"][par][c][f"{y}{m:02d}"] for m in (6, 7, 8)] for y in YEARS for c in keep]).reshape(len(YEARS), len(keep), 3)
        assert (arr > -900).all(), "POWER fill value present"
        return ((arr * w[None, :, None]).sum(axis=1) / w.sum()).mean(axis=1), len(keep), len(cells)
    ts_y, n_ts, n_all = pser("TS"); t2m_y, n_t2m, _ = pser("T2M")
    gap = lst_y - ts_y

    # ---- statistics (all exploratory)
    yr = np.array(YEARS, float)
    pre = yr <= 2019
    S = dict(
        lst_day=sen(lst_y), power_ts=sen(ts_y), power_t2m=sen(t2m_y), lst_minus_ts=sen(gap), view_time_utc=sen(vt_utc_y),
        lst_day_2001_2019=sen(lst_y[pre], yr[pre]), power_ts_2001_2019=sen(ts_y[pre], yr[pre]), power_t2m_2001_2019=sen(t2m_y[pre], yr[pre]),
        lst_minus_ts_2001_2019=sen(gap[pre], yr[pre]), view_time_utc_2001_2019=sen(vt_utc_y[pre], yr[pre]))
    # gap vs view time
    r, p_r = st.pearsonr(vt_utc_y, gap); sp, p_sp = st.spearmanr(vt_utc_y, gap)
    b, se, lo_, hi_, pv, r2, df = ols([vt_utc_y], gap)
    gap_vt = dict(pearson_r=round(float(r), 3), pearson_p=float(f"{p_r:.2g}"), spearman_rho=round(float(sp), 3), n=len(YEARS),
                  ols_slope_degC_per_hour=round(float(b[1]), 3), ols_slope_ci95=[round(float(lo_[1]), 3), round(float(hi_[1]), 3)])
    post = yr >= 2020
    if post.sum() >= 4:
        b2 = np.polyfit(vt_utc_y[post], gap[post], 1)
        gap_vt["slope_2020_2025_degC_per_hour"] = round(float(b2[0]), 3); gap_vt["r_2020_2025"] = round(float(np.corrcoef(vt_utc_y[post], gap[post])[0, 1]), 3)
        gap_vt["n_2020_2025"] = int(post.sum())
    # view-time-adjusted LST slope: OLS  LST = a + b*year + c*view_time (UTC hours; local solar differs by a constant so c and b are unchanged)
    b, se, lo_, hi_, pv, r2, df = ols([yr, vt_utc_y], lst_y)
    adj = dict(method="OLS regression of the yearly JJA regional LST on year and the yearly JJA regional mean Day_view_time (hours): LST = a + b*year + c*view_time, n = 25, residual df = %d; 95%% CI from the t distribution." % df,
               slope_year_per_decade=round(float(b[1] * 10), 3), slope_ci95_per_decade=[round(float(lo_[1] * 10), 3), round(float(hi_[1] * 10), 3)], p_value=round(float(pv[1]), 3),
               view_time_coef_degC_per_hour=round(float(b[2]), 3), view_time_coef_ci95=[round(float(lo_[2]), 3), round(float(hi_[2]), 3)], view_time_coef_p=round(float(pv[2]), 3), r2=round(float(r2), 3))
    b0, se0, lo0, hi0, pv0, r20, _ = ols([yr], lst_y)
    unadj_ols = dict(slope_year_per_decade=round(float(b0[1] * 10), 3), slope_ci95_per_decade=[round(float(lo0[1] * 10), 3), round(float(hi0[1] * 10), 3)], p_value=round(float(pv0[1]), 3))
    # alternative (QA R1 style): correct LST to the 2001-2019 mean view time using the gap-vs-view-time slope, then Sen
    k = float(np.polyfit(vt_utc_y, gap, 1)[0]); vref = float(vt_utc_y[pre].mean())
    lst_adj2 = lst_y - k * (vt_utc_y - vref)
    adj2 = dict(method="Alternative: LST minus k*(view_time - mean 2001-2019 view_time), k = slope of (LST - POWER TS) on view time (degC per hour); then Sen slope.",
                k_degC_per_hour=round(k, 3), reference_view_time_utc_h=round(vref, 2), sen=sen(lst_adj2))
    # adjusted slope from the 2001-2019 subset for reference is in S (no view-time drift in that window)

    def r3(a): return [round(float(x), 3) for x in a]
    N = "exploratory check, not the registered test"
    out = {
        "claim_id": "C-A", "status": N, "title": "Cross-examine the witness: Terra's overpass time drifted",
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "claim_text": "Summer daytime land surface temperature over the Southeastern United States has risen (box 30-37N, 90W-75.5W, JJA 2001-2025)",
        "note_on_scope": N + ". The registered result is the trend test in the case bundle; nothing on this page replaces it.",
        "years": YEARS, "units": dict(temperature="degC", view_time="hours"),
        "series": dict(
            view_time_utc_h=r3(vt_utc_y), view_time_local_solar_h=r3(vt_loc_y), lst_day_degC=r3(lst_y), power_ts_degC=r3(ts_y), power_t2m_degC=r3(t2m_y),
            lst_minus_ts_degC=r3(gap)),
        "view_time": dict(
            reported_as="",
            east_west_check=dict(slope_hours_per_degree_longitude=round(float(slope_h_per_deg), 4), utc_expectation=round(-1 / 15, 4), local_solar_expectation=0.0,
                                 reading="A value near -0.067 h per degree means the field is hours UTC; near 0 would mean local solar time."),
            local_solar_conversion="local solar = UTC + longitude/15, applied cell by cell, then averaged with the same weights. About 85 W: box centre %.2f W, area-weighted land centre %.2f W, so local solar is roughly UTC minus %.1f h." % (-box_centre_lon, -centre_lon, -centre_lon / 15),
            first_five_years_mean_utc=round(float(vt_utc_y[:5].mean()), 2), last_five_years_mean_utc=round(float(vt_utc_y[-5:].mean()), 2),
            mean_2001_2019_utc=round(float(vt_utc_y[pre].mean()), 2), mean_2020_2025_utc=round(float(vt_utc_y[post].mean()), 2),
            mean_2001_2019_local_solar=round(float(vt_loc_y[pre].mean()), 2), mean_2020_2025_local_solar=round(float(vt_loc_y[post].mean()), 2),
            change_2001_2019_to_2025_hours=round(float(vt_utc_y[-1] - vt_utc_y[pre].mean()), 2)),
        "summary": dict(
            label=N,
            sen_per_decade=dict(lst_day=S["lst_day"], power_ts=S["power_ts"], power_t2m=S["power_t2m"], lst_minus_ts=S["lst_minus_ts"], view_time_hours=S["view_time_utc"]),
            subset_2001_2019_sen_per_decade=dict(lst_day=S["lst_day_2001_2019"], power_ts=S["power_ts_2001_2019"], power_t2m=S["power_t2m_2001_2019"],
                                                 lst_minus_ts=S["lst_minus_ts_2001_2019"], view_time_hours=S["view_time_utc_2001_2019"]),
            gap_vs_view_time=gap_vt,
            view_time_adjusted_lst=dict(label=N, ols_with_view_time=adj, ols_without_view_time=unadj_ols, alternative_correction=adj2),
            warning="25 annual points and a view time that moves in one step (flat to 2019, then down); year and view time are strongly confounded, so the adjusted slope has a wide interval. It shows size and direction, not an exact correction."),
        "method": dict(
            lst="data\\C-A\\monthly.npz (MOD11C3 v061 LST_Day_CMG, 0.25 degree block means, land support of %d cells); area-weighted (cos latitude) regional mean per month, JJA mean of the three monthly means; the same series the case uses (before anomalies)." % int(sup.sum()),
            view_time="MOD11C3 Day_view_time (uint8, scale 0.2 h, fill 255, valid 0-120), own DAP4 request per granule, same 5x5 block mean rule (valid if >=50%% of native cells valid), same support and weights; %.4f of support cells valid over all 75 months." % vt_valid_in_support,
            power="NASA POWER monthly regional, community RE, parameters TS (earth skin temperature) and T2M, tiles lon -90..-80 and -80..-75.5, lat 30-37; %d land cells kept of %d returned (POWER cell kept when its nearest 0.25 degree LST block is in the support); same cos-latitude weights; JJA mean of monthly regional means. MERRA-2 based, model data." % (n_ts, n_all),
            sen="Theil-Sen slope (scipy.stats.theilslopes, 95% interval) per decade; Mann-Kendall p from Kendall tau.",
            gap="LST minus POWER TS per year, degC (positive means MODIS warmer than the model's skin temperature)."),
        "caveats": [
            "Exploratory check, not the registered test.",
            "POWER TS and T2M are MERRA-2 model output, not observations, and have their own inhomogeneities.",
            "MODIS LST is clear-sky only; POWER is all-sky; a constant offset between them is expected, a changing one is what the panel looks at.",
            "Terra's equator crossing time drifted earlier after 2020 (when orbit-maintenance burns stopped); cite NASA for that before using it in the write-up. The in-data Day_view_time series is the evidence used here."],
        "files": dict(view_time_npz="data\\C-A\\C-A_view_time.npz", provenance="data\\C-A\\C-A_view_time_provenance.json", script="data\\scripts\\make_ca_witness.py"),
    }
    # 'reported_as' is set from the east-west test, not assumed
    out["view_time"]["reported_as"] = ("hours UTC" if slope_h_per_deg < -0.03 else "local solar time (hours)") + " (see east_west_check)"
    wdir = REPO / "web" / "data" / "witness"; wdir.mkdir(parents=True, exist_ok=True)
    (wdir / "C-A.json").write_text(json.dumps(out, indent=1))

    # ---- view time npz + provenance
    np.savez_compressed(CA / "C-A_view_time.npz", view_time=vt.astype(np.float32), lat=lat, lon=lon, year=year, month=month, support=sup,
                        units=np.array("hours (UTC), 0.2 h steps, 255 fill to NaN; 5x5 block mean of the 0.05 degree cells, valid if >=50% valid"))
    prov = dict(claim="C-A", variable="Day_view_time", short_name="MOD11C3", version="061", doi="10.5067/MODIS/MOD11C3.061", concept_id="C2565788897-LPCLOUD",
                path_in_file="/MODIS_MONTHLY_0_05DEG_CMG_LST/Data_Fields/Day_view_time[1060:1199][1800:2089]",
                access_route="Earthdata Login via environment token (value never printed or stored); OPeNDAP DAP4 server-side subset, one variable per request (a combined multi-variable constraint returned HTTP 400)",
                decode="real hours = 0.2 * stored (uint8); stored 255 (fill) and > 120 (outside valid_range 0-120) set to NaN; rows flipped south-to-north like LST; then the same 5x5 block mean (valid if >= 50% native cells valid)",
                attrs_first_granule=json.loads(str(v["attrs"])),
                granules=[dict(granule_ur=str(u), year=int(a), month=int(m), sha256_decoded_native_float32=str(s)) for u, a, m, s in zip(v["ur"], year, month, v["sha"])],
                sha256_note="sha256 of the decoded native-grid float32 array (140 x 290, south-north, C order) of each granule; raw HDF4 files were not downloaded.",
                power=dict(urls=pk["urls"], retrieved_utc=pk["retrieved_utc"]),
                files={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (CA / "C-A_view_time.npz", wdir / "C-A.json")},
                built_utc=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"))
    (CA / "C-A_view_time_provenance.json").write_text(json.dumps(prov, indent=1))
    print(json.dumps(dict(n_ts=n_ts, n_all=n_all, ew_slope=slope_h_per_deg, summary=out["summary"], view_time=out["view_time"]), indent=1))


if __name__ == "__main__":
    {"fetch": stage_fetch, "build": stage_build}[sys.argv[1]](sys.argv[2])
