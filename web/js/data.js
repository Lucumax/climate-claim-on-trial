// Bundle loader and adapter. The real stats bundle (stats/SCHEMA, one bundle per claim) is mapped to the shape the views use.
// Sources, first match wins: ?bundle=placeholder | ?bundle=withheld | data/index.json (list of bundle files) | data/example_bundle.json | placeholder.
// All shape knowledge lives in this file, so a schema change is a one-place edit.
import { chem } from "./util.js";
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

/** One raw stats bundle (stats/SCHEMA shape) -> the claim shape the views use. For callers that fetch a bundle file the index does not list yet. */
export const adaptBundle = raw => normalizeAll([raw]).claims[0];

function normalizeAll(raws) {
  const claims = [];
  let meta = {};
  for (const raw of raws) {
    if (raw.claims) { claims.push(...raw.claims.map(c => legacyAdapt({ gate: { regional: true, interval: true, cells: true, reasons: [] }, synthetic: true, ...c }))); meta = { ...meta, placeholder: !!raw.placeholder, synthetic: !!(raw.synthetic || raw.placeholder), notice: raw.notice, declared_q: raw.declared_q, alpha: raw.alpha, run_id: raw.run_id, schema_version: raw.schema_version }; }
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
const BRANCH = { supported: ["Supported", "ok"], partly_supported: ["Partly supported", "warn"], not_supported: ["Not supported", "neutral"], contradicted: ["Contradicted", "bad"], withheld: ["No verdict given", "warn"] };
// Short names for the regional and cell tests the validation gate can choose (stats/SCHEMA.md, addendum 2).
export const METHOD_NAME = { mk_independent: "Mann-Kendall, years treated as independent", hr_registered: "Hamed-Rao (as registered)", hr_all_lags: "Hamed-Rao, all lags", yue_wang: "Yue-Wang", tfpw: "TFPW (trend-free pre-whitening)", boot_mk_L3: "block-bootstrap Mann-Kendall (3-year blocks)", boot_mk_L5: "block-bootstrap Mann-Kendall (5-year blocks)" };
const testTitle = m => m === "mk_independent" ? "Mann-Kendall (years treated as independent)" : /^boot_mk/.test(m) ? `Mann-Kendall with a moving-block bootstrap p-value (${(METHOD_NAME[m] || "").replace(/^.*\(|\)$/g, "") || "blocks"})` : `Mann-Kendall with ${METHOD_NAME[m] || m} correction`;
const COV_NOTE = "; passed a 90% coverage check in simulations";
const INTERVAL_WORD = { analytic_hr: "Sen slope, analytic", bootstrap: "Sen slope, moving-block bootstrap" };
export const BAND_MEANING = "The shaded band is the Sen line tilted between the lower and upper ends of the 95% slope interval, pivoting at the middle year. It shows how steep the trend could plausibly be. It does not show uncertainty about the level, and it is not a range for individual years.";
export const REG_SHORT = "Registered before data download (10:29 AM ET), with two dated method amendments made on simulated data before results, and one disclosed cell-rule correction.";

// The ONE place that decides which test, interval and band a case shows. Everything downstream reads r.test / r.interval / r.band / r.ctx.
function pickRegional(reg, T, gate, val) {
  // shipped regional test (null if the gate disabled it; older bundles without addendum 2 fall back to the registered Hamed-Rao test)
  let test = null;
  if (T.shipped) {
    const sh = T.shipped;
    test = { method: sh.method, name: METHOD_NAME[sh.method] || sh.method, title: testTitle(sh.method), label: sh.label, p: sh.p, z: sh.z, factor: sh.variance_factor, significant: sh.significant, alpha: sh.alpha };
  } else if (!("shipped" in T) && T.mk_hr && gate.regional_verdict_enabled !== false) {
    test = { method: "hr_registered", name: "Hamed-Rao", title: "Mann-Kendall with Hamed-Rao correction", label: "Mann-Kendall with Hamed-Rao variance correction", p: T.mk_hr.p, z: T.mk_hr.z, factor: T.mk_hr.hr_factor, significant: T.mk_hr.significant, alpha: T.mk_hr.alpha };
  }
  // selected interval: the ONLY displayable interval is regional.interval.selected (null when none passed its coverage bar). Candidates are audit-only and never read here.
  let interval = null;
  const sel = reg.interval && reg.interval.selected;
  if (sel && gate.interval_enabled !== false && Number.isFinite(sel.low) && Number.isFinite(sel.high)) {
    const cov = sel.coverage_achieved && sel.coverage_achieved.headline && sel.coverage_achieved.headline.value;
    interval = { lo: sel.low, hi: sel.high, level: sel.level_nominal || 0.95, method: sel.method, coverage: cov != null ? cov : null, meaning: sel.meaning || null,
      label: `nominal 95% interval (${INTERVAL_WORD[sel.method] || sel.method}${cov != null ? `; measured coverage ${(cov * 100).toFixed(0)}% at this setting` : ""})` };
  }
  const band = interval && reg.band && Array.isArray(reg.band.lo) && Array.isArray(reg.band.hi) ? { lo: reg.band.lo, hi: reg.band.hi, meaning: reg.band.band_meaning || null } : null;
  const ctx = { hr: T.mk_hr ? { p: T.mk_hr.p, factor: T.mk_hr.hr_factor, factor_raw: T.mk_hr.hr_factor_raw } : null, raw: T.mk_independent ? { p: T.mk_independent.p } : null };
  return { test, interval, band, ctx };
}


// Calibration lines shown next to the interval and next to a released verdict. The stats worker ships them as validation.display
// (interval_text, false_positive_text); when absent they are built from validation.adaptive, and hidden when neither exists.
function displayTexts(val, iv) {
  const d = val.display || {}, ad = val.adaptive || {};
  const pc = o => (o && Number.isFinite(o.value) ? `${(o.value * 100).toFixed(1).replace(/\.0$/, "")}%` : null);
  let interval = iv ? (d.interval_text || null) : null;
  if (iv && !interval && ad.status === "run" && pc(ad.interval_coverage_null)) interval = `nominal 95% interval; measured coverage ${pc(ad.interval_coverage_null)} in trendless simulations and ${pc(ad.interval_coverage_trend) || "n/a"} in simulations with a trend, at this setting`;
  let fp = d.false_positive_text || null;
  if (!fp && ad.status === "run" && pc(ad.size_given_release)) fp = `false-alarm rate among simulated records that received a verdict, at this setting: ${pc(ad.size_given_release)}${pc(ad.size_unconditional) ? ` (overall ${pc(ad.size_unconditional)})` : ""}`;
  return { interval, falsePositive: fp };
}

function fromReal(r) {
  const cl = r.claim, reg = r.regional, T = reg.tests, cells = r.cells, F = cells.fields, g = cells.grid, val = r.validation || {}, v = r.verdict;
  const gate = val.gate || {};
  const sign = F.slope_per_decade.map(x => Math.sign(x));
  const mkFlags = k => F["flag_rung" + k].map((f, i) => F.valid[i] ? (f ? (sign[i] || 1) : 0) : null);
  const nValid = cells.n_valid_cells, bhOn = cells.cells_mode !== "unadjusted_descriptive" && cells.cells_mode !== "off";   // no validated cell test (descriptive or off): hearing 4 (the false-discovery step) is not shown
  const cellTest = METHOD_NAME[cells.cell_test] || null;
  const ladder = cells.rungs.filter(R => bhOn || R.rung < 4).map(R => ({
    rung: R.rung, key: "rung" + R.rung, label: R.rung === 3 && cellTest ? `Autocorrelation correction: ${cellTest}` : R.name, changes: R.what_changes, flags: mkFlags(R.rung), n_cells: nValid,
    n_flagged_any: R.flagged_cells, n_flagged_claimed: R.flagged_in_direction_cells, flagged_fraction_any: R.flagged_area_frac, flagged_fraction_claimed: R.flagged_in_direction_area_frac,
    cell_frac_any: nValid ? R.flagged_cells / nValid : 0, cell_frac_claimed: nValid ? R.flagged_in_direction_cells / nValid : 0,
    cells_changed: R.cells_changed_vs_previous, note: R.rung === 2 ? cells.rung2_note : null, explain: R.explain || null, threshold_text: R.threshold_text || null, q_used: R.q || null,
    registered_hr: R.registered_hr_flagged_cells != null ? { cells: R.registered_hr_flagged_cells, area: R.registered_hr_flagged_area_frac } : null,
  }));
  const [lbl, tone] = BRANCH[v.id] || BRANCH[v.branch] || [v.branch, "neutral"];
  const sentences = v.text.split(/(?<=\.)\s+/);
  const R_ = pickRegional(reg, T, gate, val);
  const yearsOk = r.coverage.years_valid >= Math.max(r.params.min_valid_years_abs, r.params.min_valid_years_frac * r.coverage.years_total);
  const synthetic = !!cl.synthetic;
  const checklist = [
    { text: val.results_run && val.results_run.placeholder ? "Validation checks passed (PLACEHOLDER results in this fixture)" : "Validation checks passed for the regional test", ok: !!gate.regional_verdict_enabled },
    { text: "Result is stable under the coverage and block-length checks (a sensitivity check, not independent validation)", ok: !!(r.sensitivity && r.sensitivity.stable) },
    { text: `Enough valid years: ${r.coverage.years_valid} of ${r.coverage.years_total}`, ok: yearsOk },
    synthetic ? { text: "Synthetic test case: not registered", ok: false } : { text: REG_SHORT, ok: true, link: ["#/method/registration", "Read what changed and when"] },
    { text: "Map flags are counted in the claimed direction only", ok: true },
  ];
  const Fd = r.finding || {}, ch = Fd.change_per_decade || {};
  const periodText = `${seasonName(cl.season_months)}, ${cl.period[0]} to ${cl.period[1]}`;
  const iv = R_.interval;
  const finding = {
    place: cl.region_name, variable: chem(cl.variable), period: periodText,
    change_per_decade: { value: T.sen.slope_per_decade, unit: cl.units + " per decade", text: `${T.sen.slope_per_decade >= 0 ? "+" : "−"}${Math.abs(T.sen.slope_per_decade).toFixed(2)} ${cl.units} per decade (Sen slope)` },
    interval: iv ? { lo: iv.lo, hi: iv.hi, level: iv.level, label: iv.label, meaning: ch.interval_meaning || "How often such intervals contain the true slope was measured on synthetic series. It is not an interval for individual years." } : null,
    test: R_.test,
    product: cl.product, not_supported: Fd.not_supported || null,
    // The bundle's own sentence calls the headline "the one regional test registered", which is not accurate after the two method amendments. Show the accurate version.
    selection_disclosure: synthetic ? (Fd.selection_disclosure || null) : REG_SHORT + " The region, season and period were fixed in the registration and not changed after looking at results. The regional test shown is the one chosen by simulation on synthetic data (see the Method page), not the Hamed-Rao test originally registered.",
    scope_text: Fd.scope_text || null,
    run_id: r.run.run_id, ledger_ref: Fd.ledger_ref || null,
  };
  const noMask = r.coverage.n_support_cells != null && r.coverage.n_support_cells === r.coverage.n_cells_grid;
  const dataset = (/\(([^)]+)\)/.exec(cl.variable) || [null, cl.variable])[1].replace(/\s+via\s+.*$/i, "").split(",")[0];
  const scoped = v.branch === "withheld" ? lbl : `${lbl} for ${dataset} in this box, ${cl.period[0]}–${cl.period[1]}`;
  return {
    id: cl.claim_id, claim_text: chem(cl.claim_text.replace(/\.$/, "")), direction: cl.direction, synthetic,
    variable: { key: cl.variable, name: chem(cl.variable.charAt(0).toUpperCase() + cl.variable.slice(1)), short: chem(cl.variable), unit: cl.units, plain: chem(cl.variable_plain) },
    product: cl.product, region: { name: cl.region_name, box: { s: cl.region_box.lat_min, n: cl.region_box.lat_max, w: cl.region_box.lon_min, e: cl.region_box.lon_max }, note: noMask ? "This region is a rectangle of latitude and longitude. It includes ocean and other water cells, and no land mask was applied." : null },
    season: seasonName(cl.season_months), period: { start: cl.period[0], end: cl.period[1], n: cl.period[1] - cl.period[0] + 1 },
    data_kind: cl.is_model_data ? "model_reanalysis" : "satellite_observation",
    grid: { lat: g.lat, lon: g.lon, n_lat: g.ny, n_lon: g.nx, dlat: g.lat.length > 1 ? g.lat[1] - g.lat[0] : 1, dlon: g.lon.length > 1 ? g.lon[1] - g.lon[0] : 1 },
    phi_hat: val.claim_phi_hat != null ? val.claim_phi_hat : null,
    cell_slope_per_decade: F.slope_per_decade.map((x, i) => F.valid[i] ? x : null),
    ladder, cell_test_name: cellTest, cell_test_key: cells.cell_test, cells_mode: cells.cells_mode || "bh_flags", bh_q: r.params.bh_q, alpha: r.params.alpha, thresholds: { breadth: r.params.breadth_min, local: r.params.local_min },
    regional: {
      years: reg.years, anomaly: reg.anomaly, band_lo: R_.band ? R_.band.lo : null, band_hi: R_.band ? R_.band.hi : null, band_meaning: (R_.band && R_.band.meaning) || BAND_MEANING, units: reg.units, baseline: `${reg.baseline_mean.toFixed(2).replace(/^-/, "−")} ${String(reg.units).replace("degC", "°C").replace(/^1 \(unitless\)$/, "AOD (unitless)").replace(/1e15 molecules\/cm2/g, "×10¹⁵ molecules/cm²")}`,
      sen_line: reg.sen_line, test: R_.test, interval: iv, ctx: R_.ctx,
      sen: { slope_per_decade: T.sen.slope_per_decade, intercept: T.sen.intercept },
      ols: { slope_per_decade: T.ols.slope_per_decade, ci_lo: T.ols.ci_per_decade[0], ci_hi: T.ols.ci_per_decade[1], p: T.ols.p, t: T.ols.t },
    },
    display: displayTexts(val, iv), conservative: gate.conservative_flags || [], supersedes: (r.run && r.run.supersedes) || [],
    gate: { regional: !!gate.regional_verdict_enabled, interval: !!gate.interval_enabled && !!iv, cells: !!gate.cells_enabled, reasons: gate.reasons_blocking_verdict || gate.reasons || [], reasons_interval: gate.reasons_interval || [], adaptive_notes: gate.adaptive_notes || [] },
    verdict: { id: v.id || v.branch, branch: v.branch, label: lbl, scoped, tone, headline: sentences[0], sentences: sentences.slice(1), checklist, withheld_reasons: v.withheld_reasons || [] },
    finding, method_notes: r.method_notes, sensitivity: r.sensitivity, coverage: r.coverage,
  };
}

// Placeholder claims (view shape already, older fields): fill the new fields so every view can read one shape.
function legacyAdapt(c) {
  const r = c.regional || {}, sen = r.sen || {}, hr = r.mk_hr || {};
  if (!r.test) r.test = { method: "placeholder", name: "Hamed-Rao (placeholder)", title: "Mann-Kendall with Hamed-Rao correction (placeholder)", label: "PLACEHOLDER test", p: hr.p_hamed_rao, z: hr.z, factor: hr.vif, significant: hr.p_hamed_rao < 0.05, alpha: 0.05 };
  if (!("interval" in r)) r.interval = Number.isFinite(sen.ci_lo) ? { lo: sen.ci_lo, hi: sen.ci_hi, level: sen.ci_level || 0.95, method: "placeholder", label: "95% interval (PLACEHOLDER)" } : null;
  if (!r.ctx) r.ctx = { hr: { p: hr.p_hamed_rao, factor: hr.vif }, raw: { p: hr.p_independent } };
  if (!r.band_meaning) r.band_meaning = r.band_method || BAND_MEANING;
  if (c.finding && !("test" in c.finding)) c.finding.test = r.test;
  if (c.finding && c.finding.interval && !c.finding.interval.label) c.finding.interval.label = "95% interval (PLACEHOLDER)";
  if (c.verdict && !c.verdict.scoped) c.verdict.scoped = c.verdict.label;
  for (const q of c.ladder || []) { if (q.cell_frac_claimed == null) { q.cell_frac_claimed = q.n_cells ? q.n_flagged_claimed / q.n_cells : 0; q.cell_frac_any = q.n_cells ? q.n_flagged_any / q.n_cells : 0; } }
  c.cells_mode = c.cells_mode || "bh_flags"; c.bh_q = c.bh_q || 0.1; c.alpha = c.alpha || 0.05; c.thresholds = c.thresholds || { breadth: 0.25, local: 0.05 };
  return c;
}

export const claimById = (b, id) => b.claims.find(c => c.id === id);
// 1 flagged increase, -1 flagged decrease, 0 not flagged, null no data
export function categoryCounts(flags) {
  let up = 0, down = 0, nf = 0, nd = 0;
  for (const v of flags) { if (v == null) nd++; else if (v > 0) up++; else if (v < 0) down++; else nf++; }
  return { up, down, nf, nd, n: up + down + nf };
}
