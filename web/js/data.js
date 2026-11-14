// Bundle loader and adapter. The real stats bundle (stats/SCHEMA, one bundle per claim) is mapped to the shape the views use.
// Sources, first match wins: ?bundle=placeholder | ?bundle=withheld | data/index.json (list of bundle files) | data/example_bundle.json | placeholder.
// All shape knowledge lives in this file, so a schema change is a one-place edit.
let cache = null;

async function getJson(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }

export async function loadBundle() {
  if (cache) return cache;
  const q = new URLSearchParams(location.search).get("bundle");
  let raws = [], source = "";
  const attempts = q === "placeholder" ? [["data/placeholder_bundle.json"]] : q === "withheld" ? [["data/example_bundle_withheld.json"]] :
    [["data/index.json"], ["data/example_bundle.json"], ["data/placeholder_bundle.json"]];
  let lastErr;
  for (const [url] of attempts) {
    try {
      const j = await getJson(url);
      if (url.endsWith("index.json")) { raws = await Promise.all(j.bundles.map(f => getJson("data/" + f))); }
      else raws = [j];
      source = url; break;
    } catch (e) { lastErr = e; }
  }
  if (!raws.length) throw lastErr || new Error("no bundle");
  cache = { ...normalizeAll(raws), _source: source, _raws: raws };
  return cache;
}

