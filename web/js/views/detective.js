// Detective mode, "Open a new case": the same Courtroom docket as the case files, filled in live by the user.
// Left: Order of proceedings (the five steps from the challenge author). Middle: one Exhibit panel for the current step.
// Right: The ruling, updated live, and a Detective tip. Header: the question, filling in as choices are made.
import { h, boxStr, signed, fmtP, announce, download, reducedMotion } from "../util.js";
import { worldMap } from "../worldmap.js";
import { fetchMonthly, validateBox, planBox } from "../live.js";
import { analyzeRows, stepInfo, detectiveVerdict, STATS_VERSION } from "../stats.js";
import { trendChart } from "../chart.js";
import { tip, gavelIcon, honestNull } from "./common.js";
import { pWords, trendWords, stepWords, sigClass, sigLabel, ALPHA } from "../words.js";

const LAST_YEAR = 2025;
const state = { varKey: "t2m", presetKey: "wisconsin", box: null, y0: 1981, y1: 2025, season: "all", view: "values", step: 1, visited: new Set([1]), status: "idle", err: "", result: null, last: null };

// Steps are the author's five (challenge video). short = label in the phone stepper.
const STEPS = [
  { n: 1, name: "Choose the evidence", short: "Evidence", why: "Pick the Earth measurement to investigate." },
  { n: 2, name: "Name the place", short: "Place", why: "Draw a box on the map, or start from a preset region." },
  { n: 3, name: "Set the period", short: "Period", why: "Years, and a season if you want one." },
  { n: 4, name: "Examine the record", short: "Record", why: "Plot one value per year and test the trend." },
  { n: 5, name: "Put it on trial", short: "Trial", why: "Three tougher tests, one change each." },
];
const TIPS = [
  null,
  "Start with something you can picture, like the air temperature where you live. “Model-based” means a computer model blended many measurements to fill the whole map.",
  "A box about the size of a state or a small country works well. A tiny box can be jumpy, and a very large one is slow to fetch.",
  "Longer records give the test more to work with. Ten years or fewer can show a trend by chance alone. Twenty-five years or more is a better start.",
  "Each dot is the average for your chosen season in one year. Does the pattern climb or fall over time, or does it wander?",
  "A step that makes the result weaker is not a failure of the method; it is the point. A p-value above 0.05 does not mean there is no trend. It means this record is not clear enough yet.",
];
// How each variable reads inside the question "Has ___ over ___ changed?"
const PHRASE = { t2m: "air temperature", t2m_max: "the daily high temperature", t2m_min: "the daily low temperature", precip: "rainfall", solar: "sunlight reaching the ground", cloud: "cloud cover", rh: "humidity", wind: "wind speed", soil_root: "root-zone soil wetness", soil_top: "surface soil wetness", frost: "the number of frost days", snow: "snow depth" };
const PLACE = { world: "the whole world", amazon: "the Amazon basin", sus: "the Southeastern United States" };

