// Investigate a question (exploratory analysis). A 240px step rail and one task area; the result sits beside the record once it exists.
// Steps are the author's five (challenge video): choose the evidence, name the place, set the period, examine the record, put it on trial.
import { h, boxStr, signed, fmtNum, fmtP, announce, download, reducedMotion, U } from "../util.js";
import { worldMap } from "../worldmap.js";
import { fetchMonthly, validateBox, planBox } from "../live.js";
import { analyzeRows, stepInfo, detectiveVerdict, STATS_VERSION } from "../stats.js";
import { trendChart } from "../chart.js";
import { disc } from "./common.js";
import { groupVariables } from "./pages.js";
import { pWords, trendWords, stepWords, sigClass, sigLabel, ALPHA, fixVerdict, PERSISTENCE_CAVEAT, INTERVAL_EXPLORATORY } from "../words.js";

const LAST_YEAR = 2025, DEMO_TIMEOUT_MS = 25000;
const state = { varKey: "t2m", presetKey: "wisconsin", box: null, y0: 1981, y1: 2025, season: "all", view: "values", step: 1, visited: new Set([1]), status: "idle", err: "", result: null, last: null };

const STEPS = [
  { n: 1, name: "Choose the evidence", short: "Evidence", why: "Pick the NASA Earth measurement to investigate.", cta: "Continue: choose a place" },
  { n: 2, name: "Name the place", short: "Place", why: "Start from a preset, draw a box on the map, or type the edges. A box about the size of a state or small country works well.", cta: "Continue: set the period" },
  { n: 3, name: "Set the period", short: "Period", why: "Years, and a season if you want one. Twenty-five years or more is a better start; ten years or fewer can show a trend by chance alone.", cta: "Continue: examine the record" },
  { n: 4, name: "Examine the record", short: "Record", why: "Each dot is the average for your chosen season in one year. Does the pattern climb or fall, or does it wander?", cta: "Continue: put it on trial" },
  { n: 5, name: "Put it on trial", short: "Trial", why: "Does the answer hold up when we change one thing at a time? We report what happened, whichever way the p-value moves." },
];
// How each variable reads inside the question "Has ___ over ___ changed?"
const PHRASE = { t2m: "air temperature", t2m_max: "the daily high temperature", t2m_min: "the daily low temperature", precip: "rainfall", solar: "sunlight reaching the ground", cloud: "cloud cover", rh: "humidity", wind: "wind speed", soil_root: "root-zone soil wetness", soil_top: "surface soil wetness", frost: "the number of frost days", snow: "snow depth" };
const PLACE = { world: "the whole world", amazon: "the Amazon basin", sus: "the Southeastern United States" };

