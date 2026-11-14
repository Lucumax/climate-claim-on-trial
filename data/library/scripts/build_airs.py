r"""Products 7a/7b: AIRS/Aqua L3 monthly standard physical retrieval V7.0 (AIRS3STM), 1 degree native (180 x 360, row 0 = 89.5N, checked: June row 0 is Arctic-warm).
SurfAirTemp_A (ascending, afternoon) and SurfAirTemp_D (descending, night), K; TotH2OVap_A and TotH2OVap_D, kg/m2. One multi-variable DAP4 request per month, in memory.
Library value = mean of ascending and descending where both are valid (K - 273.15 once for temperature). Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_airs.py"""
import sys, json, re, time, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np, netCDF4
from concurrent.futures import ThreadPoolExecutor
import libcommon as L

CID = "C1701805662-GES_DISC"
NAMES = ["SurfAirTemp_A", "SurfAirTemp_D", "TotH2OVap_A", "TotH2OVap_D"]
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = sorted([g for g in L.list_granules(CID, 2003, 2026) if g["begin"][:4] >= "2003"], key=lambda g: g["begin"])
ym = [(int(g["begin"][:4]), int(g["begin"][5:7])) for g in gl]; assert len(set(ym)) == len(ym)
times = L.month_axis(2003, 1, (ym[-1][0] - 2003) * 12 + ym[-1][1]); idx = {t: i for i, t in enumerate(times)}
print("granules", len(gl), ym[0], ym[-1], flush=True)
dmr = s.get(re.sub(r"\.html$", "", gl[0]["opendap_url"]) + ".dmr", timeout=180).text
paths = [L.dmr_path(dmr, n) for n in NAMES]; assert all(paths), paths
print(paths, flush=True)

def walk(node, found):
    for k, v in node.variables.items():
        if k in NAMES: found[k] = v
    for gn in node.groups: walk(node[gn], found)

def one(g):
    base = re.sub(r"\.html$", "", g["opendap_url"])
    for attempt in range(4):
        try:
            r = s.get(base + ".dap.nc4", params={"dap4.ce": ";".join(paths)}, timeout=600)
            if r.status_code != 200 or "html" in r.headers.get("content-type", ""): raise RuntimeError(f"http {r.status_code}")
            vals = {}; ats = {}
            with L.NC_LOCK, netCDF4.Dataset("mem.nc", memory=r.content) as ds:
                found = {}; walk(ds, found); assert set(found) == set(NAMES), list(found)
                for n, v in found.items():
                    v.set_auto_maskandscale(False); raw = np.array(v[:]); at = {k: str(v.getncattr(k)) for k in v.ncattrs()}
                    vals[n], _ = L.modis_decode(raw, at, fill_default=-9999.0); ats[n] = at
            return vals, L.sha_bytes(r.content), ats
        except Exception:
            if attempt == 3: raise
            time.sleep(3 * (attempt + 1))

def comb(a, d, off=0.0):
    out = (a + d) / 2.0 - off                     # NaN if either is missing
    return out.astype(np.float32)

cubes = {"airs_tair": np.full((len(times), 180, 360), np.nan, np.float32), "airs_h2o": np.full((len(times), 180, 360), np.nan, np.float32)}
prov = []; t0 = dt.datetime.now(dt.timezone.utc); ats0 = None
with ThreadPoolExecutor(6) as ex:
    for k, (g, res) in enumerate(zip(gl, ex.map(one, gl))):
        vals, h, ats = res
        if ats0 is None: ats0 = {n: ats[n] for n in ats}
        cubes["airs_tair"][idx[ym[k]]] = comb(vals["SurfAirTemp_A"], vals["SurfAirTemp_D"], 273.15)
        cubes["airs_h2o"][idx[ym[k]]] = comb(vals["TotH2OVap_A"], vals["TotH2OVap_D"])
        prov.append(dict(granule_ur=g["granule_ur"], year=ym[k][0], month=ym[k][1], url=g["https_url"], sha256_dap_response=h))
        if k % 25 == 0: print("done", k, flush=True)
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
for pid, desc in (("airs_tair", "(SurfAirTemp_A + SurfAirTemp_D) / 2 - 273.15"), ("airs_h2o", "(TotH2OVap_A + TotH2OVap_D) / 2")):
    np.save(L.SCRATCH / f"{pid}_cube.npy", cubes[pid])
    json.dump(dict(collection=col, granules=prov, t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_airs.py", qc_extra=dict(attrs_first_granule=ats0, note="value kept only where both the ascending and the descending monthly value are valid"),
        access="Earthdata Login (environment token); GES DISC OPeNDAP DAP4 server-side subset of 4 variables per month in one request, in memory (no raw file kept)",
        regrid=f"none: AIRS3STM is already 1 degree, row 0 = 89.5N; {desc}"), open(L.SCRATCH / f"{pid}_prov.json", "w"))
    c = cubes[pid]; print("staged", pid, c.shape, "valid frac", float(np.isfinite(c).mean()), "range", float(np.nanmin(c)), float(np.nanmax(c)), flush=True)