function normalizeAll(raws) {
  const claims = [];
  let meta = {};
  for (const raw of raws) {
    if (raw.claims) { claims.push(...raw.claims); meta = { ...meta, placeholder: !!raw.placeholder, synthetic: !!(raw.synthetic || raw.placeholder), notice: raw.notice, declared_q: raw.declared_q, alpha: raw.alpha, run_id: raw.run_id, schema_version: raw.schema_version }; }
    else {
      const c = fromReal(raw); claims.push(c);
      meta = { ...meta, synthetic: meta.synthetic || c.synthetic, notice: meta.notice || (c.synthetic ? "SYNTHETIC test data from the stats pipeline. Not NASA data and not a result." : ""), declared_q: raw.params.bh_q, alpha: raw.params.alpha, run_id: raw.run.run_id, schema_version: raw.schema_version };
    }
  }
  return { ...meta, claims };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function seasonName(m) {
  const key = m.join(",");
  const named = { "1,2,3,4,5,6,7,8,9,10,11,12": "Annual mean", "12,1,2": "Winter (December to February)", "3,4,5": "Spring (March to May)", "6,7,8": "Summer (June to August)", "9,10,11": "Autumn (September to November)", "6,7,8,9": "Wet season (June to September)" }[key];
  return named || (m.length === 1 ? MONTHS[m[0] - 1] : `${MONTHS[m[0] - 1]} to ${MONTHS[m[m.length - 1] - 1]}`);
}
const BRANCH = { supported: ["Supported by this data", "ok"], partly_supported: ["Partly supported by this data", "warn"], not_supported: ["Not supported by this data", "neutral"], contradicted: ["Contradicted by this data", "bad"], withheld: ["No verdict given", "warn"] };

function fromReal(r) {
  const cl = r.claim, reg = r.regional, T = reg.tests, cells = r.cells, F = cells.fields, g = cells.grid, val = r.validation, v = r.verdict;
  const sign = F.slope_per_decade.map(x => Math.sign(x));
  const mkFlags = k => F["flag_rung" + k].map((f, i) => F.valid[i] ? (f ? (sign[i] || 1) : 0) : null);
  const nValid = cells.n_valid_cells;
  const ladder = cells.rungs.map(R => ({
    rung: R.rung, key: "rung" + R.rung, label: R.name, changes: R.what_changes, flags: mkFlags(R.rung), n_cells: nValid,
    n_flagged_any: R.flagged_cells, n_flagged_claimed: R.flagged_in_direction_cells, flagged_fraction_any: R.flagged_area_frac, flagged_fraction_claimed: R.flagged_in_direction_area_frac,
    cells_changed: R.cells_changed_vs_previous, note: R.rung === 2 ? cells.rung2_note : null,
  }));
  const [lbl, tone] = BRANCH[v.branch] || [v.branch, "neutral"];
  const sentences = v.text.split(/(?<=\.)\s+/);
  const gate = val.gate || {};
  const checklist = [
    { text: val.results_run && val.results_run.placeholder ? "Validation checks passed (PLACEHOLDER results in this fixture)" : "Validation checks passed for the regional test", ok: !!gate.regional_verdict_enabled },
    { text: "Result is stable under the coverage and block-length checks (a sensitivity check, not independent validation)", ok: !!(r.sensitivity && r.sensitivity.stable) },
    { text: `Enough valid years: ${r.coverage.years_valid} of ${r.coverage.years_total}`, ok: r.coverage.years_valid >= Math.max(r.params.min_valid_years_abs, r.params.min_valid_years_frac * r.coverage.years_total) },
    { text: "The regional test was run once, as registered", ok: true },
    { text: "Map flags are counted in the claimed direction only", ok: true },
  ];
  const lo = T.sen.ci_bootstrap_per_decade[0], hi = T.sen.ci_bootstrap_per_decade[1];
  const Fd = r.finding || {};
  const periodText = `${seasonName(cl.season_months)}, ${cl.period[0]} to ${cl.period[1]}`;
  const finding = {
    place: cl.region_name, variable: cl.variable, period: periodText,
    change_per_decade: { value: T.sen.slope_per_decade, unit: cl.units + " per decade", text: `${T.sen.slope_per_decade >= 0 ? "+" : "−"}${Math.abs(T.sen.slope_per_decade).toFixed(2)} ${cl.units} per decade (Sen slope)` },
    interval: { lo, hi, level: reg.band.level, meaning: Fd.interval_meaning || (T.sen.interval_method + ". Not adjusted for the choice of headline.") },
    product: cl.product, not_supported: Fd.not_supported || null, selection_disclosure: Fd.selection_disclosure || null, scope_text: Fd.scope_text || null,
    run_id: r.run.run_id, ledger_ref: Fd.ledger_ref || null,
  };
  return {
    id: cl.claim_id, claim_text: cl.claim_text.replace(/\.$/, ""), direction: cl.direction, synthetic: !!cl.synthetic,
    variable: { key: cl.variable, name: cl.variable.charAt(0).toUpperCase() + cl.variable.slice(1), short: cl.variable, unit: cl.units, plain: cl.variable_plain },
    product: cl.product, region: { name: cl.region_name, box: { s: cl.region_box.lat_min, n: cl.region_box.lat_max, w: cl.region_box.lon_min, e: cl.region_box.lon_max } },
    season: seasonName(cl.season_months), period: { start: cl.period[0], end: cl.period[1], n: cl.period[1] - cl.period[0] + 1 },
    data_kind: cl.is_model_data ? "model_reanalysis" : "satellite_observation",
    grid: { lat: g.lat, lon: g.lon, n_lat: g.ny, n_lon: g.nx, dlat: g.lat.length > 1 ? g.lat[1] - g.lat[0] : 1, dlon: g.lon.length > 1 ? g.lon[1] - g.lon[0] : 1 },
    cell_slope_per_decade: F.slope_per_decade.map((x, i) => F.valid[i] ? x : null),
    ladder,
    regional: {
      years: reg.years, anomaly: reg.anomaly, band_lo: reg.band.lo, band_hi: reg.band.hi, band_method: `${reg.band.meaning}. ${T.sen.interval_method}.`, units: reg.units, baseline: `average of this series, ${reg.baseline_mean} ${reg.units}`,
      sen_line: reg.sen_line,
      sen: { slope_per_decade: T.sen.slope_per_decade, ci_lo: lo, ci_hi: hi, ci_level: reg.band.level, analytic_lo: T.sen.ci_analytic_hr_per_decade[0], analytic_hi: T.sen.ci_analytic_hr_per_decade[1] },
      mk_hr: { tau: T.mk_hr.tau, z: T.mk_hr.z, p_hamed_rao: T.mk_hr.p, p_independent: T.mk_independent.p, vif: T.mk_hr.hr_factor },
      ols: { slope_per_decade: T.ols.slope_per_decade, ci_lo: T.ols.ci_per_decade[0], ci_hi: T.ols.ci_per_decade[1], p: T.ols.p, t: T.ols.t },
    },
    gate: { regional: !!gate.regional_verdict_enabled, interval: !!gate.interval_enabled, cells: !!gate.cells_enabled, reasons: gate.reasons_blocking_verdict || gate.reasons || [] },
    verdict: { branch: v.branch, label: lbl, tone, headline: sentences[0], sentences: sentences.slice(1), checklist, withheld_reasons: v.withheld_reasons || [] },
    finding, method_notes: r.method_notes, sensitivity: r.sensitivity, coverage: r.coverage,
  };
}

export const claimById = (b, id) => b.claims.find(c => c.id === id);
// 1 flagged increase, -1 flagged decrease, 0 not flagged, null no data
export function categoryCounts(flags) {
  let up = 0, down = 0, nf = 0, nd = 0;
  for (const v of flags) { if (v == null) nd++; else if (v > 0) up++; else if (v < 0) down++; else nf++; }
  return { up, down, nf, nd, n: up + down + nf };
}
