"""Credentialed fetch + subset for claims C-A (MOD11C3), C-B (IMERG), C-D (MYD08_M3). Writes the stats input contract
(data/<claim>/claim.json + monthly.npz, see stats/SCHEMA.md) plus provenance and QC files.

Usage (data worker venv, isolated mode so that nothing in the working directory is imported):
  data\\.venv\\Scripts\\python.exe -I data\\scripts\\fetch_earthdata.py C-B --test 2
  data\\.venv\\Scripts\\python.exe -I data\\scripts\\fetch_earthdata.py C-B
Options: --test N   process only the first N granules, write to data/<claim>/_test/, and (when OPeNDAP works) cross-check the
                    OPeNDAP subset against a whole-granule download subset on granule 1.
         --agg K    block-average K x K cells before writing monthly.npz (default: C-A 5 = 0.05 to 0.25 deg, others 1).
         --mode auto|opendap|download   (default auto: try server-side OPeNDAP subsetting, fall back to one-granule download).

Token: EARTHDATA_TOKEN from the process environment; if absent, read from HKCU\\Environment (winreg) for this process only
(scripts/_token.py). The value is never printed, logged or written. earthaccess.login(strategy="environment") reads it.
Disk: one raw granule at a time, deleted right after the subset; largest granule is about 351 MB (C-D), under the 500 MB cap.
No trend or other result statistic is computed here; only subsetting, decoding, optional block averaging and QC counts of valid cells.
UNTESTED against live data at the time of writing (no token on the machine at that time)."""
import json, sys, hashlib, datetime as dt, importlib.util, re, time, xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RAW_CAP = 500e6


class AuthError(RuntimeError):
    pass


