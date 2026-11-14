r"""Product 2: MODIS Aqua MYD08_M3 v6.1 AOD (Dark Target + Deep Blue combined, 550 nm). Already 1 degree CMG (180 x 360). One server-side DAP4 subset of one variable per month.
Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_aod.py"""
import sys, json, re, time, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import libcommon as L

PID = "aod_myd08"; CID = "C1443775657-LAADS"; VAR = "AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean"
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = sorted(L.list_granules(CID, 2003, 2026), key=lambda g: g["begin"])
gl = [g for g in gl if g["begin"][:4] >= "2003"]
ym = [(int(g["begin"][:4]), int(g["begin"][5:7])) for g in gl]
assert len(set(ym)) == len(ym), "duplicate months"
times = L.month_axis(2003, 1, (ym[-1][0] - 2003) * 12 + ym[-1][1])
print("granules", len(gl), ym[0], ym[-1], flush=True)

def one(g):
    raw, at, content = L.dap4_raw(s, g["opendap_url"], VAR)
    v, dec = L.modis_decode(raw, at)
    assert v.shape == (180, 360), v.shape
    return v.astype(np.float32), L.sha_bytes(content), dec, at

cube = np.full((len(times), 180, 360), np.nan, np.float32); prov = []; idx = {t: i for i, t in enumerate(times)}
t0 = dt.datetime.now(dt.timezone.utc); dec0 = None
with ThreadPoolExecutor(8) as ex:
    for k, (g, res) in enumerate(zip(gl, ex.map(one, gl))):
        v, h, dec, at = res
        if dec0 is None: dec0 = dict(decode=dec, attrs={a: at[a] for a in ("units", "scale_factor", "add_offset", "_FillValue", "valid_range") if a in at}); print("decode", dec0, flush=True)
        cube[idx[ym[k]]] = v
        prov.append(dict(granule_ur=g["granule_ur"], year=ym[k][0], month=ym[k][1], url=g["https_url"], sha256_dap_response=h))
        if k % 20 == 0: print("done", k, flush=True)
        if k % 100 == 0: L.check_disk()
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
np.save(L.SCRATCH / f"{PID}_cube.npy", cube)
json.dump(dict(collection=col, granules=prov, t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_aod.py", qc_extra=dict(decode=dec0),
    access="Earthdata Login (environment token); LAADS OPeNDAP DAP4 server-side subset of one variable per month, in memory (no raw file kept)",
    regrid="none: product is already 1 degree (180 x 360); HDF4 stored ints decoded once as scale*(stored-offset), fill and out-of-range -> NaN"), open(L.SCRATCH / f"{PID}_prov.json", "w"))
print("staged", cube.shape, "valid frac", float(np.isfinite(cube).mean()), "range", float(np.nanmin(cube)), float(np.nanmax(cube)), flush=True)
