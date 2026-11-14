r"""Product 5: MODIS Terra MOD10CM v061 monthly snow cover (Snow_Cover_Monthly_CMG, 0.05 deg CMG 3600 x 7200, uint8; 0-100 = percent snow in the cell, other codes are night, cloud,
water, no decision, Antarctica mask, fill). No OPeNDAP on NSIDC cloud, so each month's file (1 to 2 MB) is downloaded to scratch, read with pyhdf, deleted at once.
Only codes 0-100 are used (everything else -> no data). 20 x 20 native cells -> one 1 deg cell, mean of valid cells, kept if >= 50% valid.
Run: data\.venv\Scripts\python.exe -u -I data\library\scripts\build_snow.py"""
import sys, json, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import libcommon as L
from pyhdf.SD import SD, SDC

PID = "snow_mod10cm"; CID = "C3050353608-NSIDC_CPRD"; VAR = "Snow_Cover_Monthly_CMG"
L.check_disk()
s = L.session(); col = L.collection(CID)
gl = [g for g in sorted(L.list_granules(CID, 2001, 2026), key=lambda g: (g["begin"], g["granule_ur"])) if g["begin"][:4] >= "2001"]
by = {}
dups = []
for g in gl:
    k = (int(g["begin"][:4]), int(g["begin"][5:7]))
    if k in by: dups.append(f"{k[0]}-{k[1]:02d}: kept {g['granule_ur']}, dropped {by[k]['granule_ur']}")   # later sort key = later production date
    by[k] = g
ym = sorted(by); gl = [by[k] for k in ym]
times = L.month_axis(2001, 1, (ym[-1][0] - 2001) * 12 + ym[-1][1])
print("granules", len(gl), ym[0], ym[-1], "duplicate months resolved:", dups, flush=True)
raw_dir = L.SCRATCH / "snow_raw"; raw_dir.mkdir(parents=True, exist_ok=True)

def dl(g):
    for attempt in range(4):
        try:
            r = s.get(g["https_url"], timeout=300)
            if r.status_code in (401, 403): raise PermissionError(f"AUTH_BLOCKED http {r.status_code}")
            if r.status_code != 200 or "html" in r.headers.get("content-type", ""): raise RuntimeError(f"http {r.status_code}")
            return r.content
        except PermissionError: raise
        except Exception:
            if attempt == 3: raise
            import time; time.sleep(4 * (attempt + 1))

cube = np.full((len(times), 180, 360), np.nan, np.float32); prov = []; idx = {t: i for i, t in enumerate(times)}
t0 = dt.datetime.now(dt.timezone.utc); attrs0 = None; codes = {}
with ThreadPoolExecutor(4) as ex:
    for k, (g, content) in enumerate(zip(gl, ex.map(dl, gl))):
        fp = raw_dir / f"m{k}.hdf"; fp.write_bytes(content)
        sd = SD(str(fp), SDC.READ); ds = sd.select(VAR)
        a = ds.attributes(); raw = ds[:]; ds.endaccess(); sd.end(); fp.unlink()
        if attrs0 is None: attrs0 = {x: str(a[x])[:300] for x in ("long_name", "valid_range", "_FillValue", "Key") if x in a}; print(attrs0, flush=True)
        v = raw.astype(np.float64); u, c = np.unique(raw, return_counts=True)
        for uu, cc in zip(u, c): codes[int(uu)] = codes.get(int(uu), 0) + int(cc)
        v[(v < 0) | (v > 100)] = np.nan                       # keep percent codes 0-100 only
        m, _ = L.block_mean_valid(v[None], 20, min_frac=0.5)
        cube[idx[ym[k]]] = m[0]
        prov.append(dict(granule_ur=g["granule_ur"], year=ym[k][0], month=ym[k][1], url=g["https_url"], sha256_download=L.sha_bytes(content)))
        if k % 25 == 0: print("done", k, flush=True)
        if k % 100 == 0: L.check_disk()
t1 = dt.datetime.now(dt.timezone.utc)
L.SCRATCH.mkdir(parents=True, exist_ok=True)
np.save(L.SCRATCH / f"{PID}_cube.npy", cube)
non_pct = {c: n for c, n in sorted(codes.items()) if c > 100}
json.dump(dict(collection=col, granules=prov, t0=t0.isoformat(), t1=t1.isoformat(), times=times, script="data/library/scripts/build_snow.py",
    qc_extra=dict(attrs_first_granule=attrs0, duplicate_months_resolved=dups, native_cell_counts_non_percent_codes_all_months=non_pct, note="codes 0-100 used; all others (night 211, cloud 250, water, Antarctica mask 252, fill 255...) are no data"),
    access="Earthdata Login (environment token); NSIDC cloud HTTPS download of each monthly file (1-2 MB) to a scratch dir, read with pyhdf, deleted at once (no OPeNDAP route listed in CMR for this collection)",
    regrid="mean of valid (0-100 percent) 0.05 degree cells in each 20 x 20 block (1 degree), kept if >= 200 of 400 valid"), open(L.SCRATCH / f"{PID}_prov.json", "w"))
print("staged", cube.shape, "valid frac", float(np.isfinite(cube).mean()), "range", float(np.nanmin(cube)), float(np.nanmax(cube)), flush=True)
