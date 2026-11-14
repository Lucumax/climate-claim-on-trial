r"""Product 6: OMI/Aura OMNO2d v004 (cloud-screened Level-3 daily, 0.25 deg, 720 x 1440, row 0 = 89.875S, so the 1 degree library cube is flipped to row 0 = 90N before it is staged) tropospheric NO2 column -> monthly.
Variable ColumnAmountNO2TropCloudScreened (molecules/cm2). The product's own screening (file Description): solar zenith 0-85, cloud fraction <= 0.30, VcdQualityFlags good,
XTrackQualityFlagsModified good (this is how the OMI row anomaly is handled: affected pixels are dropped by NASA's flags), terrain reflectivity <= 1.
Monthly 0.25 deg cell = mean of the daily cells over valid days, kept if >= 5 valid days. Library 1 deg = 4 x 4 block mean of valid monthly 0.25 deg cells (kept if >= 8 of 16). Units here: 1e15 molecules/cm2.
Also saves the two registered boxes (C-E1, C-E2) at 0.25 deg for make_no2_cases.py. NO TREND IS COMPUTED IN THIS SCRIPT.
One DAP4 request per day, in memory. Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_no2.py"""
import sys, json, re, time, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import libcommon as L

PID = "no2_omi"; CID = "C3333493715-GES_DISC"; VAR = "ColumnAmountNO2TropCloudScreened"; MIN_DAYS = 5
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = sorted([g for g in L.list_granules(CID, 2005, 2026) if g["begin"][:4] >= "2005"], key=lambda g: g["begin"])
days = [g["begin"][:10] for g in gl]
dups = sorted({d for d in days if days.count(d) > 1}); print("granules", len(gl), days[0], days[-1], "duplicate days", dups[:5], flush=True)
seen = set(); gl2 = []
for g in gl:
    d = g["begin"][:10]
    if d in seen: continue
    seen.add(d); gl2.append(g)
gl = gl2
last = gl[-1]["begin"][:7]
# last month is kept only if the final granule is the last day of that month (a partial month would bias the mean); else drop it
import calendar
ly, lm = int(last[:4]), int(last[5:7])
if int(gl[-1]["begin"][8:10]) < calendar.monthrange(ly, lm)[1] - 1: gl = [g for g in gl if g["begin"][:7] != last]
ym = [(int(g["begin"][:4]), int(g["begin"][5:7])) for g in gl]
times = L.month_axis(2005, 1, (ym[-1][0] - 2005) * 12 + ym[-1][1]); idx = {t: i for i, t in enumerate(times)}
dmr = s.get(re.sub(r"\.html$", "", gl[0]["opendap_url"]) + ".dmr", timeout=180).text
path = L.dmr_path(dmr, VAR); print("path", path, "months", len(times), "days", len(gl), flush=True)

LAT = -89.875 + 0.25 * np.arange(720); LON = -179.875 + 0.25 * np.arange(1440)
BOXES = {"C-E1": (35, 45, -90, -70), "C-E2": (22, 30, 75, 88)}
sel = {k: (np.where((LAT > b[0]) & (LAT < b[1]))[0], np.where((LON > b[2]) & (LON < b[3]))[0]) for k, b in BOXES.items()}

def one(g):
    raw, at, content = L.dap4_raw(s, g["opendap_url"], VAR, path=path)
    r = raw.astype(np.float64); r[r < -1e20] = np.nan               # fill is -1.2676506e+30 (float32)
    return (r / 1e15).astype(np.float32), L.sha_bytes(content), at

