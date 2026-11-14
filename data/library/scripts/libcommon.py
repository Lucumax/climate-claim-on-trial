"""Shared helpers for the NASA satellite library (A5). Token comes from the environment via data/scripts/_token.py; never printed or stored."""
import json, hashlib, re, sys, time, datetime as dt, importlib.util
from pathlib import Path
import numpy as np, requests

HERE = Path(__file__).resolve().parent
LIB = HERE.parent                       # data/library
ROOT = LIB.parent.parent                # repo root
WEB = ROOT / "web" / "data" / "library"
CMR = "https://cmr.earthdata.nasa.gov/search"

def session():
    spec = importlib.util.spec_from_file_location("_token", ROOT / "data" / "scripts" / "_token.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    if not m.ensure_token(): sys.exit("TOKEN_MISSING")
    import earthaccess
    a = earthaccess.login(strategy="environment")
    if not getattr(a, "authenticated", False): sys.exit("AUTH_FAIL")
    return earthaccess.get_requests_https_session()

def collection(cid):
    u = requests.get(f"{CMR}/collections.umm_json", params={"concept_id": cid}, timeout=60).json()["items"][0]["umm"]
    return {"concept_id": cid, "short_name": u["ShortName"], "version": u["Version"], "doi": u["DOI"]["DOI"], "title": u["EntryTitle"],
            "temporal": u["TemporalExtents"][0]["RangeDateTimes"]}

def find_collection(short_name):
    j = requests.get(f"{CMR}/collections.umm_json", params={"short_name": short_name, "page_size": 20}, timeout=60).json()["items"]
    return [(i["meta"]["concept-id"], i["umm"]["Version"], i["umm"]["EntryTitle"], i["meta"].get("provider-id")) for i in j]

def list_granules(cid, y0, y1):
    """All granules of a collection between Jan y0 and Dec y1, paged. Returns list of dicts (begin, granule_ur, urls, size)."""
    out, page = [], 1
    while True:
        j = requests.get(f"{CMR}/granules.umm_json", params={"collection_concept_id": cid, "page_size": 500, "page_num": page,
                         "temporal": f"{y0}-01-01T00:00:00Z,{y1}-12-31T23:59:59Z", "sort_key": "start_date"}, timeout=120).json()
        items = j.get("items", [])
        if not items: break
        for it in items:
            u = it["umm"]; b = u["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
            size = (u.get("DataGranule", {}).get("ArchiveAndDistributionInformation") or [{}])[0]
            urls = {r["Type"] + ("|s3" if r["URL"].startswith("s3") else ""): r["URL"] for r in u.get("RelatedUrls", []) if r["Type"] in ("GET DATA", "GET DATA VIA DIRECT ACCESS", "USE SERVICE API")}
            out.append(dict(begin=b, end=u["TemporalExtent"]["RangeDateTime"].get("EndingDateTime"), granule_ur=u["GranuleUR"], size_mb=size.get("Size"),
                            https_url=urls.get("GET DATA"), opendap_url=urls.get("USE SERVICE API")))
        page += 1
        if len(items) < 500: break
    return out

def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()

def free_gb():
    import shutil
    return shutil.disk_usage("C:/").free / 1e9

def check_disk(min_gb=4.0):
    f = free_gb()
    print(f"free disk {f:.2f} GB", flush=True)
    if f < min_gb: sys.exit(f"STOP: free disk {f:.2f} GB < {min_gb} GB")

# ---------- regridding ----------
def block_mean_valid(a, k, min_frac=0.0, weights=None):
    """Mean over k x k blocks of the last two axes using only finite cells. Block is NaN if valid share < min_frac (>0 means at least that share)."""
    *lead, ny, nx = a.shape; ny2, nx2 = ny // k, nx // k
    b = a[..., :ny2 * k, :nx2 * k].reshape(*lead, ny2, k, nx2, k)
    fin = np.isfinite(b); cnt = fin.sum(axis=(-3, -1))
    s = np.where(fin, b, 0).sum(axis=(-3, -1), dtype=np.float64)
    with np.errstate(invalid="ignore", divide="ignore"):
        m = s / cnt
    m[cnt == 0] = np.nan
    if min_frac > 0: m[cnt < min_frac * k * k] = np.nan
    return m.astype(np.float32), cnt / float(k * k)

LAT1 = 89.5 - np.arange(180)       # 1 deg cell centres, north to south
LON1 = -179.5 + np.arange(360)
W1 = np.cos(np.deg2rad(LAT1))      # area weight per row (centre latitude)
def wmean(cube, mask=None, row0=0):
    """Area-weighted mean of the last two axes (180 x 360), valid cells only. cube [..., 180, 360] -> [...]"""
    w = np.broadcast_to(W1[row0:row0 + cube.shape[-2]][:, None], cube.shape[-2:])
    fin = np.isfinite(cube)
    if mask is not None: fin = fin & mask
    num = np.where(fin, cube, 0) * w; den = np.where(fin, w, 0)
    with np.errstate(invalid="ignore", divide="ignore"):
        return (num.sum(axis=(-2, -1), dtype=np.float64) / den.sum(axis=(-2, -1), dtype=np.float64)).astype(np.float64)


# ---------- writer: tiles, series, qc ----------
import gzip
TILE = 30
SENT = -32768
SCRATCH = Path(r"<local-temp>")

def month_axis(y0, m0, n):
    return [((y0 * 12 + m0 - 1 + i) // 12, (y0 * 12 + m0 - 1 + i) % 12 + 1) for i in range(n)]

def write_tiles(pid, cube, scale, offset=0.0):
    """cube float32 [T,180,360] (row 0 = 90N, col 0 = -180). Writes web/data/library/<pid>/tile_<r>_<c>.bin.gz for every tile with any valid cell.
    int16 = round((value - offset) / scale); NaN = -32768. Returns (tiles_written list, bytes)."""
    out = WEB / pid; out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("tile_*"): old.unlink()
    q = np.where(np.isfinite(cube), np.rint((cube - offset) / scale), SENT)
    assert q[np.isfinite(cube)].max() < 32767 and q[np.isfinite(cube)].min() > -32767, "int16 overflow: pick a different scale"
    q = q.astype("<i2")
    tiles, total = [], 0
    for r in range(180 // TILE):
        for c in range(360 // TILE):
            t = np.ascontiguousarray(q[:, r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE])
            if not (t != SENT).any(): continue
            u = t.view(np.uint8).reshape(-1, 2)           # little-endian: [:,0] low byte, [:,1] high byte
            b = gzip.compress(u[:, 1].tobytes() + u[:, 0].tobytes(), 9, mtime=0)   # byte-planar: all high bytes, then all low bytes
            (out / f"tile_{r}_{c}.bin.gz").write_bytes(b); total += len(b)
            tiles.append([r, c])
    return tiles, total

def write_series(pid, cube, times, valid_mask=None, nd=4):
    out = WEB / pid
    g = wmean(cube)
    tm = np.full((len(times), 6, 12), np.nan)
    for r in range(6):
        for c in range(12):
            tm[:, r, c] = wmean(cube[:, r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE], row0=r * TILE)
    clean = lambda a: [None if not np.isfinite(x) else round(float(x), nd) for x in a]
    (out / "global_series.json").write_text(json.dumps({"t0": [times[0][0], times[0][1]], "n": len(times), "weighting": "cos(latitude) area weight over valid 1-degree cells",
                                                       "mean": clean(g)}, separators=(",", ":")))
    (out / "tile_means.json").write_text(json.dumps({"t0": [times[0][0], times[0][1]], "n": len(times), "tile_deg": TILE, "rows": "r=0 is 90N-60N",
        "cols": "c=0 is 180W-150W", "means": {f"{r}_{c}": clean(tm[:, r, c]) for r in range(6) for c in range(12) if np.isfinite(tm[:, r, c]).any()}}, separators=(",", ":")))
    return g

def qc_report(pid, cube, times):
    vf = np.isfinite(cube).mean(axis=(1, 2))
    wf = np.array([float(np.where(np.isfinite(cube[i]), W1[:, None], 0).sum() / (W1.sum() * 360)) for i in range(len(times))])
    return {"months": len(times), "valid_fraction_by_month_cells": [round(float(x), 4) for x in vf], "valid_fraction_by_month_area": [round(float(x), 4) for x in wf],
            "month_labels": [f"{y}-{m:02d}" for y, m in times], "months_all_missing": [f"{y}-{m:02d}" for (y, m), x in zip(times, vf) if x == 0],
            "min_valid_fraction_nonempty_month": float(vf[vf > 0].min()) if (vf > 0).any() else 0.0, "mean_valid_fraction": float(vf.mean()),
            "cells_never_valid": int((~np.isfinite(cube).any(axis=0)).sum())}

def file_hashes(pid):
    return {p.name: sha_file(p) for p in sorted((WEB / pid).glob("*"))}

def dir_bytes(p): return sum(f.stat().st_size for f in Path(p).glob("*") if f.is_file())


def box(cube, lat0, lat1, lon0, lon1):
    """Area-weighted series for a lat/lon box (cell centres inside), from the 1 deg cube."""
    r = np.where((LAT1 >= lat0) & (LAT1 <= lat1))[0]; c = np.where((LON1 >= lon0) & (LON1 <= lon1))[0]
    return wmean(cube[:, r[0]:r[-1] + 1, c[0]:c[-1] + 1], row0=int(r[0]))

def season_mean(series, times, months):
    sel = [i for i, (y, m) in enumerate(times) if m in months]
    return float(np.nanmean(np.array(series)[sel]))

def yearly(series, times, months=None):
    out = {}
    for i, (y, m) in enumerate(times):
        if months is None or m in months:
            if np.isfinite(series[i]): out.setdefault(y, []).append(series[i])
    return {y: float(np.mean(v)) for y, v in out.items()}

MANIFEST = WEB / "manifest.json"
def update_manifest(entry):
    m = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"library": "NASA satellite library (Climate Claim on Trial)", "tile_deg": TILE, "grid": {
        "resolution_deg": 1, "rows": 180, "cols": 360, "row0": "89.5N (rows run north to south)", "col0": "179.5W (columns run west to east)",
        "tiles": "6 x 12 tiles of 30 x 30 cells; tile r covers 90-30r N to 60-30r N, tile c covers 180W+30c eastward",
        "tile_file": "<id>/tile_<r>_<c>.bin.gz",
        "encoding": "gunzip; bytes = [all high bytes of the int16 values][all low bytes]; int16 little-endian = (high<<8)|low; layout [month][30][30]; value = int16*scale + offset; -32768 = no data; tiles that are entirely no-data are not written"},
        "variables": []}
    m["variables"] = [v for v in m["variables"] if v["id"] != entry["id"]] + [entry]
    order = ["precip_imerg", "aod_myd08", "tws_grace", "lst_day_myd11", "snow_mod10cm"]
    m["variables"].sort(key=lambda v: order.index(v["id"]) if v["id"] in order else 99)
    MANIFEST.write_text(json.dumps(m, indent=1))


# ---------- OPeNDAP DAP4 helpers (HDF4 / HDF5 granules; raw stored values are returned and decoded by the caller, to avoid the double-scaling bug) ----------
import xml.etree.ElementTree as ET
def dmr_path(xml_text, name):
    root = ET.fromstring(xml_text); found = []
    def walk(el, path):
        for ch in el:
            tag = ch.tag.split("}")[-1]; nm = ch.get("name")
            if tag == "Group": walk(ch, path + "/" + nm)
            elif nm == name and tag not in ("Dim", "Dimension", "Attribute", "Enumeration"): found.append(path + "/" + nm)
    walk(root, ""); return found[0] if found else None

def dap4_raw(sess, opendap_url, var, index="", path=None, retries=4):
    """Return (raw ndarray with NO scaling or masking applied, attrs dict of strings, response bytes). index like '[0:2:3599][0:2:7199]'."""
    import netCDF4
    base = re.sub(r"\.html$", "", opendap_url)
    for attempt in range(retries):
        try:
            if path is None:
                r = sess.get(base + ".dmr", timeout=180)
                if r.status_code != 200: raise RuntimeError(f"dmr http {r.status_code}")
                path = dmr_path(r.text, var)
                if not path: raise RuntimeError("variable not in DMR")
            r = sess.get(base + ".dap.nc4", params={"dap4.ce": path + index}, timeout=600)
            if r.status_code != 200 or "html" in r.headers.get("content-type", ""): raise RuntimeError(f"dap http {r.status_code}")
            with netCDF4.Dataset("mem.nc", memory=r.content) as ds:
                node = ds
                for part in path.strip("/").split("/")[:-1]: node = node[part]
                v = node[var]; v.set_auto_maskandscale(False); raw = np.array(v[:])
                attrs = {k: str(v.getncattr(k)) for k in v.ncattrs()}
            return raw, attrs, r.content
        except Exception as e:
            if attempt == retries - 1: raise
            time.sleep(4 * (attempt + 1))

def attr_nums(s):
    return [float(x) for x in re.findall(r"[-+]?\d+\.?\d*(?:[eE][-+]?\d+)?", s)]
def modis_decode(raw, attrs, fill_default=None):
    """real = scale_factor * (stored - add_offset); fill and out-of-valid-range -> NaN. Applied exactly once."""
    sc = attr_nums(attrs["scale_factor"])[0] if "scale_factor" in attrs else 1.0
    off = attr_nums(attrs["add_offset"])[0] if "add_offset" in attrs else 0.0
    fill = attr_nums(attrs["_FillValue"])[0] if "_FillValue" in attrs else fill_default
    vr = attr_nums(attrs["valid_range"]) if "valid_range" in attrs else None
    r = raw.astype(np.float64); bad = np.zeros(r.shape, bool)
    if fill is not None: bad |= r == fill
    if vr and len(vr) >= 2: bad |= (r < vr[0]) | (r > vr[1])
    out = sc * (r - off); out[bad] = np.nan
    return out, dict(scale=sc, offset=off, fill=fill, valid_range=vr)
