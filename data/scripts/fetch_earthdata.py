"""Credentialed fetch+subset for claims C-A (MOD11C3), C-B (IMERG), C-D (MYD08_M3).
Usage: .venv/Scripts/python.exe -I scripts/fetch_earthdata.py C-B [--test 1]
Needs EARTHDATA_TOKEN (or EARTHDATA_USERNAME/PASSWORD) in the shell environment of whoever runs it. This script never reads, prints or stores them:
earthaccess.login(strategy="environment") reads the env itself. One granule at a time: download -> subset -> delete raw. Raw lives in data/raw (git-ignored).
UNTESTED against live data at the time of writing (no credentials were available to the data worker)."""
import json, sys, hashlib, datetime as dt, shutil
from pathlib import Path
import numpy as np, xarray as xr
ROOT = Path(__file__).resolve().parent.parent
claim = sys.argv[1]; test = int(sys.argv[sys.argv.index("--test") + 1]) if "--test" in sys.argv else 0
meta = json.loads((ROOT / claim / f"{claim}_cmr_granules.json").read_text())
gl = meta["granules"][:test] if test else meta["granules"]
RAW = ROOT / "raw" / claim; RAW.mkdir(parents=True, exist_ok=True)
import earthaccess
auth = earthaccess.login(strategy="environment")
if not getattr(auth, "authenticated", False): sys.exit("Earthdata login via environment failed; set EARTHDATA_TOKEN in your own shell.")

def sub_imerg(p, g):  # HDF5, group Grid; precipitation (time, lon, lat) mm/hr
    ds = xr.open_dataset(p, group="Grid", engine="netcdf4")
    ds = ds[["precipitation", "precipitationQualityIndex", "randomError"]].sel(lon=slice(-17, 25), lat=slice(10, 18))
    out = ds.load(); out.attrs = {}; ds.close(); return out
def sub_mod11c3(p, g):  # HDF4 CMG 3600x7200, 0.05 deg, row0 = 90N
    from pyhdf.SD import SD, SDC
    sd = SD(str(p), SDC.READ); r0, r1, c0, c1 = 1060, 1200, 1800, 2090
    lat = 90 - 0.025 - 0.05 * np.arange(r0, r1); lon = -180 + 0.025 + 0.05 * np.arange(c0, c1)
    dv = {}
    for name in ["LST_Day_CMG", "QC_Day", "Clear_day_cov", "Day_view_time", "Day_view_angl"]:
        s = sd.select(name); dv[name] = (("lat", "lon"), s[r0:r1, c0:c1]); a = s.attributes()
        dv[name + "_attrs"] = None; dv[name] = dv[name]
        if name == "LST_Day_CMG": scale, fill, vr = a.get("scale_factor"), a.get("_FillValue"), a.get("valid_range")
    dv = {k: v for k, v in dv.items() if v is not None}
    d = xr.Dataset(dv, coords={"lat": lat, "lon": lon}); d.attrs = {"LST_scale_factor": scale, "LST_fill": str(fill), "LST_valid_range": str(vr), "units": "K after scale_factor"}
    return d.expand_dims(time=[np.datetime64(g["begin"][:10])])
def sub_myd08(p, g):  # HDF4 CMG 180x360, 1 deg, row0 = 90N; keep cells overlapping 42.5-47.1N 92.9-86.8W -> 42-48N, 93-86W
    from pyhdf.SD import SD
    sd = SD(str(p)); names = [n for n in sd.datasets() if n.startswith("AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean")]
    assert names, "AOD variable not found: " + str([n for n in sd.datasets() if "AOD_550" in n])
    r0, r1, c0, c1 = 42, 48, 87, 94  # rows (90-48)=42..(90-42)=48 ; cols (-93+180)=87..(-86+180)=94
    lat = 89.5 - np.arange(r0, r1); lon = -179.5 + np.arange(c0, c1)
    dv = {}; at = {}
    for n in names:
        s = sd.select(n); dv[n] = (("lat", "lon"), s[r0:r1, c0:c1]); at[n] = {k: str(v) for k, v in s.attributes().items() if k in ("scale_factor", "add_offset", "_FillValue", "valid_range", "units")}
    d = xr.Dataset(dv, coords={"lat": lat, "lon": lon}); d.attrs = {"var_attrs": json.dumps(at)}
    return d.expand_dims(time=[np.datetime64(g["begin"][:10])])
SUB = {"C-B": sub_imerg, "C-A": sub_mod11c3, "C-D": sub_myd08}[claim]
parts, got, t0 = [], [], dt.datetime.now(dt.timezone.utc)
for g in gl:
    ur = g["granule_ur"]
    res = earthaccess.search_data(concept_id=meta["collection"]["concept_id"], granule_ur=ur)
    files = earthaccess.download(res, str(RAW))
    p = Path(files[0])
    try:
        parts.append(SUB(p, g)); got.append({"granule_ur": ur, "file": p.name, "sha256_raw": hashlib.sha256(p.read_bytes()).hexdigest() if p.stat().st_size < 2**31 else None})
    finally:
        p.unlink(missing_ok=True)
    print("ok", ur, flush=True)
ds = xr.concat(parts, dim="time")
out = ROOT / claim / f"{claim}_subset{'_TEST' if test else ''}.nc"
ds.to_netcdf(out, encoding={v: {"zlib": True, "complevel": 5} for v in ds.data_vars})
shutil.rmtree(RAW, ignore_errors=True)
c = meta["collection"]
prov = {"claim": claim, "short_name": c["short_name"], "version": c["version"], "doi": c["doi"], "concept_id": c["concept_id"],
        "access_route": "earthaccess (Earthdata Login via environment token), whole granule download then local subset, raw deleted", "retrieved_utc_start": t0.isoformat(),
        "retrieved_utc_end": dt.datetime.now(dt.timezone.utc).isoformat(), "granules": got, "n_granules": len(got),
        "files": {out.name: hashlib.sha256(out.read_bytes()).hexdigest()}}
(ROOT / claim / f"{claim}_provenance{'_TEST' if test else ''}.json").write_text(json.dumps(prov, indent=1))
print("wrote", out, out.stat().st_size / 1e6, "MB")
