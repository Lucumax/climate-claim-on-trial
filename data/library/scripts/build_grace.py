r"""Product 3: GRACE / GRACE-FO JPL mascons RL06.3 v04 CRI (TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4, PO.DAAC). One global netCDF (about 44 MB), downloaded to a scratch dir,
read once, then deleted. lwe_thickness (cm), 0.5 deg grid -> 1 deg by 2 x 2 block mean of valid cells.
Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_grace.py"""
import sys, json, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np, netCDF4
import libcommon as L

PID = "tws_grace"; CID = "C3195527175-POCLOUD"
L.check_disk()
s = L.session(); col = L.collection(CID)
g = L.list_granules(CID, 2002, 2027); assert len(g) >= 1
g = g[0]; print(g["granule_ur"], g["size_mb"], flush=True)
raw_dir = L.SCRATCH / "grace_raw"; raw_dir.mkdir(parents=True, exist_ok=True)
fp = raw_dir / Path(g["https_url"]).name
t0 = dt.datetime.now(dt.timezone.utc)
with s.get(g["https_url"], stream=True, timeout=600) as r:
    print("http", r.status_code, r.headers.get("content-type"), flush=True)
    if r.status_code in (401, 403): sys.exit(f"AUTH_BLOCKED http {r.status_code} on PO.DAAC download: needs an Earthdata application approval")
    if "html" in r.headers.get("content-type", ""): sys.exit("AUTH_BLOCKED: HTML login page instead of data (PO.DAAC application approval probably missing)")
    r.raise_for_status(); n = 0
    with open(fp, "wb") as f:
        for c in r.iter_content(1 << 20):
            n += len(c); f.write(c)
            if n > 250e6: sys.exit("file over 250 MB cap")
t1 = dt.datetime.now(dt.timezone.utc)
sha = L.sha_file(fp); print("downloaded", n / 1e6, "MB", flush=True)
ds = netCDF4.Dataset(str(fp))
lat = np.array(ds["lat"][:]); lon = np.array(ds["lon"][:]); tv = np.array(ds["time"][:])
v = ds["lwe_thickness"]; v.set_auto_maskandscale(False); lwe = np.array(v[:]).astype(np.float64)
fill = float(v.getncattr("_FillValue")); lm = np.array(ds["land_mask"][:]); print("land_mask unique", np.unique(lm), "lat", lat[[0, -1]], "lon", lon[[0, -1]], flush=True)
base = dt.datetime(2002, 1, 1)
dates = [base + dt.timedelta(days=float(x)) for x in tv]
ds.close()
lwe[lwe == fill] = np.nan; lwe[~np.isfinite(lwe)] = np.nan
lwe[:, lm != 1] = np.nan                       # keep land (including ice sheets); ocean mascons are ocean bottom pressure, not land water
if lat[0] < lat[-1]: lwe = lwe[:, ::-1, :]; lat = lat[::-1]
if lon[0] >= 0: lwe = np.roll(lwe, 360, axis=2)   # 0..360 -> -180..180 (half of 720 columns)
ym = [(d.year, d.month) for d in dates]
dup = sorted({x for x in ym if ym.count(x) > 1}); print("duplicate months", dup, "first", ym[0], "last", ym[-1], flush=True)
times = L.month_axis(ym[0][0], ym[0][1], (ym[-1][0] - ym[0][0]) * 12 + ym[-1][1] - ym[0][1] + 1)
idx = {t: i for i, t in enumerate(times)}
cube = np.full((len(times), 180, 360), np.nan, np.float32)
m1, _ = L.block_mean_valid(lwe, 2, min_frac=0.5)
placed = {}; shifted = []                              # month -> solution index
for k, t in enumerate(ym):
    if t in placed:                                      # two solutions dated in one calendar month: the earlier one belongs to the previous month if that is empty
        y, m = t; prev = (y - 1, 12) if m == 1 else (y, m - 1)
        if prev not in placed and prev in idx:
            placed[prev] = placed.pop(t); shifted.append(f"solution {placed[prev]} moved from {y}-{m:02d} to {prev[0]}-{prev[1]:02d}")
        else:
            nxt = (y + 1, 1) if m == 12 else (y, m + 1)
            if nxt in idx and nxt not in placed: placed[nxt] = k; shifted.append(f"solution {k} moved from {y}-{m:02d} to {nxt[0]}-{nxt[1]:02d}"); continue
            print("dropping second solution in", t); continue
    placed[t] = k
for t, k in placed.items(): cube[idx[t]] = m1[k]
print("shifts:", shifted, flush=True)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
np.save(L.SCRATCH / f"{PID}_cube.npy", cube)
gaps = [f"{y}-{m:02d}" for (y, m) in times if not np.isfinite(cube[idx[(y, m)]]).any()]
json.dump(dict(collection=col, granules=[dict(granule_ur=g["granule_ur"], url=g["https_url"], sha256_download=sha, bytes=n, n_solutions=len(ym), duplicate_months=[f"{y}-{m:02d}" for y, m in dup])],
    t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_grace.py", qc_extra=dict(gap_months_no_solution=gaps, solutions_shifted_to_previous_month=shifted, note="CRI-filtered product: no separate scale_factor applied; land_mask==1 kept"),
    access="Earthdata Login (environment token); PO.DAAC HTTPS download of the single global netCDF (about 46 MB) to a scratch dir, read once, deleted (no approval error: HTTP 200)",
    regrid="0.5 degree to 1 degree: mean of valid land cells in each 2 x 2 block, kept if >= 2 of 4 valid; ocean cells masked with the file's land_mask; longitudes rolled from 0..360 to -180..180"), open(L.SCRATCH / f"{PID}_prov.json", "w"))
fp.unlink()
print("staged", cube.shape, "months", len(times), "gap months", len(gaps), gaps[:30], "valid frac", float(np.isfinite(cube).mean()), "range", float(np.nanmin(cube)), float(np.nanmax(cube)), flush=True)