cube = np.full((len(times), 180, 360), np.nan, np.float32)
box = {k: np.full((len(times), len(v[0]), len(v[1])), np.nan, np.float32) for k, v in sel.items()}
ndays = np.zeros(len(times), int); prov = []; t0 = dt.datetime.now(dt.timezone.utc); at0 = None
CACHE = L.SCRATCH / "no2_cache"; CACHE.mkdir(parents=True, exist_ok=True)   # one small file per month: a killed run resumes; also keeps memory bounded (one month in flight)
by_month = {}
for g, t in zip(gl, ym): by_month.setdefault(t, []).append(g)
with ThreadPoolExecutor(4) as ex:
    for mi, t in enumerate(times):
        gs = by_month.get(t, [])
        cf = CACHE / f"{t[0]}{t[1]:02d}.npz"
        if cf.exists():
            z = np.load(cf, allow_pickle=True); cube[mi] = z["m1"]; ndays[mi] = int(z["nd"])
            for k in sel: box[k][mi] = z[f"box_{k}"]
            prov += json.loads(str(z["prov"]))
            if at0 is None and "at0" in z.files: at0 = json.loads(str(z["at0"]))
            continue
        sm = np.zeros((720, 1440)); cnt = np.zeros((720, 1440), int); pv = []
        for g, (v, h, at) in zip(gs, ex.map(one, gs)):
            if at0 is None: at0 = {a: at[a] for a in ("Units", "Title", "Description", "_FillValue") if a in at}; print(at0, flush=True)
            f = np.isfinite(v); sm += np.where(f, v, 0); cnt += f; ndays[mi] += 1
            pv.append(dict(granule_ur=g["granule_ur"], date=g["begin"][:10], sha256_dap_response=h, valid_cells=int(f.sum())))
        if gs:
            mean = np.where(cnt >= MIN_DAYS, sm / np.maximum(cnt, 1), np.nan)
            m1, _ = L.block_mean_valid(mean[None], 4, min_frac=0.5); cube[mi] = m1[0]
            for k, (ri, ci) in sel.items(): box[k][mi] = mean[np.ix_(ri, ci)]
        tmp = cf.with_name(cf.stem + ".tmp.npz")   # atomic: write a temp name, then rename, so a killed run never leaves a half file
        np.savez(tmp, m1=cube[mi], nd=ndays[mi], prov=json.dumps(pv), at0=json.dumps(at0), **{f"box_{k}": box[k][mi] for k in sel})
        import os; os.replace(tmp, cf)
        prov += pv
        if mi % 6 == 0: print("done month", t, flush=True); L.check_disk()
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
cube = np.ascontiguousarray(cube[:, ::-1, :])   # OMNO2d raw rows run south to north (row 0 = 89.875S); the library wants row 0 = 90N. Cache and box arrays stay south-up (lat ascending, as make_no2_cases.py documents)
np.save(L.SCRATCH / f"{PID}_cube.npy", cube)
np.savez_compressed(L.SCRATCH / "no2_boxes.npz", times=np.array(times), ndays=ndays, **{f"box_{k}": v for k, v in box.items()}, **{f"lat_{k}": LAT[sel[k][0]] for k in sel}, **{f"lon_{k}": LON[sel[k][1]] for k in sel})
json.dump(dict(collection=col, granules=prov, t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_no2.py",
    qc_extra=dict(attrs_first_granule=at0, days_per_month_min=int(ndays[ndays > 0].min()), days_per_month_max=int(ndays.max()), months_with_zero_granules=[f"{y}-{m:02d}" for (y, m), n in zip(times, ndays) if n == 0], min_valid_days_per_cell=MIN_DAYS,
                  duplicate_days_resolved_first_kept=dups, row_anomaly="handled by NASA's own XTrackQualityFlagsModified screening in the Level-3 field (see attrs_first_granule.Description); no extra step here"),
    access="Earthdata Login (environment token); GES DISC OPeNDAP DAP4 server-side subset of one variable per daily file, in memory (no raw file kept)",
    regrid="daily 0.25 deg cloud-screened cells -> monthly mean over valid days (>= 5 days) -> 4 x 4 block mean of valid cells (>= 8 of 16) = 1 degree; units 1e15 molecules/cm2"), open(L.SCRATCH / f"{PID}_prov.json", "w"))
print("staged", cube.shape, "valid frac", float(np.isfinite(cube).mean()), "range", float(np.nanmin(cube)), float(np.nanmax(cube)), flush=True)