export function detective(cat, bundle) {
  const caseIds = new Set(((bundle && bundle.claims) || []).map(c => c.id));
  const V = cat.variables, P = cat.presets, S = cat.seasons;
  if (!state.box) state.box = { ...P.find(p => p.key === state.presetKey).box };
  const root = h("div", {});
  const curVar = () => V.find(v => v.key === state.varKey);
  const curSeason = () => S.find(x => x.key === state.season);
  const placeName = () => { const p = P.find(q => q.key === state.presetKey && JSON.stringify(q.box) === JSON.stringify(state.box)); return p ? (PLACE[p.key] || p.name.replace(/\s*\(.*\)$/, "")) : "the box " + boxStr(state.box); };
  let runId = 0, prog = null, demo = null, stepsOpen = false; // demo: { d, k }

  // ======================================================== header: the question, filling in as choices are made
  const slot = txt => h("span", { class: "slot" }, txt);
  const head = h("header", { class: "inv-head" });
  function drawHeader() {
    const v = curVar(), se = curSeason();
    head.replaceChildren(
      h("div", { class: "chips" }, h("span", { class: "chip brass" }, "Exploratory analysis"), h("span", { class: "chip" }, "Computed live in your browser")),
      h("h1", { id: "page-title", tabindex: "-1" }, "Investigate a question"),
      h("p", { class: "question" }, "Has ", slot(PHRASE[v.key] || v.name.toLowerCase()), " over ", slot(placeName()), " changed from ", slot(String(state.y0)), " to ", slot(String(state.y1)), se.key === "all" ? "" : [", ", slot(se.name.split(" (")[0].toLowerCase()), " only"], "?"));
    document.title = "Investigate a question · Climate Claim on Trial";
  }

  // ======================================================== step rail
  const rail = h("section", { class: "steps", "aria-label": "Steps" });
  function stepSummary(n) {
    const L = state.last;
    if (n === 1) return curVar().name;
    if (n === 2) return placeName();
    if (n === 3) return `${state.y0}–${state.y1}` + (state.season === "all" ? "" : ", " + curSeason().name.split(" (")[0].toLowerCase());
    if (!L || L.W.tooShort) return n === 4 ? "Not examined yet" : "Not tried yet";
    if (n === 4) return `Sen ${signed(L.W.A_raw.sen.slopePerDecade, 2)} ${U(L.R.v.units)} per decade`;
    return `p ${fmtP(L.W.A_an.mk.p)} after the trial`;
  }
  function stepState(n) {
    if (n === state.step) return "current";
    if (!state.visited.has(n)) return "next";
    if (n >= 4 && !(state.last && !state.last.W.tooShort)) return "next";
    return "done";
  }
  function drawRail() {
    const cur = STEPS[state.step - 1];
    rail.setAttribute("data-open", String(stepsOpen));
    rail.replaceChildren(
      h("button", { type: "button", class: "steps-toggle", id: "steps-toggle", "aria-expanded": String(stepsOpen), "aria-controls": "steps-list", onclick: () => { stepsOpen = !stepsOpen; drawRail(); document.getElementById("steps-toggle")?.focus(); } },
        h("span", {}, `Step ${state.step} of 5`, h("span", { class: "tg-sub" }, cur.name))),
      h("ol", { class: "steps-list", id: "steps-list" }, STEPS.map(st => {
        const ss = stepState(st.n);
        return h("li", {}, h("button", { type: "button", class: "step-item", "aria-current": ss === "current" ? "step" : null, "data-state": ss, onclick: () => { stepsOpen = false; demo ? goDemo(st.n >= 5 ? 6 : st.n) : goStep(st.n); } },
          h("span", { class: "step-dot", "aria-hidden": "true" }, ss === "done" ? "✓" : String(st.n)),
          h("span", {}, h("span", { class: "step-name" }, st.name, h("span", { class: "sr-only" }, ss === "done" ? " (done)" : ss === "current" ? " (current step)" : "")), h("span", { class: "step-sum" }, stepSummary(st.n)))));
      })),
      h("p", { class: "steps-note" }, "Your own exploration, not pre-registered. Nothing is saved or sent."));
  }

  // ======================================================== step 1: grouped measurement picker (radio rows) and one definition panel
  const defPanel = h("div", { class: "defpanel", "aria-live": "polite" });
  function drawDef() {
    const v = curVar();
    defPanel.replaceChildren(h("h3", {}, v.name), h("p", { style: "margin:0" }, v.one_line),
      h("dl", {}, h("dt", {}, "Unit"), h("dd", {}, U(v.units)), h("dt", {}, "Record"), h("dd", {}, `from ${v.since}`), h("dt", {}, "Kind"), h("dd", {}, h("span", { class: "chip" }, v.kind === "model_reanalysis" ? "Model-based data" : "Satellite observation")), h("dt", {}, "Source"), h("dd", {}, v.source)),
      v.kind === "model_reanalysis" ? h("p", { class: "note", style: "margin:12px 0 0" }, "A computer model blended many measurements to fill the whole map. It is useful for trends but is not a direct measurement.") : null);
  }
  const aod = V.find(v => v.live === false && caseIds.has(v.case_id));
  function pickerNode() {
    const groups = groupVariables(cat).map(g => h("fieldset", { class: "pick-group" }, h("legend", {}, g.name), ...g.items.map(v =>
      h("label", { class: "pick-row" }, h("input", { type: "radio", name: "variable", value: v.key, checked: v.key === state.varKey, onchange: () => { state.varKey = v.key; clampYears(); drawDef(); invalidate(); } }),
        h("span", { class: "pr" }, h("span", { class: "pr-name" }, v.name), h("span", { class: "pr-unit" }, U(v.units)))))));
    return h("div", { class: "pick" }, h("div", {}, ...groups, aod ? h("p", { class: "other-case" }, `${aod.name} is a registered case, not a live measurement. `, h("a", { href: aod.case_link }, "Open case " + aod.case_id)) : null), defPanel);
  }
  function invalidate() { runId++; state.visited.delete(4); state.visited.delete(5); state.result = null; state.last = null; state.status = "idle"; refresh(); }

  // ======================================================== step 2: region picker (built once, re-attached)
  const presetPills = h("div", { class: "pills", role: "radiogroup", "aria-label": "Preset regions" });
  const inputs = {}, err = h("p", { class: "small", style: "color:var(--bad);min-height:1.4em;margin:0", role: "alert" });
  const boxRow = h("div", { class: "boxrow" }, ...[["n", "North edge (latitude)"], ["s", "South edge (latitude)"], ["w", "West edge (longitude)"], ["e", "East edge (longitude)"]].map(([k, lab]) => {
    const i = h("input", { type: "number", step: "0.5", id: "box-" + k, value: state.box[k], onchange: () => setBox({ ...state.box, [k]: parseFloat(i.value) }, true) });
    inputs[k] = i; return h("label", { for: "box-" + k }, lab, i);
  }));
  const wm = worldMap({ box: state.box, onChange: b => { state.presetKey = "custom"; setBox(b); } });
  const boxLabel = h("p", { class: "muted small", style: "margin:8px 0" }), planNote = h("div", { class: "small", "aria-live": "polite" });
  function drawPresets() {
    const match = P.find(p => JSON.stringify(p.box) === JSON.stringify(state.box));
    presetPills.replaceChildren(...P.filter(p => p.key !== "world").map(p => h("label", {}, h("input", { type: "radio", name: "preset", value: p.key, checked: !!match && match.key === p.key, onchange: () => { state.presetKey = p.key; setBox({ ...p.box }); } }), h("span", {}, p.name.replace(/\s*\(.*\)$/, "")))));
  }
  function setBox(b, fromInput, quiet) {
    const errs = validateBox(b); err.textContent = errs.join(" ");
    if (!errs.length) { state.box = b; wm.setBox(b); }
    for (const k of "nswe") if (!fromInput || errs.length === 0) inputs[k].value = state.box[k];
    const match = P.find(p => JSON.stringify(p.box) === JSON.stringify(state.box)); if (match) state.presetKey = match.key; else state.presetKey = "custom";
    drawPresets();
    boxLabel.textContent = "Selected: " + boxStr(state.box);
    if (!validateBox(state.box).length) {
      const pl = planBox(state.box); planNote.replaceChildren(h("p", { class: pl.kind === "regional" ? "muted" : "callout" }, pl.message));
      if (pl.kind === "too_big") planNote.append(h("div", { class: "actions" }, h("button", { class: "btn-quiet", type: "button", onclick: () => setBox({ ...pl.alt }) }, `Use the largest allowed box (${boxStr(pl.alt)})`)));
    } else planNote.replaceChildren();
    if (!quiet && (!fromInput || !errs.length)) invalidate();
  }

  // ======================================================== step 3: period
  function clampYears() { const v = curVar(); state.y0 = Math.max(state.y0, v.since); if (state.y1 < state.y0) state.y1 = state.y0; }
  function periodBody() {
    const v = curVar(), warn = h("p", { class: "small muted", id: "period-note", style: "margin:0 0 8px" });
    const upd = () => { const n = state.y1 - state.y0 + 1; warn.textContent = n < 10 ? `That is ${n} years. Short records make trend tests weak.` : `${n} years selected.`; };
    const y0 = h("input", { type: "number", id: "y0", min: v.since, max: LAST_YEAR, value: state.y0, onchange: e => { state.y0 = Math.min(LAST_YEAR, Math.max(v.since, +e.target.value || v.since)); e.target.value = state.y0; upd(); invalidate(); } });
    const y1 = h("input", { type: "number", id: "y1", min: v.since, max: LAST_YEAR, value: state.y1, onchange: e => { state.y1 = Math.min(LAST_YEAR, Math.max(v.since, +e.target.value || LAST_YEAR)); e.target.value = state.y1; upd(); invalidate(); } });
    const quick = (label, a, b) => h("button", { class: "btn-quiet", type: "button", onclick: () => { state.y0 = Math.max(v.since, a); state.y1 = b; y0.value = state.y0; y1.value = state.y1; upd(); invalidate(); } }, label);
    const seasons = h("div", { class: "pills", role: "radiogroup", "aria-label": "Season" }, S.map(x => h("label", {}, h("input", { type: "radio", name: "season", value: x.key, checked: x.key === state.season, onchange: () => { state.season = x.key; invalidate(); } }), h("span", {}, x.name))));
    upd();
    return [h("div", { class: "boxrow", style: "max-width:24rem" }, h("label", { for: "y0" }, "First year", y0), h("label", { for: "y1" }, "Last year", y1)),
      h("div", { class: "actions", style: "gap:8px;margin-bottom:8px" }, quick(`Full record (from ${v.since})`, v.since, LAST_YEAR), quick("Last 30 years", LAST_YEAR - 29, LAST_YEAR)), warn,
      h("h3", { style: "margin-top:24px" }, "Season (optional)"), seasons, h("p", { class: "muted small", style: "margin-top:8px" }, `${v.name} is available from ${v.since}. A season keeps only those months each year.`)];
  }

  // ======================================================== running the fetch and the tests
  // Guided examples try NASA POWER live first; if that fails or takes too long, they use a saved copy of the same request (data/demo_cache/), clearly labelled.
  async function fetchOrCache(args) {
    if (!demo) return fetchMonthly(args);
    const d = demo.d, preset = P.find(q => q.key === d.preset), same = args.variable.key === d.varKey && preset && JSON.stringify(preset.box) === JSON.stringify(args.box) && args.startYear === 1981 && args.endYear === 2025;
    try { return await Promise.race([fetchMonthly(args), new Promise((_, rej) => setTimeout(() => rej(new Error("NASA POWER took too long.")), DEMO_TIMEOUT_MS))]); }
    catch (e) {
      if (!same) throw e;
      let c; try { const r = await fetch(`data/demo_cache/${d.id}.json`); if (!r.ok) throw new Error("no cache"); c = await r.json(); } catch (e2) { throw e; }
      if (args.onProgress) args.onProgress({ done: 1, total: 1 });
      const rows = c.rows.map(([year, month, value]) => ({ year, month, value }));
      return { stub: false, source: args.variable.source, units: c.units, rows, note: c.note, method: c.method, n_tiles: c.n_tiles, n_cells: c.n_cells, first_year: c.first_year, last_year: c.last_year, cached: true, cachedLabel: `The live NASA POWER request did not work just now, so this example shows the identical request, saved on ${c.fetched_label}, 2026. Live data is tried first every time.` };
    }
  }
  const cachedBadge = R => R && R.data && R.data.cached ? h("p", { class: "callout", role: "note" }, h("b", {}, "Cached copy from Nov 14. "), R.data.cachedLabel) : null;
  async function run() {
    const errs = validateBox(state.box);
    if (errs.length) { state.status = "error"; state.err = errs.join(" "); return false; }
    const v = curVar(), season = curSeason(), my = ++runId;
    if (planBox(state.box).kind === "too_big") { state.status = "error"; state.err = planBox(state.box).message; return false; }
    state.status = "loading"; state.err = "";
    const bar = h("progress", { max: 1, value: 0, "aria-label": "Download progress" }), cap = h("p", { class: "muted small", style: "margin:8px 0 0" }, "Contacting NASA POWER.");
    prog = { bar, cap, name: v.name.toLowerCase() }; drawPanel();
    try {
      const data = await fetchOrCache({ variable: v, box: state.box, startYear: state.y0, endYear: state.y1, onProgress: ({ done, total }) => { if (my !== runId) return; bar.value = total ? done / total : 0; cap.textContent = `${done} of ${total} request${total === 1 ? "" : "s"} done.`; } });
      if (my !== runId) return false; // the user changed a choice while the data was coming
      const rows = data.rows.filter(r => season.months.includes(r.month));
      if (rows.length < 8) { state.status = "error"; state.err = "Too few values to test. Choose a longer period or more months."; return false; }
      const R = { v, season, data, rows, box: { ...state.box }, y0: state.y0, y1: state.y1 };
      state.result = R; state.last = analyze(R); state.status = "ready";
      announce("Results ready. " + (state.last.W.tooShort ? "Too few years to test." : "Interim ruling: " + (state.last.rungs[0].p < ALPHA ? "significant at 0.05." : "not significant at 0.05.")));
      return true;
    } catch (e) {
      if (my !== runId) return false;
      state.status = "error"; state.err = "Could not get the series. " + (e && e.message || e); return false;
    }
  }
  function analyze(R) {
    const W = analyzeRows(R.data.rows, { months: R.season.months, y0: R.y0, y1: R.y1, units: R.v.units });
    if (W.tooShort) return { W, R };
    const corr = stepInfo("autocorr", W.A_an.mk), corrBase = stepInfo("autocorr");
    const rungs = [
      { n: 1, ...stepInfo("raw"), p: W.A_raw.mkIndependent.p, slope: W.A_raw.sen.slopePerDecade },
      { n: 2, ...stepInfo("anomaly"), p: W.A_an.mkIndependent.p, slope: W.A_an.sen.slopePerDecade },
      { n: 3, ...corr, title: corrBase.name, method: corr.name, extra: `Variance factor ${W.A_an.mk.hrFactor.toFixed(2)}`, p: W.A_an.mk.p, slope: W.A_an.sen.slopePerDecade },
    ];
    return { W, R, rungs };
  }

  // ======================================================== the task area (current step)
  const panel = h("section", { class: "task", "aria-labelledby": "panel-h" });
  const taskHead = n => { const st = STEPS[n - 1]; return h("div", { class: "task-head" }, h("p", { class: "stepline" }, `Step ${n} of 5`), h("h2", { id: "panel-h", tabindex: "-1" }, st.name), h("p", {}, st.why)); };
  const bar = (...kids) => h("div", { class: "continue-bar" }, ...kids);
  const back = n => h("button", { class: "btn-quiet", type: "button", onclick: () => demo ? goDemo(n) : goStep(n) }, "Back");
  const next = n => h("button", { class: "btn", type: "button", onclick: () => demo ? goDemo(n === 5 ? 6 : n) : goStep(n) }, STEPS[n - 2].cta);
  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v num" }, val), h("div", { class: "s" }, sub));

  function drawPanel() {
    const n = state.step, L = state.last;
    if (n === 1) { drawDef(); panel.replaceChildren(taskHead(1), pickerNode(), bar(next(2))); }
    else if (n === 2) panel.replaceChildren(taskHead(2),
      presetPills, h("div", { style: "margin-top:16px" }, wm.node),
      h("p", { class: "muted small", style: "margin:8px 0 0" }, "Drag on the map to draw a box. Live requests to NASA POWER are limited to regional boxes of about 40 by 50 degrees, so the whole world is not supported here."),
      boxLabel, planNote, h("details", { class: "quiet", open: window.matchMedia("(max-width: 40rem)").matches }, h("summary", {}, "Type the four edges instead"), boxRow, err), bar(back(1), next(3)));
    else if (n === 3) panel.replaceChildren(taskHead(3), ...periodBody(), bar(back(2), next(4)));
    else if (state.status === "loading") panel.replaceChildren(taskHead(n), h("div", { class: "loadbox", role: "status" }, h("h3", {}, "Getting " + prog.name + " from NASA POWER"), prog.bar, prog.cap, h("p", { class: "muted small" }, "Your choices are kept. Long records over big boxes can take a few seconds."),
      h("button", { class: "btn-quiet", type: "button", onclick: () => { runId++; state.status = "idle"; goStep(3); } }, "Cancel")));
    else if (state.status === "error" || !L) panel.replaceChildren(taskHead(n), h("div", { class: "state failed", role: "alert" }, h("h3", {}, "We could not get the series"), h("p", {}, state.err || "No series yet."), h("p", { class: "muted small" }, "Your measurement, place and period are kept. Try again, or change the place or the period.")),
      bar(back(3), h("button", { class: "btn", type: "button", onclick: () => goStep(n) }, "Try again")));
    else if (L.W.tooShort) panel.replaceChildren(taskHead(n), h("div", { class: "state" }, h("h3", {}, "Too few years to test"), h("p", {}, fixVerdict(L.W.verdict.text)), h("p", { class: "muted small" }, "Next: choose a longer period, or a season with more months.")), bar(back(3)));
    else if (n === 4) drawRecord(); else drawTrial();
  }

  // The ruling is a compact aside next to the record. The word comes from the same rule as before; the longer reading notes are in a disclosure.
  function rulingLite(L) {
    const { W, R, rungs } = L, A = W.A_an, pRaw = rungs[0].p, pFin = rungs[2].p, final = state.visited.has(5);
    const p = final ? pFin : pRaw, slope = final ? A.sen.slopePerDecade : W.A_raw.sen.slopePerDecade, ci = final ? A.sen.intervalPerDecade : W.A_raw.sen.intervalPerDecade, u = U(R.v.units);
    const sig = p < ALPHA, weak = final && pRaw < ALPHA && !sig, gate = W.gate;
    const label = sig ? "Significant at 0.05" : weak ? "Weakened by the trial" : "Not significant at 0.05", tone = sig ? "ok" : weak ? "warn" : "";
    const lines = [h("p", {}, fixVerdict((final ? A.verdict : detectiveVerdict(pRaw, slope, W.n, R.v.units)).text))];
    if (!final) lines.push(h("p", {}, "This is the first look, before the trial. Put it on trial to see whether it holds up."));
    else if (weak) lines.push(h("p", {}, `At first the trend looked significant (p ${fmtP(pRaw)}). After the trial it no longer clears the 0.05 line (p ${fmtP(pFin)}). A trend can look clearer than it is until tougher questions are asked.`));
    else if (sig && pFin > pRaw * 1.5) lines.push(h("p", {}, `It held up, but less strongly: p went from ${fmtP(pRaw)} to ${fmtP(pFin)} over the three hearings.`));
    else if (sig) lines.push(h("p", {}, `It held up through all three hearings (p ${fmtP(pRaw)} at the start, ${fmtP(pFin)} at the end).`));
    if (Math.abs(p - ALPHA) < 0.0005) lines.push(h("p", { class: "muted small" }, "This p-value is right at the 0.05 line, so treat the result as borderline."));
    if (!sig) lines.push(h("p", { class: "muted small" }, "Inconclusive is a result too. Next: try a longer period or a larger region, and keep a note of every try."));
    lines.push(h("p", { class: "muted" }, trendWords(R.v.name, slope, ci[0], ci[1], u)));
    return h("section", { class: "ruling-lite ruling-fade", "aria-label": "Your result" },
      h("div", { class: "chips" }, h("span", { class: "chip brass" }, "Exploratory analysis"), h("span", { class: "chip" }, final ? "Final, after hearing 3" : "Interim, before the trial"), gate ? h("span", { class: "chip" }, gate.calibrated ? "Test calibrated for this record" : "Not calibrated") : null),
      h("h2", {}, label), h("div", { class: "chips", style: "margin-bottom:12px" }, h("span", { class: "chip " + tone }, `p ${fmtP(p)}`)), ...lines,
      gate && !gate.calibrated ? h("p", { class: "callout", role: "note" }, h("b", {}, "Not calibrated for this record. "), gate.caveat) : null,
      disc("How to read this", h("p", {}, h("b", {}, "Caveat. "), "A trend alone does not say what caused it or what comes next." + (R.v.kind === "model_reanalysis" ? " NASA POWER series for this variable are model-based, so a trend can reflect changes in the data sources as well as the climate." : "")),
        gate ? h("p", { class: "muted small" }, gate.calibrated ? gate.caveat : PERSISTENCE_CAVEAT) : h("p", { class: "muted small" }, PERSISTENCE_CAVEAT),
        h("p", { class: "muted small" }, (gate ? gate.label : "Your own exploration, not pre-registered") + ". The interval is exploratory: it has not passed a coverage check for your series.")));
  }
  function withRuling(main, L) { return h("div", { class: "result-grid" }, h("div", { class: "result-main" }, ...main), rulingLite(L)); }
  const csvBtn = (W, R) => h("button", { class: "btn-quiet", type: "button", onclick: () => download(`investigate_${R.v.key}_${R.y0}-${R.y1}.csv`, "year,season_mean,anomaly\n" + W.years.map((yr, i) => `${yr},${W.raw[i].toFixed(5)},${W.anomaly[i].toFixed(5)}`).join("\n"), "text/csv") }, "Download series (CSV)");

  function drawRecord() {
    const L = state.last, { W, R } = L, season = R.season, u = U(R.v.units), R_ = W.A_raw;
    const showAn = state.view === "anom" && season.key !== "all", y = showAn ? W.anomaly : W.raw, A = showAn ? W.A_an : W.A_raw, ols0 = showAn ? W.olsInterceptAn : W.olsIntercept;
    const senLine = W.years.map(t => A.mk.intercept + A.mk.slope * t), olsLine = W.years.map(t => ols0 + A.ols.slope * t);
    const chart = trendChart({
      x: W.years, y, units: u, band: null, ptR: 3.4, fmtX: v2 => String(v2), xTickStep: W.years.length > 30 ? 10 : 5,
      lines: [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: senLine }, { label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: olsLine }],
      yLabel: (showAn ? "Anomaly: " : "") + `${R.v.name} (${u})`, pointWord: showAn ? "anomaly" : "season mean",
      describe: `${R.v.name}, ${boxStr(R.box)}, ${season.name}, one value per year, ${R.y0} to ${R.y1}. Sen trend ${signed(A.sen.slopePerDecade, 3)} ${u} per decade.`,
      keyItems: [["k-pt", "Season average for one year"], ["k-sen", "Sen trend (robust line)"], ["k-ols", "Least squares line"]],
    });
    const toggle = season.key === "all" ? null
      : h("div", { class: "seg", role: "radiogroup", "aria-label": "Series shown", style: "margin-bottom:12px" }, [["values", "Season mean per year"], ["anom", "Seasonal cycle removed"]].map(([k, l]) =>
        h("label", {}, h("input", { type: "radio", name: "view", value: k, checked: (state.view === "anom") === (k === "anom"), onchange: () => { state.view = k; drawPanel(); document.getElementById("view-" + k)?.focus(); } }), h("span", { id: "view-" + k }, l))));
    panel.replaceChildren(taskHead(4), withRuling([
      cachedBadge(R), h("p", { class: "chart-sub" }, `${W.n} years with a value, ${R.y0}–${R.y1}, ${season.name}. ${R.data.note}`), toggle, h("div", { id: "det-chart" }, chart.node),
      h("p", { class: "slope-label" }, `Sen slope ${signed(A.sen.slopePerDecade, 2)} ${u} per decade; ${INTERVAL_EXPLORATORY} ${signed(A.sen.intervalPerDecade[0], 2)} to ${signed(A.sen.intervalPerDecade[1], 2)}`),
      h("div", { id: "det-test", style: "margin-top:24px" }, h("h3", {}, "Is the trend significant?"),
        h("div", { class: "statgrid" },
          stat("Mann-Kendall test", `p ${fmtP(R_.mkIndependent.p)}`, `${sigLabel(R_.mkIndependent.p)}. Sen slope ${signed(R_.sen.slopePerDecade, 2)} ${u} per decade, 95% range ${signed(R_.sen.intervalPerDecade[0], 2)} to ${signed(R_.sen.intervalPerDecade[1], 2)}`),
          stat("Familiar t-test (least squares)", `p ${fmtP(R_.ols.p)}`, `${sigLabel(R_.ols.p)}. ${signed(R_.ols.slopePerDecade, 2)} ${u} per decade, 95% range ${signed(R_.ols.ciPerDecade[0], 2)} to ${signed(R_.ols.ciPerDecade[1], 2)}`)),
        h("p", { class: "small", style: "margin:12px 0 0" }, pWords(R_.mkIndependent.p)),
        h("p", { class: "muted small" }, "Mann-Kendall asks whether later values tend to be higher or lower than earlier ones, with no straight-line assumption. The t-test is the version most people learn first. They can differ a little. That is normal."),
        h("p", { class: "muted small", style: "margin:0" }, `Statistics: trendtrial ${STATS_VERSION}, checked against the Python reference.`))], L),
      bar(back(3), next(5), csvBtn(W, R)));
  }

  function drawTrial() {
    const L = state.last, { W, R, rungs } = L, u = U(R.v.units);
    const list = h("ol", { class: "trial-list" }, rungs.map((r, i) => {
      const pw = Math.min(1, r.p / 0.2) * 100;
      return h("li", { class: "trial-step" },
        h("div", { class: "trial-step-top" }, h("span", {}, "Hearing " + r.n + " of 3"), h("span", { class: "chip " + sigClass(r.p) }, sigLabel(r.p))),
        h("h3", {}, r.title || r.name), r.method ? h("p", { class: "small", style: "margin:0 0 4px" }, h("b", {}, "Method: "), r.method) : null,
        h("p", { class: "explain" }, r.note, r.extra ? " " + r.extra + "." : ""),
        h("div", { class: "pbar-row" }, h("strong", { class: "num" }, "p " + fmtP(r.p)), h("span", { class: "pbar", "aria-hidden": "true" }, h("i", { style: `width:${pw}%` }), h("em", { style: "left:25%" })), h("span", { class: "delta" }, i ? (Math.abs(r.p - rungs[i - 1].p) < 0.0005 ? "no change" : (r.p > rungs[i - 1].p ? "weaker ↑" : "stronger ↓")) : "baseline")),
        h("p", { class: "small", style: "margin:8px 0 0" }, h("b", {}, "What this step did. "), stepWords(rungs[i - 1], r), ` Sen slope ${signed(r.slope, 2)} ${u} per decade.`));
    }));
    panel.replaceChildren(taskHead(5), withRuling([cachedBadge(R), list, h("p", { class: "note" }, "The short bar marks the 0.05 line: left of it is significant."), h("p", { class: "muted small", style: "margin:0" }, `Statistics: trendtrial ${STATS_VERSION}, checked against the Python reference.`)], L),
      bar(back(4), h("button", { class: "btn", type: "button", onclick: () => { demo = null; drawDemoCard(); goStep(1); } }, "Change a setting and rerun"), csvBtn(W, R),
        h("p", { class: "caution" }, "Every new window, place or season you try is another chance to find a trend by luck. Report every try, not only the one that looks best. ", h("a", { href: "#/cases" }, "See a registered case"))));
  }

  function refresh() { drawHeader(); drawRail(); }

  // ======================================================== navigation
  function goStep(n, quiet) {
    state.step = n; state.visited.add(n);
    const fetching = n >= 4 && !state.last && state.status !== "loading";
    if (!fetching) drawPanel();
    refresh();
    if (!quiet) { document.getElementById("panel-h")?.focus({ preventScroll: true }); keepInView(); }
    if (!fetching) return Promise.resolve(true);
    return run().then(() => { if (state.step === n) { drawPanel(); refresh(); if (!quiet) document.getElementById("panel-h")?.focus({ preventScroll: true }); } return state.status === "ready"; });
  }
  function keepInView() { if (panel.getBoundingClientRect().top < 0) window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY - ((document.querySelector(".top") || {}).offsetHeight || 80) - 8, behavior: reducedMotion() ? "auto" : "smooth" }); }

  // ======================================================== guided examples: drive the same layout
  const DEMOS = [
    { id: "wi", title: "Wisconsin summer air temperature", varKey: "t2m", preset: "wisconsin", y0: 1981, y1: 2025, season: "jja",
      s1: "We start with something familiar: how warm the air is in summer. This is the temperature a weather station reads, about 2 metres up. It comes from a NASA model that blends many measurements, so we call it model-based.",
      s2: "Wisconsin is a good size: big enough to average out a single hot town, small enough that one summer's weather still shows up. The box is a rectangle around the state.",
      s3: "1981 to 2025 is 45 summers. We keep only June, July and August so that winter does not drown out the summer signal. Longer records make a real trend easier to see." },
    { id: "sahel", title: "Sahel wet-season rainfall", varKey: "precip", preset: "sahel", y0: 1981, y1: 2025, season: "jjas",
      s1: "Next, rainfall. Here it means rain and melted snow reaching the ground, averaged per day. Like the air temperature, it is model-based: NASA blends satellite and rain gauge data.",
      s2: "The Sahel is the dry belt south of the Sahara. Its rain comes in one season, so the region is wide: a strip of NASA grid cells averaged together, fetched in five requests.",
      s3: "We keep June to September, the wet season, for 1981 to 2025. Rain swings a lot from year to year, so a long record matters even more here." },
  ];
  const demoHost = h("div", {});
  const DSTEP = [0, 1, 2, 3, 4, 4, 5]; // example part k -> step
  function drawDemoCard() {
    if (!demo) {
      demoHost.replaceChildren(h("details", { class: "quiet guided", id: "demo" }, h("summary", {}, "Try a guided example"),
        h("p", { class: "muted small", style: "margin:8px 0 0;max-width:60ch" }, "We fill in the five steps on real NASA POWER data and you press Continue. If NASA POWER cannot be reached, a clearly labelled saved copy from Nov 14 is used."),
        h("div", { class: "btns" }, DEMOS.map(d => h("button", { class: "btn-quiet", type: "button", onclick: () => startDemo(d) }, d.title)))));
      return;
    }
    const { d, k } = demo, R = state.result, L = state.last, ok = L && !L.W.tooShort;
    const captions = [null, d.s1, d.s2, d.s3,
      () => ok ? `We fetched the data and took the ${R.season.name.split(" (")[0].toLowerCase()} average for each year. Each dot is one year. The blue line is the Sen trend, a robust straight line through the dots: it ${L.W.A_raw.sen.slopePerDecade >= 0 ? "rises" : "falls"} by ${Math.abs(L.W.A_raw.sen.slopePerDecade).toFixed(2)} ${U(R.v.units)} per decade. The dashed line is the ordinary least-squares line most people learn first. Do the dots follow the line, or do they scatter?` : "Fetching the data from NASA POWER.",
      () => ok ? `Now the test. ${fixVerdict(L.W.A_raw.verdict.text)} The Mann-Kendall test gives p ${fmtP(L.W.A_raw.mkIndependent.p)} and the familiar t-test gives p ${fmtP(L.W.A_raw.ols.p)}. They can differ a little. That is normal.` : "",
      () => ok ? `Finally we put the result on trial. Each step changes one thing: ${L.rungs.map(r => `step ${r.n} gives p ${fmtP(r.p)}`).join("; ")}. A step can make the result weaker, stronger or leave it alone. That is the whole loop. Now try your own measurement and place.` : ""];
    const total = 6, cap = typeof captions[k] === "function" ? captions[k]() : captions[k];
    const titles = ["", "Step 1: choose the evidence", "Step 2: name the place", "Step 3: set the period", "Step 4: look at the series", "Step 4: test the trend", "Step 5: put it on trial"];
    demoHost.replaceChildren(h("section", { class: "demo-card", id: "demo", "aria-labelledby": "demo-h" },
      h("div", {}, h("p", { class: "eyebrow brass" }, `Guided example: ${d.title}`, R && R.data && R.data.cached ? " · cached copy from Nov 14" : ""), h("h2", { id: "demo-h", tabindex: "-1" }, `${titles[k]} (${k} of ${total})`), h("p", { id: "demo-cap", "aria-live": "polite", class: "demo-cap" }, cap)),
      h("div", { class: "actions" }, h("button", { class: "btn-quiet", type: "button", disabled: k <= 1, onclick: () => goDemo(k - 1) }, "Back"), h("button", { class: "btn", type: "button", disabled: k >= total, onclick: () => goDemo(k + 1) }, k >= total ? "Done" : "Next"), h("button", { class: "btn-quiet", type: "button", onclick: exitDemo }, "Exit example"))));
  }
  function focusDemo(k) {
    document.querySelectorAll(".demo-focus").forEach(e => e.classList.remove("demo-focus"));
    const id = k >= 1 && ["", "panel-h", "panel-h", "panel-h", "det-chart", "det-test", "det-trial"][k]; let el = id && document.getElementById(id);
    if (el && k <= 3) el = panel; if (k === 6) el = panel;
    if (el) { el.classList.add("demo-focus"); if (k >= 4 && k <= 5) el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); }
  }
  async function goDemo(k) {
    demo.k = k; const step = DSTEP[k];
    const L = state.last, ok0 = L && L.R.v.key === demo.d.varKey && L.R.season.key === demo.d.season && L.R.y0 === demo.d.y0;
    drawDemoCard();
    const ok = await goStep(step, true); if (!demo) return;
    if (!ok0 && step >= 4 && !ok) { demo.k = 3; drawDemoCard(); await goStep(3, true); return; }
    drawDemoCard(); focusDemo(k);
    document.getElementById("demo-h")?.focus({ preventScroll: true });
    if (k <= 3) { const w = document.getElementById("demo"); if (w && w.getBoundingClientRect().top < 0) w.scrollIntoView({ block: "start" }); }
  }
  function startDemo(d) {
    demo = { d, k: 1 }; state.view = "values";
    state.varKey = d.varKey; state.y0 = d.y0; state.y1 = d.y1; state.season = d.season;
    setBox({ ...P.find(q => q.key === d.preset).box }); invalidate();
    state.visited = new Set([1]); state.step = 1; drawPanel(); refresh(); drawDemoCard(); focusDemo(1);
    document.getElementById("demo-h")?.focus({ preventScroll: true });
  }
  function exitDemo() { demo = null; document.querySelectorAll(".demo-focus").forEach(e => e.classList.remove("demo-focus")); drawDemoCard(); document.getElementById("demo")?.querySelector("summary")?.focus(); }

  root.append(head, demoHost, h("div", { class: "inv" }, rail, panel));
  setBox(state.box, false, true); drawDemoCard();
  if (state.step >= 4 && !state.last) state.step = 3;
  drawPanel(); refresh();
  return { node: root, title: "Investigate a question" };
}
