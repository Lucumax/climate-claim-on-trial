r"""Products 8a/8b: GLDAS Noah land surface model monthly V2.1 at 1 degree (GLDAS_NOAH10_M): soil moisture 0-10 cm (SoilMoi0_10cm_inst, kg/m2) and evapotranspiration (Evap_tavg, kg/m2/s x 86400 = mm/day).
MODEL OUTPUT (a land-surface model driven by satellite and ground observations), not a direct observation. Native 1 degree, 150 rows (59.5S to 89.5N) placed into the 180 x 360 library grid.
Server-side DAP4 subset of one variable per request, in memory. Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_gldas.py"""
import sys, json, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import libcommon as L

CID = "C1288937542-GES_DISC"
VARS = {"soil_gldas": ("SoilMoi0_10cm_inst", 1.0), "et_gldas": ("Evap_tavg", 86400.0)}
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = sorted([g for g in L.list_granules(CID, 2001, 2026) if g["begin"][:4] >= "2001"], key=lambda g: g["begin"])
ym = [(int(g["begin"][:4]), int(g["begin"][5:7])) for g in gl]; assert len(set(ym)) == len(ym)
times = L.month_axis(2001, 1, (ym[-1][0] - 2001) * 12 + ym[-1][1]); idx = {t: i for i, t in enumerate(times)}
print("granules", len(gl), ym[0], ym[-1], flush=True)
lat, _, _ = L.dap4_raw(s, gl[0]["opendap_url"], "lat"); lat = lat.astype(float); lon, _, _ = L.dap4_raw(s, gl[0]["opendap_url"], "lon")
print("lat", lat[0], lat[-1], len(lat), "lon", lon[0], lon[-1], len(lon), flush=True)
rows = np.rint(89.5 - lat).astype(int); assert rows.min() >= 0 and rows.max() < 180 and len(set(rows)) == len(rows)
assert abs(lon[0] + 179.5) < 1e-3 and len(lon) == 360

def one(g):
    out = {}
    for pid, (var, mult) in VARS.items():
        raw, at, content = L.dap4_raw(s, g["opendap_url"], var)
        v, dec = L.modis_decode(raw.reshape(len(lat), 360), at, fill_default=-9999.0)
        full = np.full((180, 360), np.nan); full[rows] = v * mult
        out[pid] = (full.astype(np.float32), L.sha_bytes(content), dec, at)
    return out

cubes = {p: np.full((len(times), 180, 360), np.nan, np.float32) for p in VARS}; prov = {p: [] for p in VARS}; dec0 = {}
t0 = dt.datetime.now(dt.timezone.utc)
with ThreadPoolExecutor(6) as ex:
    for k, (g, res) in enumerate(zip(gl, ex.map(one, gl))):
        for pid in VARS:
            v, h, dec, at = res[pid]; cubes[pid][idx[ym[k]]] = v
            prov[pid].append(dict(granule_ur=g["granule_ur"], year=ym[k][0], month=ym[k][1], url=g["https_url"], sha256_dap_response=h))
            dec0.setdefault(pid, dict(decode=dec, attrs={a: at[a] for a in ("units", "_FillValue", "long_name") if a in at}))
        if k % 25 == 0: print("done", k, flush=True)
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
for pid, (var, mult) in VARS.items():
    np.save(L.SCRATCH / f"{pid}_cube.npy", cubes[pid])
    json.dump(dict(collection=col, granules=prov[pid], t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_gldas.py", qc_extra=dict(decode=dec0[pid], note="GLDAS grid has no rows south of 59.5S; Antarctica and open ocean are fill"),
        access="Earthdata Login (environment token); GES DISC OPeNDAP DAP4 server-side subset of one variable per month, in memory",
        regrid=f"none: GLDAS Noah 1 degree grid (150 rows, 59.5S to 89.5N) placed into the 180 x 360 library grid; {var}" + (" x 86400 (kg/m2/s to mm/day)" if mult != 1 else " (kg/m2 = mm of water in the top 10 cm)")), open(L.SCRATCH / f"{pid}_prov.json", "w"))
    c = cubes[pid]; print("staged", pid, c.shape, "valid frac", float(np.isfinite(c).mean()), "range", float(np.nanmin(c)), float(np.nanmax(c)), flush=True)
