// Dev tool: fetch the two guided-demo series from NASA POWER once and store the aggregated monthly rows as small JSON.
// Run: node web/tools/make_demo_cache.mjs   (needs network). Output: web/data/demo_cache/<id>.json
import { fetchMonthly } from "../js/live.js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const cat = JSON.parse(readFileSync(join(here, "../data/variables.json"), "utf8"));
const DEMOS = [{ id: "wi", varKey: "t2m", preset: "wisconsin" }, { id: "sahel", varKey: "precip", preset: "sahel" }];
for (const d of DEMOS) {
  const variable = cat.variables.find(v => v.key === d.varKey), box = cat.presets.find(p => p.key === d.preset).box;
  const r = await fetchMonthly({ variable, box, startYear: 1981, endYear: 2025 });
  const out = { id: d.id, variable: d.varKey, preset: d.preset, box, startYear: 1981, endYear: 2025, fetched: new Date().toISOString(), fetched_label: "Nov 14", source_url: "https://power.larc.nasa.gov/api/temporal/monthly/regional", units: r.units, n_cells: r.n_cells, n_tiles: r.n_tiles, method: r.method, first_year: r.first_year, last_year: r.last_year, note: r.note, rows: r.rows.map(x => [x.year, x.month, x.value]) };
  writeFileSync(join(here, "../data/demo_cache", d.id + ".json"), JSON.stringify(out));
  console.log(d.id, r.rows.length, "rows", r.n_cells, "cells");
}
