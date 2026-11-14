r"""Product 1: GPM IMERG Final monthly V07 (GPM_3IMERGM) -> 1 deg global monthly mm/day. Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_imerg.py
Server-side OPeNDAP (DAP4) subset of /Grid/precipitation only (about 6 MB per month, nothing written to disk). 10 x 10 native cells -> one 1 deg cell,
mean of valid cells, kept if >= 50 % of the 100 cells are valid. mm/hr x 24 = mm/day (the monthly mean rain rate)."""
import sys, json, re, time, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np, netCDF4
from concurrent.futures import ThreadPoolExecutor
import libcommon as L

PID = "precip_imerg"; CID = "C2723754851-GES_DISC"
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = [g for g in L.list_granules(CID, 2001, 2026)]
gl.sort(key=lambda g: g["begin"])
ym = [(int(g["begin"][:4]), int(g["begin"][5:7])) for g in gl]
assert len(set(ym)) == len(ym)
times = L.month_axis(ym[0][0], ym[0][1], (ym[-1][0] - ym[0][0]) * 12 + ym[-1][1] - ym[0][1] + 1)
print("granules", len(gl), "months", len(times), ym[0], ym[-1], flush=True)

def one(g):
    base = re.sub(r"\.html$", "", g["opendap_url"])
    for attempt in range(4):
        try:
            r = s.get(base + ".dap.nc4", params={"dap4.ce": "/Grid/precipitation[0][0:1:3599][0:1:1799]"}, timeout=300)
            if r.status_code != 200 or "html" in r.headers.get("content-type", ""): raise RuntimeError(f"http {r.status_code}")
            with netCDF4.Dataset("mem.nc", memory=r.content) as ds:
                v = ds["Grid"]["precipitation"]; v.set_auto_maskandscale(False); a = np.array(v[:])[0].astype(np.float64)  # [lon][lat]
            a = a.T  # [lat S->N][lon]
            a[a < 0] = np.nan
            a = a * 24.0
            m, _ = L.block_mean_valid(a[None], 10, min_frac=0.5)
            return m[0][::-1], L.sha_bytes(r.content), len(r.content)
        except Exception as e:
            if attempt == 3: raise
            time.sleep(3 * (attempt + 1))
cube = np.full((len(times), 180, 360), np.nan, np.float32); prov = []
idx = {t: i for i, t in enumerate(times)}
t0 = dt.datetime.now(dt.timezone.utc)
with ThreadPoolExecutor(6) as ex:
    for k, (g, res) in enumerate(zip(gl, ex.map(one, gl))):
        m, h, n = res; cube[idx[ym[k]]] = m
        prov.append(dict(granule_ur=g["granule_ur"], year=ym[k][0], month=ym[k][1], sha256_dap_response=h, bytes=n))
        if k % 25 == 0: print("done", k, flush=True)
        if k % 100 == 0: L.check_disk()
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
np.save(L.SCRATCH / f"{PID}_cube.npy", cube)
json.dump(dict(collection=col, granules=prov, t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_imerg.py",
    access="Earthdata Login (environment token); GES DISC OPeNDAP DAP4 server-side subset of /Grid/precipitation, one month at a time, in memory (no raw file kept)",
    regrid="mean of valid 0.1 degree cells in each 10 x 10 block (1 degree), kept if >= 50 of 100 valid; mm/hr x 24 = mm/day"), open(L.SCRATCH / f"{PID}_prov.json", "w"))
print("staged", cube.shape, "valid frac", float(np.isfinite(cube).mean()), "range", float(np.nanmin(cube)), float(np.nanmax(cube)), flush=True)