export function detective(cat) {
  const V = cat.variables, P = cat.presets, S = cat.seasons;
  if (!state.box) state.box = { ...P.find(p => p.key === state.presetKey).box };
  const root = h("div", {});
  const curVar = () => V.find(v => v.key === state.varKey);
  const curSeason = () => S.find(x => x.key === state.season);
  const placeName = () => { const p = P.find(q => q.key === state.presetKey && JSON.stringify(q.box) === JSON.stringify(state.box)); return p ? (PLACE[p.key] || p.name.replace(/\s*\(.*\)$/, "")) : "the box " + boxStr(state.box); };
  let runId = 0, prog = null, demo = null; // demo: { d, k }

  // ======================================================== header docket card
  const slot = txt => h("span", { class: "slot" }, txt);
  const headCard = h("section", { class: "case-heading", "aria-labelledby": "page-title" });
  function drawHeader() {
    const v = curVar(), se = curSeason(), srcMain = v.source.split(" (")[0], srcRest = v.source.includes(" (") ? v.source.slice(v.source.indexOf(" (") + 1) : "";
    headCard.replaceChildren(
      h("div", { class: "case-number" }, h("strong", {}, "New"), h("span", {}, "Your docket")),
      h("div", {}, h("p", { class: "eyebrow" }, "Open a new case"),
        h("h1", { id: "page-title", tabindex: "-1" }, "Has ", slot(PHRASE[v.key] || v.name.toLowerCase()), " over ", slot(placeName()), " changed from ", slot(String(state.y0)), " to ", slot(String(state.y1)), se.key === "all" ? "" : [", ", slot(se.name.split(" (")[0].toLowerCase()), " only"], "?"),
        h("p", { class: "definition" }, h("b", {}, v.name + ": "), v.one_line)),
      h("div", { class: "case-meta" }, h("b", {}, srcMain), srcRest, h("br"), `${se.name}`, h("br"), h("span", { class: "muted" }, boxStr(state.box)), h("br"),
        h("span", { class: "chip " + (v.kind === "model_reanalysis" ? "warn" : "neutral") }, v.kind === "model_reanalysis" ? "Model-based data" : "Satellite data")));
    document.title = "Open a new case · Climate Claim on Trial";
  }

  // ======================================================== rail: Order of proceedings
  const rail = h("aside", { class: "hearings stepper", "aria-labelledby": "hearings-h" });
  function stepSummary(n) {
    const L = state.last;
    if (n === 1) return curVar().name;
    if (n === 2) return placeName();
    if (n === 3) return `${state.y0} to ${state.y1}` + (state.season === "all" ? "" : ", " + curSeason().name.split(" (")[0].toLowerCase());
    if (!L || L.W.tooShort) return n === 4 ? "Not examined yet" : "Not tried yet";
    if (n === 4) return `Sen ${signed(L.W.A_raw.sen.slopePerDecade, 2)} ${L.R.v.units} per decade`;
    return `p ${fmtP(L.W.A_an.mk.p)} after the trial`;
  }
  function stepState(n) {
    if (n === state.step) return "current";
    if (!state.visited.has(n)) return "next";
    if (n >= 4 && !(state.last && !state.last.W.tooShort)) return "next";
    return "done";
  }
  function drawRail() {
    const list = h("ol", { class: "hearing-list" }, STEPS.map(st => {
      const ss = stepState(st.n);
      const glyph = ss === "done" ? "✓" : ss === "current" ? "●" : "○", word = ss === "done" ? "Done" : ss === "current" ? "On the bench" : "Next";
      return h("li", {}, h("button", { type: "button", class: "hearing", "aria-current": ss === "current" ? "step" : null, "data-state": ss, onclick: () => demo ? goDemo(st.n >= 5 ? 6 : st.n) : goStep(st.n) },
        h("span", { class: "hearing-top" }, h("span", {}, h("span", { class: "lbl" }, "Step "), String(st.n)), h("span", { class: "status" }, h("span", { class: "st-glyph", "aria-hidden": "true" }, glyph + " "), h("span", { class: "st-text" }, word))),
        h("h3", {}, h("span", { class: "full" }, st.name), h("span", { class: "short", "aria-hidden": "true" }, st.short)), h("p", { class: "explain" }, st.why),
        h("span", { class: "hearing-sum" }, stepSummary(st.n))));
    }));
    rail.replaceChildren(h("div", { class: "hearings-head" }, h("p", { class: "eyebrow" }, "Five steps, one at a time"), h("h2", { id: "hearings-h" }, "Order of proceedings")), list,
      h("p", { class: "hearing-note" }, "Your own exploration, not pre-registered. Every number is computed in this page from NASA POWER data. Nothing is saved or sent."));
  }

  // ======================================================== step 1: variable cards
  const varBox = h("fieldset", { class: "choice" });
  function invalidate() { runId++; state.visited.delete(4); state.visited.delete(5); state.result = null; state.last = null; state.status = "idle"; refresh(); }
  function drawVars() {
    varBox.replaceChildren(h("legend", { class: "sr-only" }, "Variable"), ...V.map(v => v.live === false
      ? h("div", {}, h("div", { class: "off" }, h("strong", {}, v.name), h("span", { class: "muted small", style: "display:block;margin:2px 0 6px" }, v.one_line), h("span", { class: "chip neutral" }, "Case files only"), h("span", { class: "small", style: "display:block;margin-top:6px" }, v.not_live_note + " ", h("a", { href: v.case_link }, "Open case C-D"))))
      : h("label", {}, h("input", { type: "radio", name: "variable", value: v.key, checked: v.key === state.varKey, onchange: () => { state.varKey = v.key; clampYears(); invalidate(); } }),
        h("span", { class: "opt" }, h("strong", {}, v.name), h("span", { class: "muted small", style: "display:block;margin:2px 0 6px" }, v.one_line), h("span", { class: "chip " + (v.kind === "model_reanalysis" ? "warn" : "neutral") }, v.kind === "model_reanalysis" ? "Model-based" : "Satellite observation"), h("span", { class: "muted small", style: "display:block;margin-top:6px" }, `Unit: ${v.units}. Record starts ${v.since}`)))));
  }

  // ======================================================== step 2: region picker (built once, re-attached)
  const presetPills = h("div", { class: "pills", role: "radiogroup", "aria-label": "Preset regions" });
  const inputs = {}, err = h("p", { class: "small", style: "color:var(--bad);min-height:1.4em", role: "alert" });
  const boxRow = h("div", { class: "boxrow" }, ...[["n", "North edge (latitude)"], ["s", "South edge (latitude)"], ["w", "West edge (longitude)"], ["e", "East edge (longitude)"]].map(([k, lab]) => {
    const i = h("input", { type: "number", step: "0.5", id: "box-" + k, value: state.box[k], onchange: () => setBox({ ...state.box, [k]: parseFloat(i.value) }, true) });
    inputs[k] = i; return h("label", { for: "box-" + k }, lab, i);
  }));
  const wm = worldMap({ box: state.box, onChange: b => { state.presetKey = "custom"; setBox(b); } });
  const boxLabel = h("p", { class: "muted small" }), planNote = h("div", { class: "small", "aria-live": "polite" });
  function drawPresets() {
    const match = P.find(p => JSON.stringify(p.box) === JSON.stringify(state.box));
    presetPills.replaceChildren(...P.map(p => h("label", {}, h("input", { type: "radio", name: "preset", value: p.key, checked: !!match && match.key === p.key, onchange: () => { state.presetKey = p.key; setBox({ ...p.box }); } }), h("span", {}, p.name.replace(/\s*\(.*\)$/, "")))));
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
      if (pl.kind === "too_big") planNote.append(h("div", { class: "flow-nav", style: "margin-top:0" }, h("button", { class: "btn-quiet", type: "button", onclick: () => setBox({ ...pl.alt }) }, `Use the largest allowed box (${boxStr(pl.alt)})`), h("span", { class: "muted small", style: "align-self:center" }, "or pick a preset region above")));
    } else planNote.replaceChildren();
    if (!quiet && (!fromInput || !errs.length)) invalidate();
  }

  // ======================================================== step 3: period
  function clampYears() { const v = curVar(); state.y0 = Math.max(state.y0, v.since); if (state.y1 < state.y0) state.y1 = state.y0; }
  function periodBody() {
    const v = curVar(), warn = h("p", { class: "small muted", id: "period-note" });
    const upd = () => { const n = state.y1 - state.y0 + 1; warn.textContent = n < 10 ? `That is ${n} years. Short records make trend tests weak.` : `${n} years selected.`; };
    const y0 = h("input", { type: "number", id: "y0", min: v.since, max: LAST_YEAR, value: state.y0, onchange: e => { state.y0 = Math.min(LAST_YEAR, Math.max(v.since, +e.target.value || v.since)); e.target.value = state.y0; upd(); invalidate(); } });
    const y1 = h("input", { type: "number", id: "y1", min: v.since, max: LAST_YEAR, value: state.y1, onchange: e => { state.y1 = Math.min(LAST_YEAR, Math.max(v.since, +e.target.value || LAST_YEAR)); e.target.value = state.y1; upd(); invalidate(); } });
    const quick = (label, a, b) => h("button", { class: "btn-quiet", type: "button", onclick: () => { state.y0 = Math.max(v.since, a); state.y1 = b; y0.value = state.y0; y1.value = state.y1; upd(); invalidate(); } }, label);
    const seasons = h("div", { class: "pills", role: "radiogroup", "aria-label": "Season" }, S.map(x => h("label", {}, h("input", { type: "radio", name: "season", value: x.key, checked: x.key === state.season, onchange: () => { state.season = x.key; invalidate(); } }), h("span", {}, x.name))));
    upd();
    return [h("div", { class: "boxrow" }, h("label", { for: "y0" }, "First year", y0), h("label", { for: "y1" }, "Last year", y1)),
      h("div", { class: "flow-nav", style: "margin:0 0 6px" }, quick(`Full record (from ${v.since})`, v.since, LAST_YEAR), quick("Last 30 years", LAST_YEAR - 29, LAST_YEAR)), warn,
      h("p", { class: "eyebrow", style: "margin:16px 0 8px" }, "Season (optional)"), seasons, h("p", { class: "muted small", style: "margin-top:8px" }, `${v.name} is available from ${v.since}. A season keeps only those months each year.`)];
  }

  // ======================================================== running the fetch and the tests
  async function run() {
    const errs = validateBox(state.box);
    if (errs.length) { state.status = "error"; state.err = errs.join(" "); return false; }
    const v = curVar(), season = curSeason(), my = ++runId;
    if (planBox(state.box).kind === "too_big") { state.status = "error"; state.err = planBox(state.box).message; return false; }
    state.status = "loading"; state.err = "";
    const bar = h("progress", { max: 1, value: 0, style: "width:100%;height:14px", "aria-label": "Download progress" }), cap = h("p", { class: "muted small" }, "Contacting NASA POWER.");
    prog = { bar, cap, name: v.name.toLowerCase() }; drawPanel();
    try {
      const data = await fetchMonthly({ variable: v, box: state.box, startYear: state.y0, endYear: state.y1, onProgress: ({ done, total }) => { if (my !== runId) return; bar.value = total ? done / total : 0; cap.textContent = `${done} of ${total} request${total === 1 ? "" : "s"} done.`; } });
      if (my !== runId) return false; // the user changed a choice while the data was coming
      const rows = data.rows.filter(r => season.months.includes(r.month));
      if (rows.length < 8) { state.status = "error"; state.err = "Too few values to test. Choose a longer period or more months."; return false; }
      const R = { v, season, data, rows, box: { ...state.box }, y0: state.y0, y1: state.y1 };
      state.result = R; state.last = analyze(R); state.status = "ready";
      announce("Results ready. The ruling has been updated.");
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

  // ======================================================== the Exhibit panel (current step)
  const panel = h("section", { class: "panel exhibit-panel", "aria-labelledby": "panel-h" });
  const head = (eyebrow, title, tag) => h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, eyebrow), h("h2", { id: "panel-h", tabindex: "-1" }, title)), h("span", { class: "tag" }, tag));
  const nav = (...kids) => h("div", { class: "flow-nav" }, ...kids);
  const back = n => h("button", { class: "btn-quiet", type: "button", onclick: () => demo ? goDemo(n) : goStep(n) }, "Back");
  const next = (n, label) => h("button", { class: "btn", type: "button", onclick: () => demo ? goDemo(n === 5 ? 6 : n) : goStep(n) }, label);
  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, val), h("div", { class: "s" }, sub));

  function drawPanel() {
    const n = state.step, L = state.last;
    if (n === 1) panel.replaceChildren(head("Exhibit A", "Choose the evidence", "Step 1 of 5"), h("p", { class: "muted" }, "Each clue is a NASA Earth measurement. Pick one."), varBox, nav(next(2, "Next: name the place")));
    else if (n === 2) panel.replaceChildren(head("Exhibit A", "Name the place", "Step 2 of 5"), h("p", { class: "muted", style: "margin-top:0" }, "Start from a preset, drag a box on the map, or type the edges."),
      h("p", { class: "eyebrow", style: "margin:0 0 8px" }, "Preset regions"), presetPills, h("div", { style: "margin-top:12px" }, wm.node),
      h("p", { class: "muted small", style: "margin:6px 0 0" }, "Drag on the map to draw a box. Boxes are rectangles of latitude and longitude. On a phone, typing the four edges is easier than dragging."), boxRow, err, boxLabel, planNote, nav(back(1), next(3, "Next: set the period")));
    else if (n === 3) panel.replaceChildren(head("Exhibit A", "Set the period", "Step 3 of 5"), ...periodBody(), nav(back(2), next(4, "Examine the record")));
    else if (state.status === "loading") panel.replaceChildren(head(n === 4 ? "Exhibit B" : "Order of hearings", n === 4 ? "The record" : "Put it on trial", `Step ${n} of 5`), h("p", {}, h("b", {}, "Getting " + prog.name + " from NASA POWER.")), prog.bar, prog.cap);
    else if (state.status === "error" || !L) panel.replaceChildren(head(n === 4 ? "Exhibit B" : "Order of hearings", n === 4 ? "The record" : "Put it on trial", `Step ${n} of 5`), h("p", { class: "callout", role: "alert" }, state.err || "No series yet."), nav(back(3), h("button", { class: "btn", type: "button", onclick: () => goStep(n) }, "Try again")));
    else if (L.W.tooShort) panel.replaceChildren(head("Exhibit B", "The record", `Step ${n} of 5`), h("p", { class: "callout" }, L.W.verdict.text), nav(back(3)));
    else if (n === 4) drawRecord(); else drawTrial();
  }

  function drawRecord() {
    const { W, R } = state.last, season = R.season, u = R.v.units, R_ = W.A_raw;
    const showAn = state.view === "anom" && season.key !== "all", y = showAn ? W.anomaly : W.raw, A = showAn ? W.A_an : W.A_raw, ols0 = showAn ? W.olsInterceptAn : W.olsIntercept;
    const senLine = W.years.map(t => A.mk.intercept + A.mk.slope * t), olsLine = W.years.map(t => ols0 + A.ols.slope * t);
    const chart = trendChart({
      x: W.years, y, units: u, band: null, ptR: 3.4, fmtX: v2 => String(v2), xTickStep: W.years.length > 30 ? 10 : 5,
      lines: [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: senLine }, { label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: olsLine }],
      yLabel: (showAn ? "Anomaly: " : "") + `${R.v.name} (${u})`, pointWord: showAn ? "anomaly" : "season mean",
      describe: `${R.v.name}, ${boxStr(R.box)}, ${season.name}, one value per year, ${R.y0} to ${R.y1}. Sen trend ${signed(A.sen.slopePerDecade, 3)} ${u} per decade.`,
      keyItems: [["k-pt", "Season average for one year"], ["k-sen", "Sen trend (robust line)"], ["k-ols", "Ordinary least squares line"]],
    });
    const toggle = season.key === "all" ? h("p", { class: "muted small" }, "You chose the whole year, so the seasonal cycle is already averaged out within each year.")
      : h("div", { class: "seg", role: "radiogroup", "aria-label": "Series shown" }, [["values", "Season mean per year"], ["anom", "Seasonal cycle removed"]].map(([k, l]) =>
        h("label", {}, h("input", { type: "radio", name: "view", value: k, checked: (state.view === "anom") === (k === "anom"), onchange: () => { state.view = k; drawPanel(); document.getElementById("view-" + k)?.focus(); } }), h("span", { id: "view-" + k }, l))));
    const csv = () => download(`detective_${R.v.key}_${R.y0}-${R.y1}.csv`, "year,season_mean,anomaly\n" + W.years.map((yr, i) => `${yr},${W.raw[i].toFixed(5)},${W.anomaly[i].toFixed(5)}`).join("\n"), "text/csv");
    panel.replaceChildren(head("Exhibit B", "The record", "One value per year"),
      h("p", { class: demo ? "muted small" : "muted small", style: "margin:0 0 8px" }, h("b", {}, "About this data. "), R.data.note),
      h("div", { class: "map-summary" }, h("span", {}, `${W.n} years with a value, ${R.y0} to ${R.y1}, ${season.name}`), h("strong", {}, signed(R_.sen.slopePerDecade, 2), " ", h("span", {}, `${u} per decade (Sen)`))),
      toggle, h("div", { style: "margin-top:12px", id: "det-chart" }, chart.node),
      h("p", { class: "slope-label", style: "margin:10px 0 0" }, `Sen slope ${signed(A.sen.slopePerDecade, 2)} ${u} per decade, 95% range ${signed(A.sen.intervalPerDecade[0], 2)} to ${signed(A.sen.intervalPerDecade[1], 2)}`),
      h("div", { id: "det-test", style: "margin-top:22px" }, h("h3", {}, "Is the trend significant?"), h("p", { class: "muted small", style: "margin-top:-.3em" }, "A p-value is the chance of seeing a pattern at least this clear if there were no real trend. Below 0.05 is called significant."),
        h("div", { class: "statgrid" },
          stat("Mann-Kendall test", `p ${fmtP(R_.mkIndependent.p)}`, `${sigLabel(R_.mkIndependent.p)}. Sen slope ${signed(R_.sen.slopePerDecade, 2)} ${u} per decade, 95% range ${signed(R_.sen.intervalPerDecade[0], 2)} to ${signed(R_.sen.intervalPerDecade[1], 2)}`),
          stat("Familiar t-test (least squares)", `p ${fmtP(R_.ols.p)}`, `${sigLabel(R_.ols.p)}. ${signed(R_.ols.slopePerDecade, 2)} ${u} per decade, 95% range ${signed(R_.ols.ciPerDecade[0], 2)} to ${signed(R_.ols.ciPerDecade[1], 2)}`)),
        h("p", { class: "small", style: "margin:12px 0 0" }, pWords(R_.mkIndependent.p)), h("p", { class: "muted small" }, "Mann-Kendall asks whether later values tend to be higher or lower than earlier ones, with no straight-line assumption. The t-test is the version most people learn first. They can differ a little. That is normal.")),
      nav(back(3), next(5, "Put it on trial"), h("button", { class: "btn-quiet", type: "button", onclick: csv }, "Download this series (CSV)")),
      h("p", { class: "muted small", style: "margin:0" }, `Statistics: trendtrial ${STATS_VERSION}, checked against the Python reference.`));
  }

  function drawTrial() {
    const { W, R, rungs } = state.last, u = R.v.units;
    const csv = () => download(`detective_${R.v.key}_${R.y0}-${R.y1}.csv`, "year,season_mean,anomaly\n" + W.years.map((yr, i) => `${yr},${W.raw[i].toFixed(5)},${W.anomaly[i].toFixed(5)}`).join("\n"), "text/csv");
    const list = h("ol", { class: "trial-list" }, rungs.map((r, i) => {
      const pw = Math.min(1, r.p / 0.2) * 100;
      return h("li", { class: "trial-step" },
        h("div", { class: "hearing-top" }, h("span", {}, "Hearing " + r.n + " of 3"), h("span", { class: "chip " + sigClass(r.p) }, sigLabel(r.p))),
        h("h3", {}, r.title || r.name), r.method ? h("p", { class: "small", style: "margin:0 0 4px" }, h("b", {}, "Method: "), r.method) : null,
        h("p", { class: "explain" }, r.note, r.extra ? " " + r.extra + "." : ""),
        h("div", { class: "pbar-row" }, h("strong", {}, "p " + fmtP(r.p)), h("span", { class: "pbar", "aria-hidden": "true" }, h("i", { style: `width:${pw}%` }), h("em", { style: "left:25%" })), h("span", { class: "delta" }, i ? (Math.abs(r.p - rungs[i - 1].p) < 0.0005 ? "no change" : (r.p > rungs[i - 1].p ? "weaker ↑" : "stronger ↓")) : "baseline")),
        h("p", { class: "small", style: "margin:8px 0 0" }, h("b", {}, "What this step did. "), stepWords(rungs[i - 1], r), ` Sen slope ${signed(r.slope, 2)} ${u} per decade.`));
    }));
    panel.replaceChildren(head("Order of hearings", "Put it on trial", "Step 5 of 5"),
      h("p", { class: "muted", style: "margin-top:0" }, "Does the answer survive tougher questions? Each step changes one thing. We report what happened, whichever way the p-value moves. The short bar marks the 0.05 line: left of the line is significant."),
      list,
      nav(back(4), h("button", { class: "btn-quiet", type: "button", onclick: csv }, "Download this series (CSV)"), h("button", { class: "btn-quiet", type: "button", onclick: () => { demo = null; drawDemoCard(); goStep(1); } }, "Open another case"), h("a", { class: "btn-quiet", href: "#/cases" }, "See a registered case file")),
      h("p", { class: "muted small", style: "margin:0" }, `Statistics: trendtrial ${STATS_VERSION}, checked against the Python reference.`));
  }

  // ======================================================== the ruling (right column)
  const ruling = h("section", { class: "panel ruling", role: "status", "aria-labelledby": "ruling-h" });
  const tipBox = h("div", { class: "tip-slot" });
  function drawRuling() {
    const L = state.last, ready = L && !L.W.tooShort;
    const stamp = h("div", { class: "stamp" }, "Your own exploration, not pre-registered");
    const headRow = h("div", { class: "ruling-head" }, h("p", { class: "eyebrow" }, "The ruling"), gavelIcon());
    if (!ready) {
      ruling.replaceChildren(headRow, h("h2", { id: "ruling-h" }, L && L.W.tooShort ? "Too few years" : "No ruling yet"), stamp,
        h("p", {}, L && L.W.tooShort ? L.W.verdict.text : "The ruling appears when you have examined the record. It updates as soon as you put the trend on trial."),
        h("p", { class: "caveat" }, h("b", {}, "How to read it. "), "A p-value below 0.05 is called significant. A p-value above 0.05 does not mean there is no trend, and it does not mean the change is unimportant. A longer record can help."));
    } else {
      const { W, R, rungs } = L, A = W.A_an, pRaw = rungs[0].p, pFin = rungs[2].p, final = state.visited.has(5);
      const p = final ? pFin : pRaw, slope = final ? A.sen.slopePerDecade : W.A_raw.sen.slopePerDecade, ci = final ? A.sen.intervalPerDecade : W.A_raw.sen.intervalPerDecade;
      const sig = p < ALPHA, weak = final && pRaw < ALPHA && !sig;
      const label = sig ? "Significant at 0.05" : weak ? "Weakened by the trial" : "Not significant at 0.05", tone = sig ? "ok" : weak ? "warn" : "neutral";
      const lines = [h("p", {}, h("b", {}, (final ? A.verdict : detectiveVerdict(pRaw, slope, W.n, R.v.units)).text))];
      if (!final) lines.push(h("p", {}, "This is the first look, before the trial. Put it on trial to see whether it holds up under tougher questions."));
      else if (weak) lines.push(h("p", {}, `At first the trend looked significant (p ${fmtP(pRaw)}). After the trial it no longer clears the 0.05 line (p ${fmtP(pFin)}). A trend can look clearer than it is until tougher questions are asked.`));
      else if (sig && pFin > pRaw * 1.5) lines.push(h("p", {}, `It held up, but less strongly: p went from ${fmtP(pRaw)} to ${fmtP(pFin)} over the three hearings.`));
      else if (sig) lines.push(h("p", {}, `It held up through all three hearings (p ${fmtP(pRaw)} at the start, ${fmtP(pFin)} at the end).`));
      if (Math.abs(p - ALPHA) < 0.0005) lines.push(h("p", { class: "muted small" }, "This p-value is right at the 0.05 line, so treat the result as borderline."));
      lines.push(h("p", { class: "muted" }, trendWords(R.v.name, slope, ci[0], ci[1], R.v.units)));
      ruling.replaceChildren(headRow, h("h2", { id: "ruling-h" }, label), h("div", { class: "ruling-chips" }, h("span", { class: "chip " + tone }, `p ${fmtP(p)}`), h("span", { class: "chip neutral" }, final ? "Final, after hearing 3" : "Interim, before the trial")), stamp, ...lines,
        h("p", { class: "caveat" }, h("b", {}, "Caveat. "), "A trend alone does not say what caused it or what comes next." + (R.v.kind === "model_reanalysis" ? " NASA POWER series for this variable are model-based, so a trend can reflect changes in the data sources as well as the climate." : "")),
        h("small", {}, "The 95% range is exploratory and has not been validated for this series."));
    }
    const t = TIPS[state.step]; tipBox.replaceChildren(t ? tip(t) : "");
  }
  const rulingCol = h("div", { class: "ruling-column" }, ruling, tipBox, honestNull());

  function refresh() { drawHeader(); drawRail(); drawRuling(); }

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
  function keepInView() { const w = root.querySelector(".workspace"); if (w && w.getBoundingClientRect().top < 0) window.scrollTo({ top: w.getBoundingClientRect().top + window.scrollY - ((document.querySelector(".top") || {}).offsetHeight || 80) - 8, behavior: reducedMotion() ? "auto" : "smooth" }); }

  // ======================================================== Watch a demo: drives the same layout
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
  const demoBar = h("section", { class: "demo-bar", id: "demo", "aria-labelledby": "demo-h" });
  const DSTEP = [0, 1, 2, 3, 4, 4, 5]; // demo part k -> rail step
  function drawDemoCard() {
    demoBar.classList.toggle("active", !!demo);
    if (!demo) {
      demoBar.replaceChildren(h("div", { class: "demo-intro" }, h("p", { class: "eyebrow brass" }, "New here?"), h("h2", { id: "demo-h", tabindex: "-1" }, "Watch a demo")),
        h("div", { class: "flow-nav", style: "margin:0" }, DEMOS.map(d => h("button", { class: "btn-quiet", type: "button", onclick: () => startDemo(d) }, d.title))),
        h("p", { class: "muted small demo-copy" }, "We fill in the five steps for you, one at a time, on real NASA POWER data, and explain each one in plain words."));
      return;
    }
    const { d, k } = demo, R = state.result, L = state.last, ok = L && !L.W.tooShort;
    const captions = [null, d.s1, d.s2, d.s3,
      () => ok ? `We fetched the data and took the ${R.season.name.split(" (")[0].toLowerCase()} average for each year. Each dot is one year. The brown line is the Sen trend, a robust straight line through the dots: it ${L.W.A_raw.sen.slopePerDecade >= 0 ? "rises" : "falls"} by ${Math.abs(L.W.A_raw.sen.slopePerDecade).toFixed(2)} ${R.v.units} per decade. The dashed line is the ordinary least-squares line most people learn first. Do the dots follow the line, or do they scatter?` : "Fetching the data from NASA POWER.",
      () => ok ? `Now the test. ${L.W.A_raw.verdict.text} The Mann-Kendall test gives p ${fmtP(L.W.A_raw.mkIndependent.p)} and the familiar t-test gives p ${fmtP(L.W.A_raw.ols.p)}. They can differ a little. That is normal.` : "",
      () => ok ? `Finally we put the result on trial. Each step changes one thing: ${L.rungs.map(r => `step ${r.n} gives p ${fmtP(r.p)}`).join("; ")}. A step can make the result weaker, stronger or leave it alone. That is the whole detective loop. Now try your own clue and place.` : ""];
    const total = 6, cap = typeof captions[k] === "function" ? captions[k]() : captions[k];
    const titles = ["", "Step 1: choose the evidence", "Step 2: name the place", "Step 3: set the period", "Step 4: look at the series", "Step 4: test the trend", "Step 5: put it on trial"];
    demoBar.replaceChildren(h("div", {}, h("p", { class: "eyebrow brass" }, `Demo: ${d.title}`), h("h2", { id: "demo-h", tabindex: "-1" }, `${titles[k]} (${k} of ${total})`), h("p", { id: "demo-cap", "aria-live": "polite", class: "demo-cap" }, cap)),
      h("div", { class: "flow-nav demo-nav" }, h("button", { class: "btn-quiet", type: "button", disabled: k <= 1, onclick: () => goDemo(k - 1) }, "Back"), h("button", { class: "btn", type: "button", disabled: k >= total, onclick: () => goDemo(k + 1) }, k >= total ? "Done" : "Next"), h("button", { class: "btn-quiet", type: "button", onclick: exitDemo }, "Exit demo")));
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
    if (k <= 3) { const w = demoBar; if (w.getBoundingClientRect().top < 0) w.scrollIntoView({ block: "start" }); }
  }
  function startDemo(d) {
    demo = { d, k: 1 }; state.view = "values";
    state.varKey = d.varKey; state.y0 = d.y0; state.y1 = d.y1; state.season = d.season;
    drawVars(); setBox({ ...P.find(q => q.key === d.preset).box }); invalidate();
    state.visited = new Set([1]); state.step = 1; drawPanel(); refresh(); drawDemoCard(); focusDemo(1);
    document.getElementById("demo-h")?.focus({ preventScroll: true });
  }
  function exitDemo() { demo = null; document.querySelectorAll(".demo-focus").forEach(e => e.classList.remove("demo-focus")); drawDemoCard(); document.getElementById("demo-h")?.focus(); }

  root.append(
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Detective"),
    demoBar, headCard,
    h("div", { class: "workspace" }, rail, h("div", { class: "exhibits" }, panel), rulingCol));
  drawVars(); setBox(state.box, false, true); drawDemoCard();
  if (state.step >= 4 && !state.last) state.step = 3;
  drawPanel(); refresh();
  return { node: root, title: "Open a new case" };
}