def _load_token_helper():
    spec = importlib.util.spec_from_file_location("_token", HERE / "_token.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


# ---------------- claim definitions (registered in WP0 and addendum 1; do not change) ----------------
CLAIMS = {
    "C-A": dict(text="Summer daytime land surface temperature over the Southeastern United States has risen",
                variable="LST_Day_CMG (MODIS Terra daytime land surface temperature)", plain="summer daytime land surface temperature",
                units="degC", months=[6, 7, 8], period=[2001, 2025], region="the Southeastern United States",
                box=dict(lat_min=30, lat_max=37, lon_min=-90, lon_max=-75.5), agg=5, model=False),
    "C-B": dict(text="Wet-season rainfall over the central Sahel has increased",
                variable="precipitation (GPM IMERG Final Run monthly mean rain rate, converted to mm/day)", plain="wet-season rainfall",
                units="mm/day", months=[6, 7, 8, 9], period=[2001, 2025], region="the central Sahel",
                box=dict(lat_min=10, lat_max=18, lon_min=-17, lon_max=25), agg=1, model=False),
    "C-D": dict(text="Summer aerosol optical depth over Wisconsin has increased",
                variable="AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean (MODIS Aqua aerosol optical depth at 550 nm)",
                plain="summer aerosol optical depth (how much haze particles block the sunlight)",
                units="1 (unitless)", months=[6, 7, 8], period=[2003, 2025], region="Wisconsin",
                box=dict(lat_min=42.5, lat_max=47.1, lon_min=-92.9, lon_max=-86.8), agg=1, model=False),
}


# ---------------- decoders: return dict(values 2-D (lat ascending, lon ascending) float32, lat, lon, extra) ----------------
def _modis_decode(raw, scale, offset, fill, vmin, vmax):
    raw = raw.astype(np.float64)
    bad = np.zeros(raw.shape, bool)
    if fill is not None: bad |= raw == float(fill)
    if vmin is not None: bad |= raw < float(vmin)
    if vmax is not None: bad |= raw > float(vmax)
    out = scale * (raw - offset)  # MODIS HDF4 convention: real = scale_factor * (stored - add_offset)
    out[bad] = np.nan
    return out.astype(np.float32)


def _hdf4_attrs(sd, name):
    a = sd.select(name).attributes()
    g = lambda k: (float(a[k]) if k in a and np.ndim(a[k]) == 0 else (list(a[k]) if k in a else None))
    return dict(scale=g("scale_factor"), offset=g("add_offset"), fill=g("_FillValue"), valid_range=g("valid_range"))


# C-A: MOD11C3 CMG 3600 x 7200, 0.05 deg, row 0 = 90N, col 0 = -180. Box rows 1060..1199, cols 1800..2089.
A_R0, A_R1, A_C0, A_C1 = 1060, 1200, 1800, 2090
def a_axes():
    lat = 90 - 0.025 - 0.05 * np.arange(A_R0, A_R1); lon = -180 + 0.025 + 0.05 * np.arange(A_C0, A_C1); return lat, lon

def a_from_hdf4(path):
    from pyhdf.SD import SD, SDC
    sd = SD(str(path), SDC.READ)
    at = _hdf4_attrs(sd, "LST_Day_CMG")
    raw = sd.select("LST_Day_CMG")[A_R0:A_R1, A_C0:A_C1]
    vr = at["valid_range"] or [None, None]
    v = _modis_decode(raw, at["scale"] or 0.02, at["offset"] or 0.0, at["fill"] if at["fill"] is not None else 0, vr[0], vr[1])
    cov = sd.select("Clear_day_cov")[A_R0:A_R1, A_C0:A_C1] if "Clear_day_cov" in sd.datasets() else None
    lat, lon = a_axes()
    return dict(values=v[::-1], lat=lat[::-1], lon=lon, attrs=at, extra={"Clear_day_cov_raw": None if cov is None else cov[::-1]})


# C-B: IMERG HDF5, /Grid/precipitation (time, lon, lat), 3600 x 1800 at 0.1 deg, lon from -179.95, lat from -89.95.
B_LON0, B_LON1, B_LAT0, B_LAT1 = 1630, 2050, 1000, 1080
def b_axes():
    return -89.95 + 0.1 * np.arange(B_LAT0, B_LAT1), -179.95 + 0.1 * np.arange(B_LON0, B_LON1)

def b_finish(prec, dims, lat, lon):
    prec = np.asarray(prec, dtype=np.float64)
    prec = np.squeeze(prec, axis=tuple(i for i, d in enumerate(dims) if d == "time")) if "time" in dims else prec
    dims = [d for d in dims if d != "time"]
    if dims == ["lon", "lat"]: prec = prec.T
    elif dims != ["lat", "lon"]: raise RuntimeError(f"unexpected IMERG dims {dims}")
    prec[prec < 0] = np.nan  # fill is -9999.9
    return (prec * 24.0).astype(np.float32)  # mm/hr -> mm/day

def b_from_h5(path):
    import netCDF4
    with netCDF4.Dataset(str(path)) as ds:
        g = ds["Grid"]; lat = np.array(g["lat"][:]); lon = np.array(g["lon"][:])
        j = np.where((lat > 10) & (lat < 18))[0]; i = np.where((lon > -17) & (lon < 25))[0]
        v = g["precipitation"]; dims = list(v.dimensions)
        v.set_auto_mask(False)
        sl = {"time": slice(None), "lat": slice(j[0], j[-1] + 1), "lon": slice(i[0], i[-1] + 1)}
        prec = v[tuple(sl[d] for d in dims)]
        at = {k: str(v.getncattr(k)) for k in v.ncattrs() if k in ("units", "_FillValue", "long_name")}
        la, lo = lat[j], lon[i]
    return dict(values=b_finish(prec, dims, la, lo), lat=la, lon=lo, attrs=at, extra={})


# C-D: MYD08_M3 CMG 180 x 360, 1 deg, row 0 = 90N. Cells overlapping the box: lat 42-48N, lon 93-86W.
D_VAR = "AOD_550_Dark_Target_Deep_Blue_Combined_Mean_Mean"
D_R0, D_R1, D_C0, D_C1 = 42, 48, 87, 94
def d_axes():
    return 89.5 - np.arange(D_R0, D_R1), -179.5 + np.arange(D_C0, D_C1)

def d_from_hdf4(path):
    from pyhdf.SD import SD, SDC
    sd = SD(str(path), SDC.READ)
    assert D_VAR in sd.datasets(), "AOD variable not found: " + str([n for n in sd.datasets() if "AOD_550" in n])
    at = _hdf4_attrs(sd, D_VAR)
    raw = sd.select(D_VAR)[D_R0:D_R1, D_C0:D_C1]
    vr = at["valid_range"] or [None, None]
    v = _modis_decode(raw, at["scale"] or 1.0, at["offset"] or 0.0, at["fill"], vr[0], vr[1])
    lat, lon = d_axes()
    return dict(values=v[::-1], lat=lat[::-1], lon=lon, attrs=at, extra={})


# ---------------- OPeNDAP (server-side subsetting; any failure falls back to download) ----------------
def dmr_paths(xml_text, names):
    """Find the DAP4 path of each variable name in a DMR document (groups are Group elements)."""
    root = ET.fromstring(xml_text); out = {}
    def walk(el, path):
        for ch in el:
            tag = ch.tag.split("}")[-1]; nm = ch.get("name")
            if tag == "Group": walk(ch, path + "/" + nm)
            elif nm in names and tag not in ("Dim", "Dimension", "Attribute", "Enumeration"): out.setdefault(nm, path + "/" + nm)
    walk(root, ""); return out

def opendap_subset(session, g, claim):
    base = g["opendap_url"]
    base = re.sub(r"\.html$", "", base)
    if claim == "C-D": var, ce_idx = D_VAR, f"[{D_R0}:{D_R1 - 1}][{D_C0}:{D_C1 - 1}]"
    elif claim == "C-A": var, ce_idx = "LST_Day_CMG", f"[{A_R0}:{A_R1 - 1}][{A_C0}:{A_C1 - 1}]"
    else: var, ce_idx = "precipitation", f"[0][{B_LON0}:{B_LON1 - 1}][{B_LAT0}:{B_LAT1 - 1}]"
    r = session.get(base + ".dmr", timeout=120)
    if r.status_code != 200 or "xml" not in r.headers.get("content-type", "xml"): raise RuntimeError(f"dmr http {r.status_code}")
    p = dmr_paths(r.text, {var}).get(var)
    if not p: raise RuntimeError("variable not in DMR")
    r = session.get(base + ".dap.nc4", params={"dap4.ce": p + ce_idx}, timeout=300)
    if r.status_code != 200 or "html" in r.headers.get("content-type", ""): raise RuntimeError(f"dap http {r.status_code}")
    import netCDF4
    with netCDF4.Dataset("mem.nc", memory=r.content) as ds:
        node = ds
        for part in p.strip("/").split("/")[:-1]: node = node[part]
        v = node[var]; v.set_auto_maskandscale(False); raw = np.array(v[:]); dims = list(v.dimensions)  # raw stored ints; decode explicitly below (netCDF4 would otherwise auto-scale)
        attrs = {k: str(v.getncattr(k)) for k in v.ncattrs() if k in ("scale_factor", "add_offset", "_FillValue", "valid_range", "units")}
    if claim == "C-B":
        la, lo = b_axes(); return dict(values=b_finish(raw, dims, la, lo), lat=la, lon=lo, attrs=attrs, extra={})
    # HDF4 products: apply the same MODIS decode as the download path, using attributes returned by the server
    num = lambda k: float(attrs[k].strip("[]() ").split(",")[0]) if k in attrs else None
    vr = [float(x) for x in re.findall(r"[-0-9.eE+]+", attrs["valid_range"])] if "valid_range" in attrs else [None, None]
    if claim == "C-A":
        v2 = _modis_decode(raw.reshape(A_R1 - A_R0, A_C1 - A_C0), num("scale_factor") or 0.02, num("add_offset") or 0.0, num("_FillValue") if "_FillValue" in attrs else 0, vr[0], vr[1])
        la, lo = a_axes(); return dict(values=v2[::-1], lat=la[::-1], lon=lo, attrs=attrs, extra={})
    v2 = _modis_decode(raw.reshape(D_R1 - D_R0, D_C1 - D_C0), num("scale_factor") or 1.0, num("add_offset") or 0.0, num("_FillValue"), vr[0], vr[1])
    la, lo = d_axes(); return dict(values=v2[::-1], lat=la[::-1], lon=lo, attrs=attrs, extra={})


# ---------------- main ----------------
def block_mean(a, k, min_frac=0.5):
    """Same semantics as stats trendtrial.aggregate.block_aggregate: mean over k x k blocks, valid if >= min_frac cells valid."""
    *lead, ny, nx = a.shape; ny2, nx2 = ny // k, nx // k
    b = a[..., :ny2 * k, :nx2 * k].reshape(*lead, ny2, k, nx2, k)
    cnt = np.isfinite(b).sum(axis=(-3, -1))
    with np.errstate(invalid="ignore"):
        m = np.nanmean(b, axis=(-3, -1))
    m[cnt < min_frac * k * k] = np.nan
    return m

def block_axis(x, k):
    n = len(x) // k; return x[:n * k].reshape(n, k).mean(axis=1)

def sha(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()


def main():
    claim = sys.argv[1]; assert claim in CLAIMS, "claim must be C-A, C-B or C-D"
    arg = lambda n, d=None: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
    test = int(arg("--test", 0)); mode = arg("--mode", "auto"); C = CLAIMS[claim]; K = int(arg("--agg", C["agg"]))
    meta = json.loads((ROOT / claim / f"{claim}_cmr_granules.json").read_text())
    gl = meta["granules"][:test] if test else meta["granules"]
    outdir = ROOT / claim / ("_test" if test else ""); outdir.mkdir(parents=True, exist_ok=True)
    RAW = ROOT / "raw" / claim; RAW.mkdir(parents=True, exist_ok=True)

    if not _load_token_helper().ensure_token():
        sys.exit("TOKEN_MISSING: EARTHDATA_TOKEN not found in environment or HKCU\\Environment.")
    import earthaccess, requests
    auth = earthaccess.login(strategy="environment")
    if not getattr(auth, "authenticated", False): sys.exit("AUTH_FAIL: earthaccess login with the environment token failed (token expired or invalid).")
    session = earthaccess.get_requests_https_session()

    fb = {"C-A": a_from_hdf4, "C-B": b_from_h5, "C-D": d_from_hdf4}[claim]
    state = {"opendap": mode in ("auto", "opendap")}
    got, vals, t0 = [], [], dt.datetime.now(dt.timezone.utc)

    def download_subset(g):
        p = RAW / Path(g["https_url"]).name
        for attempt in range(3):
            try:
                with session.get(g["https_url"], stream=True, timeout=300) as r:
                    if r.status_code in (401, 403): raise AuthError(f"HTTP {r.status_code} on {meta['collection']['short_name']} download")
                    if "html" in r.headers.get("content-type", ""): raise AuthError("HTML (login page) instead of data: " + meta["collection"]["short_name"])
                    r.raise_for_status(); n = 0
                    with open(p, "wb") as f:
                        for c in r.iter_content(1 << 20):
                            n += len(c)
                            if n > RAW_CAP: raise RuntimeError("raw granule over 500 MB cap")
                            f.write(c)
                break
            except AuthError: raise
            except Exception:
                if attempt == 2: raise
                time.sleep(5 * (attempt + 1))
        try:
            h = sha_file(p); return fb(p), h
        finally:
            p.unlink(missing_ok=True)

    pre = {}
    if not test and state["opendap"]:  # OPeNDAP requests are server-bound (about 40 s each for C-D), so fetch them in parallel; the download fallback stays sequential
        from concurrent.futures import ThreadPoolExecutor
        def _pf(g):
            try: return opendap_subset(session, g, claim)
            except AuthError: raise
            except Exception as e: print("prefetch failed", g["year"], g["month"], type(e).__name__, str(e)[:100], flush=True); return None
        with ThreadPoolExecutor(max_workers=int(arg("--workers", 6))) as ex:
            for i, r in enumerate(ex.map(_pf, gl)):
                pre[i] = r
                if i % 10 == 0: print("prefetched", i, flush=True)
    for gi, g in enumerate(gl):
        res, how, h = None, "download", None
        if pre.get(gi) is not None: res, how = pre[gi], "opendap"
        elif state["opendap"] and not pre:
            try:
                res = opendap_subset(session, g, claim); how = "opendap"
                if test and gi == 0:  # cross-check against the whole-granule route
                    ref, h = download_subset(g)
                    same = np.array_equal(np.isnan(ref["values"]), np.isnan(res["values"])) and np.allclose(ref["values"], res["values"], equal_nan=True, rtol=0, atol=1e-6) \
                        and np.allclose(ref["lat"], res["lat"], atol=1e-6) and np.allclose(ref["lon"], res["lon"], atol=1e-6)
                    print("crosscheck opendap vs download:", "IDENTICAL" if same else "DIFFERENT -> using download route", flush=True)
                    if not same: res, how, state["opendap"] = ref, "download", False
            except AuthError: raise
            except Exception as e:
                print("opendap unavailable, falling back to download:", type(e).__name__, str(e)[:120], flush=True); state["opendap"] = False; res = None
        if res is None:
            if mode == "opendap": sys.exit("opendap mode requested but failed")
            res, h = download_subset(g); how = "download"
        vals.append(res)
        got.append(dict(granule_ur=g["granule_ur"], year=g["year"], month=g["month"], route=how, sha256_raw=h, valid_cells=int(np.isfinite(res["values"]).sum()), cells=int(res["values"].size)))
        print("ok", g["year"], g["month"], how, flush=True)

    lat, lon = vals[0]["lat"], vals[0]["lon"]
    assert all(np.allclose(v["lat"], lat) and np.allclose(v["lon"], lon) for v in vals), "grid changed between granules"
    cube = np.stack([v["values"] for v in vals]).astype(np.float32)
    year = np.array([g["year"] for g in gl], np.int16); month = np.array([g["month"] for g in gl], np.int8)
    if claim == "C-A": cube = (cube.astype(np.float64) - 273.15).astype(np.float32)  # K -> degC (a unit change, not a claim change)
    native = cube
    if K > 1:
        cube = block_mean(native.astype(np.float64), K).astype(np.float32); lat, lon = block_axis(lat, K), block_axis(lon, K)
        np.savez_compressed(outdir / f"{claim}_subset_native.npz", values=native, lat=vals[0]["lat"], lon=vals[0]["lon"], year=year, month=month)
    # support mask: cells valid (after QC and aggregation) in at least half of the granules; cells outside it (ocean/water for LST) are not counted as missing
    support = np.isfinite(cube).mean(axis=0) >= 0.5
    np.savez_compressed(outdir / "monthly.npz", values=cube, lat=lat, lon=lon, year=year, month=month, support=support)

    c = meta["collection"]
    claim_json = {"claim_id": claim, "claim_text": C["text"], "variable": C["variable"], "variable_plain": C["plain"], "units": C["units"],
                  "direction": "increase", "season_months": C["months"], "period": C["period"], "region_name": C["region"], "region_box": C["box"],
                  "product": {"name": f"{c['short_name']} ({c['title']})", "version": c["version"], "doi": c["doi"]}, "is_model_data": C["model"]}
    (outdir / "claim.json").write_text(json.dumps(claim_json, indent=1))

    t1 = dt.datetime.now(dt.timezone.utc)
    per_month = {}
    for i in range(len(year)): per_month.setdefault(int(month[i]), []).append(float(np.isfinite(cube[i]).mean()))
    qc = {"claim": claim, "n_granules": len(got), "shape_monthly_npz": list(cube.shape), "native_shape": list(native.shape), "agg_k": K,
          "cells_written": int(cube.shape[1] * cube.shape[2]), "valid_fraction_all": float(np.isfinite(cube).mean()),
          "valid_fraction_min_month": float(min(np.isfinite(cube[i]).mean() for i in range(len(year)))),
          "valid_fraction_by_calendar_month_mean": {str(k): float(np.mean(v)) for k, v in sorted(per_month.items())},
          "support_cells": int(support.sum()), "valid_fraction_within_support": float(np.isfinite(cube[:, support]).mean()), "min_month_valid_fraction_within_support": float(min(np.isfinite(cube[i][support]).mean() for i in range(len(year)))), "cells_never_valid": int((~np.isfinite(cube).any(axis=0)).sum()), "lat_range": [float(lat.min()), float(lat.max())], "lon_range": [float(lon.min()), float(lon.max())],
          "routes": sorted({x["route"] for x in got}), "decode_attrs_first_granule": {k: str(v) for k, v in vals[0]["attrs"].items()},
          "note": "Counts of valid cells only; no trend statistic computed."}
    (outdir / f"{claim}_qc.json").write_text(json.dumps(qc, indent=1))
    prov = {"claim": claim, "short_name": c["short_name"], "version": c["version"], "doi": c["doi"], "concept_id": c["concept_id"],
            "access_route": "Earthdata Login via environment token; OPeNDAP server-side subset where available, else one whole granule at a time, subset locally, raw deleted",
            "retrieved_utc_start": t0.isoformat(), "retrieved_utc_end": t1.isoformat(), "granules": got, "aggregation": f"block mean {K}x{K}, block valid if >= 50% cells valid" if K > 1 else "none (native grid)",
            "decode": "C-A: LST_Day_CMG stored uint16, real K = 0.02*stored, stored 0 (fill) and outside valid_range 7500-65535 set to NaN, then minus 273.15 = degC; MODIS: real = scale_factor*(stored - add_offset), fill and out-of-valid-range set to NaN; IMERG: mm/hr x 24 = mm/day, negatives (fill) set to NaN",
            "files": {p.name: sha_file(p) for p in sorted(outdir.glob("*")) if p.suffix in (".npz", ".json") and "provenance" not in p.name}}
    (outdir / f"{claim}_provenance.json").write_text(json.dumps(prov, indent=1))
    print("wrote", outdir, "monthly.npz", (outdir / "monthly.npz").stat().st_size / 1e6, "MB; cells", cube.shape[1:], "valid frac", round(qc["valid_fraction_all"], 4))


if __name__ == "__main__":
    try:
        main()
    except AuthError as e:
        print("AUTH_FAIL:", e, "(401/403: Earthdata application approval for this DAAC is probably missing)")
        sys.exit(3)
