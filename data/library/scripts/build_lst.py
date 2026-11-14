r"""Product 4: MODIS Aqua MYD11C3 v061 LST_Day_CMG (0.05 deg CMG, 3600 x 7200) -> 1 deg global monthly daytime land surface temperature in degC.
Server-side DAP4 subset of one variable per month (full resolution, about 8 MB, in memory). Stored uint16, real K = 0.02*stored, 0 = fill, valid_range 7500-65535; decoded once; K - 273.15 once.
20 x 20 native cells -> one 1 deg cell, mean of valid cells, kept if >= 50% of the 400 are valid.
Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_lst.py"""
import sys, json, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import libcommon as L

PID = "lst_day_myd11"; CID = "C2565794044-LPCLOUD"; VAR = "LST_Day_CMG"
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = [g for g in sorted(L.list_granules(CID, 2003, 2026), key=lambda g: g["begin"]) if g["begin"][:4] >= "2003"]
ym = [(int(g["begin"][:4]), int(g["begin"][5:7])) for g in gl]
assert len(set(ym)) == len(ym), "duplicate months"
times = L.month_axis(2003, 1, (ym[-1][0] - 2003) * 12 + ym[-1][1])
print("granules", len(gl), ym[0], ym[-1], flush=True)

def one(g):
    raw, at, content = L.dap4_raw(s, g["opendap_url"], VAR, "[0:1:3599][0:1:7199]")
    assert raw.shape == (3600, 7200), raw.shape
    v, dec = L.modis_decode(raw, at, fill_default=0)
    m, _ = L.block_mean_valid((v - 273.15)[None], 20, min_frac=0.5)   # K -> degC once
    return m[0], L.sha_bytes(content), dec, at                       # row 0 = 90N already (CMG)

cube = np.full((len(times), 180, 360), np.nan, np.float32); prov = []; idx = {t: i for i, t in enumerate(times)}
t0 = dt.datetime.now(dt.timezone.utc); dec0 = None
with ThreadPoolExecutor(6) as ex:
    for k, (g, res) in enumerate(zip(gl, ex.map(one, gl))):
        m, h, dec, at = res
        if dec0 is None: dec0 = dict(decode=dec, attrs={a: at[a] for a in ("units", "scale_factor", "add_offset", "_FillValue", "valid_range") if a in at}); print("decode", dec0, flush=True)
        cube[idx[ym[k]]] = m
        prov.append(dict(granule_ur=g["granule_ur"], year=ym[k][0], month=ym[k][1], url=g["https_url"], sha256_dap_response=h))
        if k % 20 == 0: print("done", k, flush=True)
        if k % 100 == 0: L.check_disk()
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
np.save(L.SCRATCH / f"{PID}_cube.npy", cube)
json.dump(dict(collection=col, granules=prov, t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_lst.py", qc_extra=dict(decode=dec0),
    access="Earthdata Login (environment token); LP DAAC cloud OPeNDAP DAP4 server-side subset of LST_Day_CMG, one month at a time, in memory (no raw file kept)",
    regrid="mean of valid 0.05 degree cells in each 20 x 20 block (1 degree), kept if >= 200 of 400 valid; decoded once: K = 0.02 * stored (stored 0 = fill, valid 7500-65535), then K - 273.15"), open(L.SCRATCH / f"{PID}_prov.json", "w"))
print("staged", cube.shape, "valid frac", float(np.isfinite(cube).mean()), "range", float(np.nanmin(cube)), float(np.nanmax(cube)), flush=True)
