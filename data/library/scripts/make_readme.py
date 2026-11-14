"""Write data/library/README.md from the manifest and the per-product qc files. Usage: python -I make_readme.py"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import libcommon as L

man = json.loads(L.MANIFEST.read_text())
g = man["grid"]
lines = ["# NASA satellite library (precomputed, global, monthly, 1 degree)", "",
         "Built for Investigate mode so a student can test a claim against real satellite variables anywhere on Earth, including the whole world.",
         "Every file is a derivative of a NASA product (see each section). Raw granules are not kept. Browser files live in `web/data/library/`; scripts, provenance and QC live here.",
         "", "## Grid and file format (all products)", "",
         "- Grid: 180 x 360 cells of 1 degree, row 0 = 89.5N (rows run north to south), column 0 = 179.5W. Regridded by area-weighted use of valid native cells (mean of valid cells in the block; block kept if at least half the native cells are valid).",
         "- Tiles: 6 x 12 tiles of 30 x 30 cells. Tile `r,c` covers latitude 90-30r to 60-30r (north) and longitude 180W+30c eastward. File: `web/data/library/<id>/tile_<r>_<c>.bin.gz`. Tiles with no valid cell are not written (the manifest lists the tiles that exist).",
         "- Encoding: gunzip; the bytes are [all high bytes][all low bytes] of little-endian int16 values in layout [month][30][30]; `value = int16 * scale + offset`; `-32768` = no data. (Byte-planar order roughly halves the gzip size.)",
         "- Also per product: `global_series.json` (cos-latitude area-weighted global monthly mean of valid cells), `tile_means.json` (the same for each tile), listed in `manifest.json` with definition, units, product, version, DOI, period, caveats.",
         "- Month axis: `period.t0` = first month; index i = month t0 + i; months with no data at all are in `months_all_missing` and are empty in every tile (nothing is interpolated).",
         "- Decode check: `scripts/verify.py <id>` decodes the shipped tiles as a browser would and compares them with the staged cube (mask identical, error <= scale/2).",
         "- Rebuild: `data\\.venv\\Scripts\\python.exe -u -I data\\library\\scripts\\build_<product>.py` then `finalize.py <id>`. Needs the Earthdata token in the user environment (never printed or stored).", ""]
for v in man["variables"]:
    pid = v["id"]; q = json.loads((L.LIB / pid / "qc.json").read_text())
    p = v["period"]
    lines += [f"## {v['name']} (`{pid}`)", "",
              f"- Product: {v['product']}; version {v['version']}; {v['agency']}; concept id {v['concept_id']}; DOI {v['doi']}.",
              f"- Variable: `{v['source_variable']}`; units {v['units']}; encoded with scale {v['scale']}.",
              f"- In plain words: {v['definition']}",
              f"- Period: {p['first_month']} to {p['last_month']} ({p['n_months_axis']} month slots; months with no data: {', '.join(p['months_all_missing']) or 'none'}).",
              f"- Native resolution: {v['native_resolution']}. Library: {v['library_resolution']}.",
              f"- Size: {len(v['tiles'])} tiles, {q['tile_bytes_total'] / 1e6:.1f} MB.",
              f"- QC: mean valid share of the grid per month {q['mean_valid_fraction'] * 100:.1f}% of cells; lowest non-empty month {q['min_valid_fraction_nonempty_month'] * 100:.1f}%; value range {q['value_range'][0]:.3g} to {q['value_range'][1]:.3g}; quantisation max error {q['quantisation']['max_abs_error']:.4g}.",
              f"- Caveats: {v['caveats']}",
              "- Sanity checks (known patterns, recorded as checks, not findings):"]
    lines += [f"  - {s}" for s in q["sanity_checks_not_findings"]]
    for k in ("cross_check_vs_registered_case_C-B", "roundtrip_check", "access_note"):
        if k in q: lines.append(f"  - {k.replace('_', ' ')}: {q[k]}")
    lines += [f"- Provenance: `data/library/{pid}/provenance.json` (granule ids, response hashes, output sha256). QC by month: `data/library/{pid}/qc.json`.", ""]
(L.LIB / "README.md").write_text("\n".join(lines) + "\n")
print("README written", len(lines), "lines")
