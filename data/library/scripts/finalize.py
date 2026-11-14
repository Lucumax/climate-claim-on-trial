"""Turn a staged 1-degree monthly cube into the browser files + provenance + qc + manifest entry.
Usage: data\\.venv\\Scripts\\python.exe -u -I data\\library\\scripts\\finalize.py <product id>
Reads scratch stage/<id>_cube.npy and stage/<id>_prov.json (written by the build_<product>.py script)."""
import sys, json, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import libcommon as L
from products import PRODUCTS, sanity

pid = sys.argv[1]; P = PRODUCTS[pid]
cube = np.load(L.SCRATCH / f"{pid}_cube.npy"); stage = json.load(open(L.SCRATCH / f"{pid}_prov.json"))
times = [tuple(t) for t in stage["times"]]; col = stage["collection"]
assert cube.shape[0] == len(times)

tiles, nbytes = L.write_tiles(pid, cube, P["scale"], P["offset"])
g = L.write_series(pid, cube, times)
qc = L.qc_report(pid, cube, times)
qc["sanity_checks_not_findings"] = sanity(pid, cube, times)
# quantisation error actually incurred (max abs and mean abs of int16 round trip)
fin = np.isfinite(cube)
qerr = np.abs(np.rint(cube[fin] / P["scale"]) * P["scale"] - cube[fin])
qc["quantisation"] = {"scale": P["scale"], "offset": P["offset"], "max_abs_error": float(qerr.max()), "mean_abs_error": float(qerr.mean())}
qc["value_range"] = [float(np.nanmin(cube)), float(np.nanmax(cube))]
qc["tiles_written"] = len(tiles); qc["tile_bytes_total"] = nbytes
qc["extra"] = stage.get("qc_extra", {})
out = L.LIB / pid; out.mkdir(parents=True, exist_ok=True)
(out / "qc.json").write_text(json.dumps(qc, indent=1))

valid_months = [f"{y}-{m:02d}" for (y, m), v in zip(times, np.isfinite(cube).any(axis=(1, 2))) if v]
prov = {"id": pid, "product": P["short"], "collection": col, "agency_archive": P["agency"], "source_variable": P["source_var"], "access": stage.get("access", ""),
        "retrieved_utc": [stage.get("t0"), stage.get("t1")], "regrid": stage.get("regrid", ""), "granules": stage["granules"],
        "outputs_sha256": L.file_hashes(pid), "builder_scripts": ["data/library/scripts/libcommon.py", "data/library/scripts/products.py", "data/library/scripts/finalize.py", stage.get("script", "")],
        "note": "Raw granules are not kept; only the 1-degree monthly derivative is shipped. No trend statistic is computed in the build."}
(out / "provenance.json").write_text(json.dumps(prov, indent=1))

entry = {"id": pid, "name": P["name"], "definition": P["definition"], "units": P["units"], "product": P["short"], "version": col["version"], "short_name": col["short_name"],
         "concept_id": col["concept_id"], "doi": "https://doi.org/" + col["doi"], "agency": P["agency"], "kind": P["kind"], "source_variable": P["source_var"],
         "period": {"first_month": valid_months[0], "last_month": valid_months[-1], "n_months_axis": len(times), "t0": [times[0][0], times[0][1]], "months_all_missing": qc["months_all_missing"]},
         "native_resolution": P["native"], "library_resolution": "1 degree, area-weighted block mean of valid native cells (block kept if >= 50% valid)",
         "scale": P["scale"], "offset": P["offset"], "nodata_int16": L.SENT, "caveats": P["caveats"], "tiles": tiles, "files": {"series": f"{pid}/global_series.json", "tile_means": f"{pid}/tile_means.json"},
         "build_date_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")}
L.update_manifest(entry)
print(pid, "tiles", len(tiles), "tile bytes", nbytes, "web dir bytes", L.dir_bytes(L.WEB / pid), "period", valid_months[0], valid_months[-1], "missing", qc["months_all_missing"][:10])
print("\n".join(qc["sanity_checks_not_findings"]))
