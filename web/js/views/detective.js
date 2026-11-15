// Investigate a question (exploratory analysis), version 2: ONE screen.
// The question builder (measurement, place, period) is visible all at once; the result (record, trial, ruling) sits directly below and
// updates when an input changes. The author's five steps (choose variable, region, period, examine the series, test significance) are a
// slim progress indicator and the keys of the guided examples; they are never gates.
import { h, boxStr, signed, fmtP, announce, download, reducedMotion, U, minus } from "../util.js";
import { worldMap } from "../worldmap.js";
import { fetchMonthly, validateBox, planBox } from "../live.js";
import { analyzeRows, stepInfo, detectiveVerdict, exploratoryGate, STATS_VERSION } from "../stats.js";
import { trendChart } from "../chart.js";
import { disc, copyButton, WITHHELD_LINE } from "./common.js";
import { monthlyData } from "../viz/monthly.js";
import { groupVariables } from "./pages.js";
import { loadLibrary, libraryPlan, libraryRegional, completeSeasons, isWorld, periodNote, pastQuality, WORLD } from "../library.js";
import { pWords, descPWords, descLabel, trendWords, stepWords, sigClass, sigLabel, ALPHA, fixVerdict, PERSISTENCE_CAVEAT, INTERVAL_EXPLORATORY } from "../words.js";

const LAST_YEAR = 2025, DEMO_TIMEOUT_MS = 25000, DEBOUNCE_MS = 450;
// The two sources, named the same way everywhere. "short" is the label on a row; "full" is the label in the summary and for screen readers.
const SRC = {
  library: { short: "Satellite", full: "Satellite (NASA, precomputed)" },
  power: { short: "Model", full: "Model (NASA POWER, live)" },
};
const endYear = v => (v.goodLast != null ? v.goodLast : v.last); // default end of a period: the last year the product can be trusted for trends
const sinfo = v => v.src === "library" ? { short: v.chipShort, full: v.chip, cls: v.kind === "model_output" ? "power" : "library" } : { ...SRC.power, cls: "power" };
const state = { src: "power", key: "t2m", presetKey: "wisconsin", box: { s: 42.5, n: 47.1, w: -92.9, e: -86.8 }, y0: 1981, y1: 2025, season: "jja", view: "values", chart: "yearly", status: "idle", err: "", result: null, last: null, stale: false };

// The five steps are the challenge author's, in the author's words.
const STEPS = [
  { n: 1, name: "Choose variable", short: "Variable", target: "panel-measure" },
  { n: 2, name: "Pick region", short: "Region", target: "panel-place" },
  { n: 3, name: "Set period", short: "Period", target: "panel-period" },
  { n: 4, name: "Examine the series", short: "Series", target: "result-record" },
  { n: 5, name: "Test significance", short: "Test", target: "result-trial" },
];
// How each measurement reads inside the question "Did ___ over ___ change?"
const PHRASE = { t2m: "air temperature", t2m_max: "the daily high temperature", t2m_min: "the daily low temperature", precip: "rainfall", solar: "sunlight reaching the ground", cloud: "cloud cover", rh: "humidity", wind: "wind speed", soil_root: "root-zone soil wetness", soil_top: "surface soil wetness", frost: "the number of frost days", snow: "snow depth", airs_tair: "surface air temperature (satellite)", airs_h2o: "water vapor in the air", soil_gldas: "soil moisture (model)", et_gldas: "evapotranspiration (model)",
  precip_imerg: "rainfall and snow (satellite)", tws_grace: "water stored on land", lst_day_myd11: "land surface temperature", snow_mod10cm: "snow cover", aod_myd08: "smoke and haze" };
const GROUP_ORDER = [["Temperature", "Temperature"], ["Water", "Water, snow and ice"], ["Sun and sky", "Sun and sky"], ["Wind", "Wind"], ["Air", "Air"]];
// Starting measurements (source, key): plain, familiar, and covering model, satellite and gauge-blended records. The rest sit under "All measurements".
const STARTERS = [["power", "t2m"], ["power", "precip"], ["library", "snow_mod10cm"], ["library", "soil_gldas"], ["library", "no2_omi"], ["library", "aod_myd08"]];
const PLACE = { world: "the whole world", amazon: "the Amazon basin", sus: "the Southeastern United States" };
const POWER_WORLD_NOTE = "Whole world is for the precomputed library measurements. Live NASA POWER requests are limited to regional boxes of about 40 by 50 degrees.";

// Replay links: #/investigate?src=library|power&v=<id or POWER parameter>&b=south,north,west,east&y=2001-2025&s=JJAS  (season = key in data/variables.json).
// The counter of questions tried lives in sessionStorage only: it is per tab, per visit, and never leaves the browser.
const TRIES_KEY = "ccot.tries";
let memTries = [];   // used when session storage is blocked, so the count still works for the life of the page
const store = {
  get() { try { const v = JSON.parse(sessionStorage.getItem(TRIES_KEY) || "[]"); if (Array.isArray(v)) { if (v.length >= memTries.length) memTries = v; return memTries; } } catch (e) { /* blocked */ } return memTries; },
  set(v) { memTries = v; try { sessionStorage.setItem(TRIES_KEY, JSON.stringify(v)); } catch (e) { /* storage blocked: the in-memory list keeps counting */ } },
};
const triesNow = () => store.get().length;
const num4 = x => (Number.isFinite(+x) ? (+x).toFixed(4).replace(/\.?0+$/, "") : String(x));
// One question = one source + variable + numeric box + years + season. Running the same one again (a retry, a revisit, a replay link) is not a new question.
const shareQuery = R => `src=${R.v.src}&v=${R.v.src === "power" ? R.v.power_param : R.v.key}&b=${[R.box.s, R.box.n, R.box.w, R.box.e].map(num4).join(",")}&y=${R.y0}-${R.y1}&s=${R.season.key.toUpperCase()}`;
function noteTry(R) {
  const key = shareQuery(R), seen = store.get();
  if (!seen.includes(key)) store.set([...seen, key]);
}
const shareHash = R => "#/investigate?" + shareQuery(R);
const shareUrl = R => location.origin + location.pathname + location.search + shareHash(R);
function syncUrl(hash) { try { if (location.hash.startsWith("#/investigate") && location.hash !== hash) history.replaceState(null, "", hash); } catch (e) { /* ignore */ } }
const triesText = () => { const n = triesNow(); return `You have tested ${n} distinct question${n === 1 ? "" : "s"} this visit. More tries create more opportunities for false alarms. These questions overlap, so ${n} does not determine an exact false-alarm probability. Keep every attempt, not just the striking one.`; };
const triesLine = () => { const n = triesNow(); if (!n) return null;
  return h("p", { class: "tries", id: "tries" }, triesText()); };

let libVars = null; // the manifest's variables, once read

export function detective(cat, bundle, query = "") {
  const caseIds = new Set(((bundle && bundle.claims) || []).map(c => c.id));
  const P = cat.presets, S = cat.seasons;
  const root = h("div", {});
  let allOpen = false, M = [], runId = 0, prog = null, demo = null, timer = null, pending = false, countNext = false, built = false, ctl = null, holding = false;
  const dataCache = new Map();   // the last downloaded series per measurement and box, so season changes and contained year windows need no new request

  // ======================================================== measurements: the two sources in one list
  function buildMeasures() {
    const pw = new Map(); for (const g of groupVariables(cat)) for (const v of g.items) pw.set(v.key, g.name);
    const power = cat.variables.filter(v => v.live !== false).map(v => ({ ...v, src: "power", last: LAST_YEAR, group: pw.get(v.key) || "Other" }));
    const lib = (libVars || []).map(v => ({ ...v, group: v.group === "Snow and ice" ? "Water" : v.group }));
    M = [...lib, ...power];
  }
  const curVar = () => M.find(v => v.src === state.src && v.key === state.key) || M[0];
  const curSeason = () => S.find(x => x.key === state.season);
  const placeName = () => { const p = P.find(q => JSON.stringify(q.box) === JSON.stringify(state.box)); return p ? (PLACE[p.key] || p.name.replace(/\s*\(.*\)$/, "")) : "the box " + boxStr(state.box); };
  const seasonShort = se => se.key === "jjas" ? "wet season (June to September)" : se.name.split(" (")[0].toLowerCase();
  const sameBox = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ======================================================== replay link: restore the choices from the URL, then rerun
  function parseReplay(q) {
    const p = new URLSearchParams(q);
    if (!["src", "v", "b", "y", "s"].some(k => p.has(k))) return null;
    const bad = [], out = {}, src = p.get("src") === "library" ? "library" : "power", want = (p.get("v") || "").toLowerCase();
    const v = M.find(x => x.src === src && [x.power_param, x.key].some(k => k && k.toLowerCase() === want));
    if (v) { out.v = v; } else bad.push("measurement");
    const e = (p.get("b") || "").split(",").map(Number);
    if (e.length === 4 && e.every(Number.isFinite) && !validateBox({ s: e[0], n: e[1], w: e[2], e: e[3] }).length) out.box = { s: e[0], n: e[1], w: e[2], e: e[3] }; else bad.push("place");
    const y = /^(\d{4})-(\d{4})$/.exec(p.get("y") || "");
    if (y && +y[1] < +y[2] && (!v || (+y[1] >= v.since && +y[2] <= v.last))) { out.y0 = +y[1]; out.y1 = +y[2]; } else bad.push("years");
    const se = S.find(x => x.key.toUpperCase() === (p.get("s") || "").toUpperCase());
    if (se) out.season = se.key; else bad.push("season");
    return { out, bad };
  }

  // ======================================================== header: the question, filling in as choices are made
  const slot = txt => h("span", { class: "slot" }, txt);
  const head = h("header", { class: "inv-head" });
  function drawHeader() {
    const v = curVar(), se = curSeason();
    head.replaceChildren(
      h("div", { class: "chips" }, h("span", { class: "chip brass" }, "Exploratory analysis"), h("span", { class: "chip" }, "Computed live in your browser")),
      h("h1", { id: "page-title", tabindex: "-1" }, "Investigate a question"),
      h("p", { class: "question" }, "Did ", slot(PHRASE[v.key] || v.name.toLowerCase()), " over ", slot(placeName()), " change from ", slot(String(state.y0)), " to ", slot(String(state.y1)), se.key === "all" ? "" : [", ", slot(seasonShort(se)), " only"], "?"));
    document.title = "Investigate a question · Climate Claim on Trial";
  }

  // ======================================================== progress: five steps, a slim indicator (never a gate)
  const progress = h("nav", { class: "progress", "aria-label": "Progress through the five steps" });
  function stepState(n) {
    if (demo && demo.k === n) return "current";
    if (n <= 3) return "done";
    if (state.status === "loading" || pending) return "active";
    if (state.status === "error") return "blocked";
    return state.last ? "done" : "next";
  }
  function stepSummary(n) {
    const L = state.last;
    if (n === 1) return curVar().name;
    if (n === 2) return placeName();
    if (n === 3) return `${state.y0}–${state.y1}` + (state.season === "all" ? "" : ", " + seasonShort(curSeason()));
    if (!L || state.status === "error") return state.status === "error" ? "Could not run" : "Not run yet";
    if (L.W.tooShort) return n === 4 ? "Too few years" : "Cannot test";
    return n === 4 ? `${L.W.n} years` : `p ${fmtP(L.rungs[2].p)} after the trial`;
  }
  function drawProgress() {
    progress.replaceChildren(h("ol", { class: "prog-list" }, STEPS.map(st => {
      const ss = stepState(st.n);
      return h("li", { class: "prog-item", "data-state": ss }, h("button", { type: "button", class: "prog-btn", "aria-current": ss === "current" ? "step" : null, onclick: () => jump(st.target) },
        h("span", { class: "prog-dot", "aria-hidden": "true" }, ss === "done" ? "✓" : String(st.n)),
        h("span", { class: "prog-txt" }, h("span", { class: "prog-name" }, h("span", { class: "prog-full" }, st.name), h("span", { class: "prog-short", "aria-hidden": "true" }, st.short), h("span", { class: "sr-only prog-sronly" }, ss === "done" ? " (done)" : ss === "current" ? " (current example step)" : ss === "active" ? " (working)" : "")), h("span", { class: "prog-sum" }, stepSummary(st.n)))));
    })));
  }
  function jump(id) {
    const el = document.getElementById(id); if (!el) return;
    el.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    const t = el.querySelector("h2,h3"); if (t) t.focus({ preventScroll: true });
  }

  // ======================================================== panel 1: measurement
  const measureBody = h("div", { class: "measure-body" });
  function drawMeasure() {
    const cur = curVar();
    const groups = GROUP_ORDER.map(([key, label]) => ({ label, items: M.filter(v => v.group === key) })).filter(g => g.items.length);
    const rest = M.filter(v => !GROUP_ORDER.some(([k]) => k === v.group)); if (rest.length) groups.push({ label: "Other", items: rest });
    const aod = !M.some(v => v.src === "library" && /aod/i.test(v.key)) ? cat.variables.find(v => v.live === false && caseIds.has(v.case_id)) : null;
    const row = (v, name) => h("label", { class: "pick-row" }, h("input", { type: "radio", name, value: v.src + ":" + v.key, checked: v === cur, onchange: () => setMeasure(v) }),
      h("span", { class: "pr" }, h("span", { class: "pr-name" }, v.name), h("span", { class: "src-chip " + sinfo(v).cls }, sinfo(v).short, h("span", { class: "sr-only" }, ` (${sinfo(v).full})`))));
    // A few clear starting measurements first; the full inventory is one click away. A measurement chosen another way (a replay link, a guided example) opens the full list.
    const starters = STARTERS.map(([src, key]) => M.find(v => v.src === src && v.key === key)).filter(Boolean);
    const inStarters = starters.includes(cur);
    if (!inStarters) allOpen = true;
    const full = h("details", { class: "quiet pick-all", open: allOpen, ontoggle: e => { allOpen = e.target.open; } }, h("summary", {}, `All ${M.length} measurements`),
      groups.map(g => h("fieldset", { class: "pick-group" }, h("legend", {}, g.label), g.items.map(v => row(v, "variable")))));
    const list = h("div", { class: "pick-list", role: "group", "aria-label": "Measurement" },
      starters.length ? h("fieldset", { class: "pick-group pick-start", role: "radiogroup" }, h("legend", {}, "Good places to start"), starters.map(v => row(v, "variable-start"))) : null, full);
    const model = cur.src === "power" || cur.kind === "model_output";
    measureBody.replaceChildren(list,
      h("div", { class: "defpanel", "aria-live": "polite" },
        h("div", { class: "chips" }, h("span", { class: "chip src " + sinfo(cur).cls }, sinfo(cur).full), h("span", { class: "chip" }, `${cur.since}–${cur.last}`), cur.goodLast != null ? h("span", { class: "chip warn" }, `Trusted to ${cur.qualityEndText}`) : null, h("span", { class: "chip" }, U(cur.units))),
        cur.limit ? h("p", { class: "small muted", style: "margin:8px 0 0" }, h("b", {}, "Limit. "), cur.limit) : null,
        disc("What is this measurement?", h("p", { class: "small" }, cur.one_line), h("p", { class: "small" }, h("b", {}, "Source. "), cur.source, cur.doi ? [" · ", h("a", { href: cur.doi, target: "_blank", rel: "noopener" }, "NASA product page")] : ""),
          h("p", { class: "small" }, model ? (cur.src === "power" ? "A computer model blended many measurements to fill the whole map. It is useful for trends but is not a direct measurement. A trend can reflect changes in the data that feed the model as well as the climate." : cur.caveats) : cur.caveats))),
      ...(aod ? [h("p", { class: "other-case" }, `${aod.name} is a registered case, not a live measurement. `, h("a", { href: aod.case_link }, "Open case " + aod.case_id))] : []));
  }
  function setMeasure(v) {
    state.src = v.src; state.key = v.key;
    let moved = "";
    if (v.src === "power" && isWorld(state.box)) { const w = P.find(p => p.key === "wisconsin"); state.box = { ...w.box }; wm.setBox(state.box); moved = "Whole world is for the library measurements, so the place was moved to Wisconsin. "; }
    clampYears(); drawMeasure(); drawPlace(moved); drawPeriod(); changed();
  }

  // ======================================================== panel 2: place (the real basemap, presets, drag a box)
  const presetPills = h("div", { class: "pills", role: "radiogroup", "aria-label": "Preset regions" });
  const inputs = {}, err = h("p", { class: "small", style: "color:var(--bad);min-height:1.4em;margin:0", role: "alert" });
  const boxRow = h("div", { class: "boxrow" }, ...[["n", "North edge (latitude)"], ["s", "South edge (latitude)"], ["w", "West edge (longitude)"], ["e", "East edge (longitude)"]].map(([k, lab]) => {
    const i = h("input", { type: "number", step: "0.5", id: "box-" + k, value: state.box[k], onchange: () => setBox({ ...state.box, [k]: parseFloat(i.value) }, true) });
    inputs[k] = i; return h("label", { for: "box-" + k }, lab, i);
  }));
  const wm = worldMap({ box: state.box, onChange: b => { state.presetKey = "custom"; setBox(b); } });
  const boxLabel = h("p", { class: "place-sel" }), planNote = h("div", { class: "small", "aria-live": "polite" }), placeHint = h("p", { class: "muted small", style: "margin:0" });
  let movedNote = "";
  function drawPlace(moved) {
    if (moved != null) movedNote = moved;
    const v = curVar(), lib = v.src === "library", match = P.find(p => sameBox(p.box, state.box));
    presetPills.replaceChildren(...P.map(p => { const off = p.key === "world" && !lib;
      return h("label", { class: off ? "pill-off" : "" }, h("input", { type: "radio", name: "preset", value: p.key, disabled: off, checked: !!match && match.key === p.key, onchange: () => { state.presetKey = p.key; setBox({ ...p.box }); } }), h("span", {}, p.name.replace(/\s*\(.*\)$/, "")));
    }));
    placeHint.textContent = movedNote + (lib ? "Draw a box on the map, pick a preset, or take the whole world. Any size works for library measurements." : "Draw a box on the map or pick a preset. " + POWER_WORLD_NOTE);
    boxLabel.replaceChildren(h("b", {}, "Selected: "), isWorld(state.box) ? "the whole world" : boxStr(state.box));
    if (validateBox(state.box).length) { planNote.replaceChildren(); return; }
    if (lib) {
      const pl = libraryPlan(v, state.box);
      planNote.replaceChildren(h("p", { class: pl.empty ? "callout" : "muted", style: "margin:0" }, pl.whole ? `Whole world: reads all ${pl.tiles} tiles of the library (about ${Math.round(pl.mb)} MB) the first time; later changes are quick.` : pl.empty ? "This box has no data for this measurement (it may cover land only, or lie over open ocean)." : `Reads ${pl.tiles} library tile${pl.tiles === 1 ? "" : "s"} (about ${Math.max(0.1, Math.round(pl.mb * 10) / 10)} MB) holding ${pl.cells} one-degree cells.${pl.fallback ? " The box is smaller than one cell, so the cell at its center is used." : ""}`));
    } else {
      const pl = planBox(state.box); planNote.replaceChildren(h("p", { class: pl.kind === "regional" ? "muted" : "callout", style: "margin:0" }, pl.message));
      if (pl.kind === "too_big") planNote.append(h("div", { class: "actions", style: "margin-top:8px" }, h("button", { class: "btn-quiet", type: "button", onclick: () => setBox({ ...pl.alt }) }, `Use the largest allowed box (${boxStr(pl.alt)})`)));
    }
  }
  function setBox(b, fromInput, quiet) {
    const errs = validateBox(b); err.textContent = errs.join(" ");
    if (!errs.length) { state.box = b; wm.setBox(b); }
    for (const k of "nswe") if (!fromInput || errs.length === 0) inputs[k].value = state.box[k];
    const match = P.find(p => sameBox(p.box, state.box)); state.presetKey = match ? match.key : "custom";
    drawPlace(""); // any hand edit clears the "moved to Wisconsin" note
    if (!quiet && (!fromInput || !errs.length)) changed();
  }

  // ======================================================== panel 3: period (dual-handle slider, season chips, numeric years collapsed)
  function clampYears() {
    const v = curVar(); state.y0 = Math.max(v.since, Math.min(state.y0, v.last - 1)); state.y1 = Math.min(v.last, Math.max(state.y1, state.y0 + 1));
    if (state.y1 > endYear(v) && !state.keepFlagged) state.y1 = Math.max(endYear(v), state.y0 + 1);
    if (state.y1 <= state.y0) { state.y0 = v.since; state.y1 = endYear(v); }
  }
  const periodBody = h("div", { class: "period-body" });
  function drawPeriod() {
    const v = curVar();
    const qNote = h("p", { class: "callout", role: "note", hidden: true }), readout = h("p", { class: "range-read", "aria-live": "off" }), warn = h("p", { class: "small muted", id: "period-note", style: "margin:0" });
    const lo = h("input", { type: "range", class: "r-lo", id: "y0r", "aria-label": "First year", min: v.since, max: v.last, step: 1, value: state.y0 });
    const hi = h("input", { type: "range", class: "r-hi", id: "y1r", "aria-label": "Last year", min: v.since, max: v.last, step: 1, value: state.y1 });
    const qPct = v.goodLast != null ? ((v.goodLast - v.since) / Math.max(1, v.last - v.since) * 100).toFixed(2) : null;
    const rng = h("div", { class: "range2" }, h("div", { class: "range2-track" }, h("i", { class: "range2-fill" }), qPct != null ? h("i", { class: "range2-q", style: `left:${qPct}%` }) : null), lo, hi);
    const y0n = h("input", { type: "number", id: "y0", min: v.since, max: v.last, value: state.y0 }), y1n = h("input", { type: "number", id: "y1", min: v.since, max: v.last, value: state.y1 });
    const paint = () => {
      const span = Math.max(1, v.last - v.since);
      rng.style.setProperty("--lo", ((state.y0 - v.since) / span * 100).toFixed(2) + "%"); rng.style.setProperty("--hi", ((state.y1 - v.since) / span * 100).toFixed(2) + "%");
      lo.style.zIndex = state.y0 > v.since + span / 2 ? 3 : 2; hi.style.zIndex = state.y0 > v.since + span / 2 ? 2 : 3;
      lo.value = state.y0; hi.value = state.y1; y0n.value = state.y0; y1n.value = state.y1;
      lo.setAttribute("aria-valuetext", String(state.y0)); hi.setAttribute("aria-valuetext", String(state.y1));
      const n = state.y1 - state.y0 + 1;
      readout.replaceChildren(h("span", { class: "num" }, `${state.y0}–${state.y1}`), h("span", { class: "range-n" }, ` ${n} years`));
      state.keepFlagged = pastQuality(v, state.y1);
      qNote.hidden = !state.keepFlagged; qNote.replaceChildren(...(state.keepFlagged ? [h("b", {}, "Flagged months included. "), `This window reaches past ${v.qualityEndText} (${v.qualityLabel}). The result is marked uncalibrated and withheld.`] : []));
      warn.textContent = n < 10 ? `That is ${n} years. Short records make trend tests weak.` : n < 25 ? "Twenty-five years or more is a better start." : "";
      warn.hidden = !warn.textContent;
    };
    const apply = (a, b, now) => { state.y0 = a; state.y1 = b; paint(); changed(now); };
    // One continuous drag (or one held arrow key) publishes one question, on release, however long the pause in the middle.
    const release = () => { if (!holding) return; holding = false; if (pending) { clearTimeout(timer); timer = setTimeout(() => run(), DEBOUNCE_MS); } };
    for (const el of [lo, hi]) {
      el.addEventListener("pointerdown", () => { holding = true; const up = () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); release(); }; window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); });
      el.addEventListener("keydown", e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) holding = true; });
      el.addEventListener("keyup", () => release());
      el.addEventListener("blur", () => release());
    }
    lo.addEventListener("input", () => apply(Math.min(+lo.value, state.y1 - 1), state.y1));
    hi.addEventListener("input", () => apply(state.y0, Math.max(+hi.value, state.y0 + 1)));
    const typed = () => { const a = +y0n.value, b2 = +y1n.value; if (Number.isInteger(a) && Number.isInteger(b2) && String(y0n.value).length === 4 && String(y1n.value).length === 4 && a >= v.since && b2 <= v.last && a < b2) apply(a, b2, false); };
    y0n.addEventListener("input", typed); y1n.addEventListener("input", typed);
    y0n.addEventListener("change", () => apply(Math.max(v.since, Math.min(+y0n.value || v.since, state.y1 - 1)), state.y1, true));
    y1n.addEventListener("change", () => apply(state.y0, Math.min(v.last, Math.max(+y1n.value || v.last, state.y0 + 1)), true));
    const seasons = h("div", { class: "pills season-pills", role: "radiogroup", "aria-label": "Season" }, S.map(x => h("label", {}, h("input", { type: "radio", name: "season", value: x.key, checked: x.key === state.season, onchange: () => { state.season = x.key; seasonNote.textContent = seasonText(x); changed(); } }),
      h("span", { title: x.name }, x.key === "all" ? "Whole year" : x.key === "jjas" ? "Wet season" : seasonShort(x).replace(/^./, c => c.toUpperCase())))));
    const seasonText = x => x.key === "all" ? "All twelve months of each year." : `${x.name.split(" (")[0]}: ` + x.months.map(m => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]).join(", ") + ". Only these months count each year.";
    const seasonNote = h("p", { class: "muted small", style: "margin:0" }, seasonText(curSeason()));
    const quick = (label, a, b) => h("button", { class: "btn-quiet quick", type: "button", onclick: () => apply(Math.max(v.since, a), b, true) }, label);
    const goodEnd = endYear(v);
    const qLegend = v.goodLast != null ? h("p", { class: "small muted q-legend", style: "margin:6px 0 0" }, h("span", { class: "q-swatch", "aria-hidden": "true" }), `Hatched: after ${v.qualityEndText}. ${v.qualityLabel}. ${v.qualityReason}`) : null;
    periodBody.replaceChildren(
      h("div", { class: "field", role: "group", "aria-labelledby": "yr-l" }, h("p", { class: "field-l", id: "yr-l" }, "Years"), readout, rng,
        h("div", { class: "range-ends", "aria-hidden": "true" }, h("span", {}, String(v.since)), h("span", {}, String(v.last))),
        h("div", { class: "quicks" }, quick(v.goodLast != null ? "Full trusted record" : "Full record", v.since, goodEnd), quick("Last 20 years", goodEnd - 19, goodEnd), v.goodLast != null ? quick("Include flagged months", v.since, v.last) : null), qLegend, qNote, warn),
      h("div", { class: "field" }, h("p", { class: "field-l", id: "se-l" }, "Season"), seasons, seasonNote),
      h("p", { class: "muted small", style: "margin:0" }, v.src === "library" ? periodNote(v) : `${v.name} is available from ${v.since}.`),
      h("details", { class: "quiet" }, h("summary", {}, "Type the years instead"), h("div", { class: "boxrow", style: "max-width:18rem" }, h("label", { for: "y0" }, "First year", y0n), h("label", { for: "y1" }, "Last year", y1n))));
    paint();
  }

  // ======================================================== running the fetch and the tests
  // Guided examples try NASA POWER live first; if that fails or takes too long, they use a saved copy of the same request (data/demo_cache/), clearly labeled.
  const CACHES = [{ key: "t2m", preset: "wisconsin", cache: "wi" }, { key: "precip", preset: "sahel", cache: "sahel" }];
  async function fetchOrCache(args) {
    // The two saved requests (Wisconsin air temperature, Sahel rainfall; both 1981-2025) back up the live request for guided examples and for the default view.
    const hit = CACHES.find(d => { const preset = P.find(q => q.key === d.preset); return args.variable.key === d.key && preset && sameBox(preset.box, args.box) && args.startYear === 1981 && args.endYear === 2025; });
    if (!hit) return fetchMonthly(args);
    const lc = new AbortController(), link = () => lc.abort(); let tm = 0;
    if (args.signal) { if (args.signal.aborted) lc.abort(); else args.signal.addEventListener("abort", link, { once: true }); }
    try { return await Promise.race([fetchMonthly({ ...args, signal: lc.signal }), new Promise((_, rej) => { tm = setTimeout(() => { lc.abort(); rej(new Error("NASA POWER took too long.")); }, DEMO_TIMEOUT_MS); })]); }
    catch (e) {
      if (args.signal && args.signal.aborted) throw e;
      
      let c; try { const r = await fetch(`data/demo_cache/${hit.cache}.json`); if (!r.ok) throw new Error("no cache"); c = await r.json(); } catch (e2) { throw e; }
      if (args.signal && args.signal.aborted) throw e;
      if (args.onProgress) args.onProgress({ done: 1, total: 1 });
      const rows = c.rows.map(([year, month, value]) => ({ year, month, value }));
      return { stub: false, source: args.variable.source, units: c.units, rows, note: c.note, method: c.method, n_tiles: c.n_tiles, n_cells: c.n_cells, first_year: c.first_year, last_year: c.last_year, cached: true, cachedLabel: `The live NASA POWER request did not work just now, so this shows the identical request, saved on ${c.fetched_label}, 2026. Live data is tried first every time.` };
    }
  }
  const cachedBadge = R => R && R.data && R.data.cached ? h("p", { class: "callout", role: "note" }, h("b", {}, "Cached copy from Nov 14. "), R.data.cachedLabel) : null;

  // Reuse what is already downloaded: a POWER series covers any year window inside it (and any season); a library series is reused for the same window.
  function cachedData(v, box, y0, y1) {
    const e = dataCache.get(`${v.src}|${v.key}|${[box.s, box.n, box.w, box.e].map(num4).join(",")}`);
    if (!e) return null;
    if (v.src === "library") return e.y0 === y0 && e.y1 === y1 ? e.data : null;
    if (e.y0 > y0 || e.y1 < y1) return null;
    if (e.y0 === y0 && e.y1 === y1) return e.data;
    const rows = e.data.rows.filter(r => r.year >= y0 && r.year <= y1);
    return rows.length ? { ...e.data, rows, first_year: rows[0].year, last_year: rows[rows.length - 1].year } : null;
  }
  async function run() {
    clearTimeout(timer); pending = false; if (ctl) { ctl.abort(); ctl = null; }
    // Snapshot every setting before awaiting: what the result shows is what was asked when the run began, whatever is clicked meanwhile.
    const v = curVar(), season = curSeason(), box = { ...state.box }, y0 = state.y0, y1 = state.y1, my = ++runId, asked = { v, season, box, y0, y1 };
    const errs = validateBox(box);
    if (errs.length) { state.status = "error"; state.err = errs.join(" "); state.stale = false; drawResult(); drawProgress(); updateStrip(); return false; }
    if (v.src === "power" && planBox(box).kind === "too_big") { state.status = "error"; state.err = planBox(box).message; state.stale = false; drawResult(); drawProgress(); updateStrip(); return false; }
    const own = cachedData(v, box, y0, y1);
    state.status = "loading"; state.err = ""; state.stale = !!state.last;
    const bar = h("progress", { max: 1, value: 0, "aria-label": "Download progress" }), cap = h("p", { class: "muted small", style: "margin:8px 0 0" }, v.src === "library" ? "Reading the NASA data library." : "Contacting NASA POWER.");
    prog = { bar, cap, name: v.name.toLowerCase(), src: v.src }; drawResult(); drawProgress(); updateStrip();
    ctl = new AbortController(); const signal = ctl.signal;
    try {
      const onProgress = ({ done, total }) => { if (my !== runId) return; bar.value = total ? done / total : 0; cap.textContent = `${done} of ${total} ${v.src === "library" ? "file" : "request"}${total === 1 ? "" : "s"} done.`; };
      const data = own || (v.src === "library" ? await libraryRegional({ variable: v, box, y0, y1, onProgress, signal }) : await fetchOrCache({ variable: v, box, startYear: y0, endYear: y1, onProgress, signal }));
      if (my !== runId) return false; // a newer question was asked while the data was coming: this answer is dropped
      if (!own) dataCache.set(`${v.src}|${v.key}|${[box.s, box.n, box.w, box.e].map(num4).join(",")}`, { y0, y1, data });
      let rows, skipped = [];
      if (v.src === "library") { const c = completeSeasons(data.rows, season.months, y0, y1); rows = c.rows; skipped = c.skipped; } else rows = data.rows.filter(r => season.months.includes(r.month));
      const R = { v, season, data, rows, skipped, box: { ...asked.box }, y0, y1, flagged: v.src === "library" && pastQuality(v, y1) };
      state.result = R; state.last = analyze(R); state.status = "ready"; state.stale = false;
      // A question counts once, when its result is displayed: failed, superseded and too-short runs do not count, and neither do repeats.
      if (!state.last.W.tooShort) { noteTry(R); if (!demo) syncUrl(shareHash(R)); }
      drawResult(); drawProgress(); updateStrip();
      announce("Result updated. " + (state.last.W.tooShort ? "Too few years to test." : `${rulingLabel(state.last).calibrated ? "Ruling: " : ""}${rulingLabel(state.last).label}.`));
      return true;
    } catch (e) {
      if (my !== runId || (signal && signal.aborted)) return false;
      state.status = "error"; state.stale = false; state.err = "Could not get the series. " + (e && e.message || e); drawResult(); drawProgress(); updateStrip(); return false;
    }
  }
  function analyze(R) {
    const W = analyzeRows(R.rows, { months: R.season.months, y0: R.y0, y1: R.y1, units: R.v.units });
    if (W.tooShort) return { W, R };
    // Missing years must reach the calibration check: give it the whole requested period WITH its holes (null), never the compressed series.
    const axis = []; for (let yr = R.y0; yr <= R.y1; yr++) axis.push(yr);
    const have = new Map(W.years.map((yr, i) => [yr, W.anomaly[i]])), full = axis.map(yr => (have.has(yr) ? have.get(yr) : null));
    const missList = axis.filter((yr, i) => full[i] === null);
    try { W.gate = exploratoryGate(axis, full, { period: [R.y0, R.y1] }); } catch (e) { /* keep the module's own gate */ }
    // Notes that make a run uncalibrated: years missing from the series, and months a product flags as unreliable.
    const g0 = W.gate, nMiss = g0 && Number.isFinite(g0.missingYears) ? g0.missingYears : missList.length, notes = [];
    if (nMiss > 0 || missList.length) notes.push(`${nMiss || missList.length} year${(nMiss || missList.length) === 1 ? "" : "s"} missing${missList.length ? ": " + missList.join(", ") : ""}. The calibration check does not vouch for a series with gaps.`);
    if (R.flagged) notes.push(`This window includes months after ${R.v.qualityEndText} (${R.v.qualityLabel}). ${R.v.qualityReason}`);
    if (notes.length) W.gate = { ...(g0 || {}), calibrated: false, caveat: notes.join(" ") + (g0 && g0.caveat && !nMiss && !missList.length ? " " + g0.caveat : ""), missingYears: nMiss, missList };
    const corr = stepInfo("autocorr", W.A_an.mk), corrBase = stepInfo("autocorr");
    const rungs = [
      { n: 1, ...stepInfo("raw"), p: W.A_raw.mkIndependent.p, slope: W.A_raw.sen.slopePerDecade },
      { n: 2, ...stepInfo("anomaly"), p: W.A_an.mkIndependent.p, slope: W.A_an.sen.slopePerDecade },
      { n: 3, ...corr, title: corrBase.name, method: corr.name, extra: `Variance factor ${W.A_an.mk.hrFactor.toFixed(2)}`, p: W.A_an.mk.p, slope: W.A_an.sen.slopePerDecade },
    ];
    return { W, R, rungs };
  }
  // Any input change: the question updates at once, the result follows after a short pause (so dragging a handle does not fire a request per year).
  // draft: a handle is being dragged or an arrow key is held. The question and the status update at once; the statistics wait for release.
  function changed(now) {
    if (demo) { demo = null; document.querySelectorAll(".demo-focus").forEach(e => e.classList.remove("demo-focus")); drawDemoCard(); } // changing an input ends a guided example
    drawHeader(); drawProgress(); clearTimeout(timer); pending = true; runId++; if (ctl) { ctl.abort(); ctl = null; } // an in-flight run for the old question is now stale
    state.stale = !!state.last; if (state.status === "loading") state.status = "idle";
    if (resultBusy) resultBusy.hidden = false;
    if (!holding) timer = setTimeout(() => run(), now ? 0 : DEBOUNCE_MS);
    markPending(); updateStrip();
  }
  function markPending() { const b = document.getElementById("result-state"); if (b) { b.textContent = "Updating"; b.hidden = false; } document.querySelector(".result-grid")?.classList.add("stale"); const n = document.getElementById("prev-note"); if (n) n.hidden = false; }

  // ======================================================== the result: record, trial and ruling, directly under the builder
  const resultHost = h("section", { class: "result", id: "result", "aria-labelledby": "result-h" });
  let resultBusy = null, spiralH = null, spiralToken = 0;
  function killSpiral() { spiralToken++; if (spiralH) { try { spiralH.destroy(); } catch (e) { /* ignore */ } spiralH = null; } }
  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v num" }, val), h("div", { class: "s" }, sub));

  // A significance-style label is for a calibrated record only. When the calibration check failed (or years are missing, or the window reaches
  // flagged months) the headline says so and the p-value is shown as a description. The computation is unchanged.
  const EXPLORATORY_HEAD = "Exploratory statistic; calibration failed";
  const EXPLORATORY_SUB = "does not justify a calibrated significance conclusion";
  const moves = s => (s > 0 ? "rises" : s < 0 ? "declines" : "is flat");
  function rulingLabel(L) {
    const { W, rungs } = L, pRaw = rungs[0].p, pFin = rungs[2].p, sig = pFin < ALPHA, weak = pRaw < ALPHA && !sig, calibrated = !!(W.gate && W.gate.calibrated) && !L.R.flagged;
    if (L.R.flagged) return { label: "Withheld", tone: "warn", sig: false, weak: false, noVerdict: true, calibrated: false, pRaw, pFin, W };
    if (!calibrated) return { label: EXPLORATORY_HEAD, tone: "warn", sig, weak, calibrated: false, pRaw, pFin, W };
    return { label: sig ? "Significant at 0.05" : weak ? "Weakened by the trial" : "Not significant at 0.05", tone: sig ? "ok" : weak ? "warn" : "", sig, weak, calibrated: true, pRaw, pFin, W };
  }
  // The simulation setting the check actually looked at, and the plain reasons it failed. Built from the gate's own fields; nothing new is computed.
  function calibrationFacts(gate, R) {
    if (!gate) return { setting: "", failed: ["No calibration check was available for this record."] };
    const n = gate.nValid, phi = Number.isFinite(gate.phiHat) ? gate.phiHat.toFixed(2) : "n/a", sk = Number.isFinite(gate.skew) ? gate.skew.toFixed(2) : "n/a";
    const size = gate.sizeAtBucket && Number.isFinite(gate.sizeAtBucket.size) ? (100 * gate.sizeAtBucket.size).toFixed(1) : null;
    const setting = `Simulation setting checked: ${n} yearly values (nearest tested length ${gate.nGov}), year-to-year persistence ${phi}` + (gate.phiGov !== null && gate.phiGov !== undefined ? ` (tested value ${gate.phiGov})` : " (above the tested range)") + `, skewness ${sk}` + (size !== null ? `. At that setting the correction called a trend in ${size}% of trendless synthetic series (intended 5%).` : ".");
    const failed = [];
    const rs = gate.reasons || [];
    if (rs.includes("gaps") || gate.missList && gate.missList.length) failed.push(`${gate.missingYears} year${gate.missingYears === 1 ? "" : "s"} missing${gate.missList && gate.missList.length ? ": " + gate.missList.join(", ") : ""}. The calibration checks used complete series, and no check with missing years passed.`);
    if (rs.includes("size_liberal")) failed.push(`At this length and persistence the simulated false-alarm rate was too high${size !== null ? " (" + size + "% instead of 5%)" : ""}, so the p-value is probably too small.`);
    if (rs.includes("persistence_above_range")) failed.push(`Year-to-year persistence (${phi}) is above the range tested (0.6), so the reliability of the p-value is unknown.`);
    if (rs.includes("skewed")) failed.push(`The series is strongly lopsided (skewness ${sk}), beyond the range that was checked.`);
    if (rs.includes("length")) failed.push(`The series has ${n} valid points; the calibration checks cover 20 to 50.`);
    if (R && R.flagged) failed.push(`This window includes months after ${R.v.qualityEndText} (${R.v.qualityLabel}). ${R.v.qualityReason}`);
    if (!failed.length) failed.push("The calibration check did not pass for this record.");
    return { setting, failed };
  }
  // One compact scope line shown on every Investigate ruling: variable, place, years, source type, and what the ruling cannot establish.
  function scopeEl(R, extra) {
    const model = R.v.src === "power" || R.v.kind === "model_output";
    return h("p", { class: "scope-line" }, h("b", {}, "Scope. "), `${R.v.name} · ${isWorld(R.box) ? "the whole world" : boxStr(R.box)} · ${R.season.name} · ${R.y0}–${R.y1} · ${model ? "model output, not a direct measurement" : "satellite observation"}. `, h("b", {}, "Cannot establish: "), `why the value changed or what comes next${extra || ""}.`);
  }
  // The ruling is a compact aside. The word comes from the same rule as before; the longer reading notes are in a disclosure.
  function rulingLite(L) {
    const { W, R, rungs } = L, A = W.A_an, g = rulingLabel(L), { sig, weak, pRaw, pFin } = g, gate = W.gate, u = U(R.v.units), slope = A.sen.slopePerDecade, ci = A.sen.intervalPerDecade;
    if (g.noVerdict) return h("div", { class: "ruling-lite ruling-fade", role: "group", "aria-label": "Ruling" },
      h("div", { class: "chips" }, h("span", { class: "chip brass" }, "Exploratory analysis"), h("span", { class: "chip" }, "Not calibrated")),
      h("h3", { class: "ruling-h" }, g.label), scopeEl(R, "; this is your own exploration, not a registered test"),
      h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "1. What the record shows"), h("p", { class: "muted" }, `Described only: the Sen slope is ${signed(slope, 3)} ${u} per decade. It is not a basis for a conclusion.`)),
      h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "2. What the tool can conclude"), h("p", { class: "callout", role: "note" }, gate.caveat, " Shorten the period to end in ", String(R.v.goodLast), " to exclude the flagged months. The revised record will be checked again.")),
      h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "3. Why the distinction matters"), h("p", { class: "withheld-line" }, WITHHELD_LINE)));
    if (!g.calibrated) {
      const f = calibrationFacts(gate, R);
      return h("div", { class: "ruling-lite ruling-fade", role: "group", "aria-label": "Ruling" },
        h("div", { class: "chips" }, h("span", { class: "chip brass" }, "Exploratory analysis"), h("span", { class: "chip" }, "Final for these settings, after hearing 3"), h("span", { class: "chip warn" }, "Calibration failed")),
        h("h3", { class: "ruling-h" }, g.label), scopeEl(R, "; this is your own exploration, not a registered test, and its calibration failed"),
        h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "1. What the record shows"),
          h("p", {}, `The record ${moves(slope)}.`),
          h("div", { class: "chips", style: "margin-bottom:12px" }, h("span", { class: "chip neutral" }, `Descriptive p ${fmtP(pFin)}` + (pFin < 0.001 ? ` (${pFin.toPrecision(2)})` : ""))),
          h("p", { class: "muted small" }, `The p-value is shown as a description only (${fmtP(pRaw) === fmtP(pFin) ? `p ${fmtP(pFin)} both at the start and after the correction` : `p ${fmtP(pRaw)} at the start, ${fmtP(pFin)} after the correction`} for year-to-year persistence). It is not read as a significance finding.`),
          h("p", { class: "muted" }, trendWords(R.v.name, slope, ci[0], ci[1], u))),
        h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "2. What the tool can conclude"), h("p", {}, `This analysis ${EXPLORATORY_SUB}.`),
          h("div", { class: "callout", role: "note" }, h("b", {}, "Why the calibration failed. "), h("ul", { class: "calib-list" }, f.failed.map(t => h("li", {}, t))), h("p", { class: "muted small", style: "margin:8px 0 0" }, f.setting))),
        h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "3. Why the distinction matters"), h("p", {}, "A failed calibration describes this tool's limits. It does not show that the trend is real, and it does not show that it is absent.")),
        disc("How to read this", h("p", {}, h("b", {}, "Sen trend. "), "The Sen slope is the median slope between pairs of years, so one odd year barely moves it."), h("p", {}, h("b", {}, "Caveat. "), "A trend alone does not say what caused it or what comes next." + (R.v.src === "power" ? " NASA POWER series for this variable are model-based, so a trend can reflect changes in the data sources as well as the climate." : "")),
          h("p", { class: "muted small" }, PERSISTENCE_CAVEAT),
          h("p", { class: "muted small" }, (gate ? gate.label : "Your own exploration, not pre-registered") + ". The interval is exploratory: it has not passed a coverage check for your series.")));
    }
    const lines = [h("p", {}, fixVerdict(A.verdict.text))];
    if (weak) lines.push(h("p", {}, `At first the trend looked significant (p ${fmtP(pRaw)}). After the trial it no longer clears the 0.05 line (p ${fmtP(pFin)}). A trend can look clearer than it is until the record is asked different questions.`));
    else if (sig && Math.max(pRaw, pFin) < 0.001) lines.push(h("p", {}, "It held up clearly: p is below 0.001 at the start and still below 0.001 after the correction."));
    else if (sig && pFin > pRaw * 1.5) lines.push(h("p", {}, `It held up, but less strongly: p went from ${fmtP(pRaw)} to ${fmtP(pFin)} over the three hearings.`));
    else if (sig) lines.push(h("p", {}, Math.abs(pFin - pRaw) < 0.0005 ? `It held up, and none of the three hearings moved the p-value (p ${fmtP(pFin)}).` : `It held up through all three hearings (p ${fmtP(pRaw)} at the start, ${fmtP(pFin)} at the end).`));
    if (Math.abs(pFin - ALPHA) < 0.0005) lines.push(h("p", { class: "muted small" }, "This p-value is right at the 0.05 line, so treat the result as borderline."));
    if (!sig) lines.push(h("p", { class: "muted small" }, "Inconclusive is a result too. Next: try a longer period or a larger region, and keep a note of every try."));
    lines.push(h("p", { class: "muted" }, trendWords(R.v.name, slope, ci[0], ci[1], u)));
    return h("div", { class: "ruling-lite ruling-fade", role: "group", "aria-label": "Ruling" },
      h("div", { class: "chips" }, h("span", { class: "chip brass" }, "Exploratory analysis"), h("span", { class: "chip" }, "Final for these settings, after hearing 3"), h("span", { class: "chip" }, `Calibration checked at a nearby simulated setting (${gate.nGov} years, persistence ${gate.phiGov !== null && gate.phiGov !== undefined ? gate.phiGov : gate.phiHat.toFixed(2)}), not on the record itself. This record: ${gate.nValid} years, persistence ${gate.phiHat.toFixed(2)}, skew ${gate.skew.toFixed(2)}`)),
      h("h3", { class: "ruling-h" }, g.label), scopeEl(R, "; this is your own exploration, not a registered test"), h("div", { class: "chips", style: "margin-bottom:12px" }, h("span", { class: "chip " + g.tone }, `p ${fmtP(pFin)}`)), ...lines,
      h("p", { class: "muted small calib" }, calibrationFacts(gate, R).setting, " This is your own exploration, not a pre-registered test, and a p-value is not the probability that the trend is real."),
      disc("How to read this", h("p", {}, h("b", {}, "Sen trend. "), "The Sen slope is the median slope between pairs of years, so one odd year barely moves it."), h("p", {}, h("b", {}, "Caveat. "), "A trend alone does not say what caused it or what comes next." + (R.v.src === "power" ? " NASA POWER series for this variable are model-based, so a trend can reflect changes in the data sources as well as the climate." : "")),
        h("p", { class: "muted small" }, PERSISTENCE_CAVEAT),
        h("p", { class: "muted small" }, (gate ? gate.label : "Your own exploration, not pre-registered") + ". The interval is exploratory: it has not passed a coverage check for your series.")));
  }
  const csvBtn = (W, R) => h("button", { class: "btn-quiet", type: "button", onclick: () => download(`investigate_${R.v.src}_${R.v.key}_${R.y0}-${R.y1}.csv`, "year,season_mean,anomaly\n" + W.years.map((yr, i) => `${yr},${W.raw[i].toFixed(5)},${W.anomaly[i].toFixed(5)}`).join("\n"), "text/csv") }, "Download series (CSV)");
  const linkBtn = R => demo ? null : copyButton("Copy link to this investigation", () => shareUrl(R), null, "Link");

  function recordSection(L) {
    const { W, R } = L, season = R.season, u = U(R.v.units), R_ = W.A_raw;
    const cal = rulingLabel(L).calibrated, sigL = p => (cal ? sigLabel(p) : descLabel(p));
    const showAn = state.view === "anom" && season.key !== "all", y = showAn ? W.anomaly : W.raw, A = showAn ? W.A_an : W.A_raw, ols0 = showAn ? W.olsInterceptAn : W.olsIntercept;
    const senLine = W.years.map(t => A.mk.intercept + A.mk.slope * t), olsLine = W.years.map(t => ols0 + A.ols.slope * t);
    const chart = trendChart({
      x: W.years, y, units: u, band: null, ptR: 3.4, fmtX: v2 => String(v2), xTickStep: W.years.length > 30 ? 10 : 5,
      lines: [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: senLine }, { label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: olsLine }],
      yLabel: (showAn ? "Anomaly: " : "") + `${R.v.name} (${u})`, pointWord: showAn ? "anomaly" : "season mean",
      describe: `${R.v.name}, ${isWorld(R.box) ? "whole world" : boxStr(R.box)}, ${season.name}, one value per year, ${R.y0} to ${R.y1}. Sen trend ${signed(A.sen.slopePerDecade, 3)} ${u} per decade.`,
      keyItems: [["k-pt", "Season average for one year"], ["k-sen", "Sen trend"], ["k-ols", "Least squares line"]],
    });
    const cyc = season.key === "all" ? monthlyData(R.data.rows, { y0: R.y0, y1: R.y1, name: R.v.name, units: R.v.units, unitsLabel: u, place: isWorld(R.box) ? "the whole world" : boxStr(R.box), source: R.v.source }) : null;
    const cycle = !!cyc && state.chart === "cycle";
    const chartSeg = !cyc ? null : h("div", { class: "seg", role: "radiogroup", "aria-label": "Chart shown" }, [["yearly", "Yearly record"], ["cycle", "Monthly cycle"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "chartview", value: k, checked: (state.chart === "cycle") === (k === "cycle"), onchange: () => { state.chart = k; drawResult(); document.getElementById("cv-" + k)?.focus(); } }), h("span", { id: "cv-" + k }, l))));
    const toggle = season.key === "all" ? null : h("div", { class: "seg", role: "radiogroup", "aria-label": "Series shown" }, [["values", "Season mean per year"], ["anom", "Seasonal cycle removed"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "view", value: k, checked: (state.view === "anom") === (k === "anom"), onchange: () => { state.view = k; drawResult(); document.getElementById("view-" + k)?.focus(); } }), h("span", { id: "view-" + k }, l))));
    const cycHost = h("div", { class: "cycle-host" });
    const left = R.skipped.length ? R.skipped.length : 0;
    const sec = h("div", { class: "res-sec", id: "result-record" },
      h("h3", { id: "result-record-h", tabindex: "-1" }, "The record"),
      h("p", { class: "chart-sub" }, `${W.n} years with a value, ${R.y0}–${R.y1}, ${season.name}. ${R.data.note}`),
      R.data.dropped ? h("p", { class: "muted small", style: "margin:0 0 var(--sp-3)" }, `${R.data.dropped} month${R.data.dropped === 1 ? " was" : "s were"} dropped because fewer than 80% of the box's usable area had a value.`) : null,
      left ? h("p", { class: "callout info", role: "note" }, h("b", {}, `${left} year${left === 1 ? "" : "s"} left out: ${R.skipped.join(", ")}. `), `The data have no value for at least one month of ${season.key === "all" ? "those years" : "the " + seasonShort(season) + " season in those years"}, and gaps are never filled in. The tests use the ${W.n} years that remain.`) : null,
      h("div", { class: "seg-row" }, chartSeg, cycle ? null : toggle),
      cycle ? null : h("p", { class: "slope-label top" }, `Sen slope ${signed(A.sen.slopePerDecade, 2)} ${u} per decade; ${INTERVAL_EXPLORATORY} ${signed(A.sen.intervalPerDecade[0], 2)} to ${signed(A.sen.intervalPerDecade[1], 2)}`),
      cycle ? h("div", { id: "det-chart" }, h("p", { class: "muted small", style: "margin:0 0 8px" }, `Each loop is one year; each point is one month, measured from the average of the same calendar month over ${R.y0}–${R.y1}. A descriptive view of the same data: the trend test uses the yearly record.`), cycHost) : h("div", { id: "det-chart" }, chart.node),
      disc("Two tests side by side", h("div", { class: "statgrid" },
        stat("Mann-Kendall test", `p ${fmtP(R_.mkIndependent.p)}`, `${sigL(R_.mkIndependent.p)}. Sen slope ${signed(R_.sen.slopePerDecade, 2)} ${u} per decade, ${cal ? "95% range" : "exploratory interval; coverage not validated:"} ${signed(R_.sen.intervalPerDecade[0], 2)} to ${signed(R_.sen.intervalPerDecade[1], 2)}`),
        stat("Familiar t-test (least squares)", `p ${fmtP(R_.ols.p)}`, `${sigL(R_.ols.p)}. ${signed(R_.ols.slopePerDecade, 2)} ${u} per decade, ${cal ? "95% range" : "exploratory interval; coverage not validated:"} ${signed(R_.ols.ciPerDecade[0], 2)} to ${signed(R_.ols.ciPerDecade[1], 2)}`)),
        h("p", { class: "small", style: "margin:12px 0 0" }, cal ? pWords(R_.mkIndependent.p) : descPWords(R_.mkIndependent.p)),
        h("p", { class: "muted small" }, "Mann-Kendall asks whether later values tend to be higher or lower than earlier ones, with no straight-line assumption. The t-test is the version most people learn first. They can differ a little. That is normal.")),
      R.v.src === "library" ? disc("About this data product", h("p", { class: "small" }, h("b", {}, R.v.product + ". "), R.v.caveats)) : null);
    if (cycle) { const my = ++spiralToken; import("../viz/cycle.js").then(m => m.renderCycle(cycHost, cyc, {})).then(hnd => { if (my !== spiralToken) { hnd && hnd.destroy(); return; } spiralH = hnd; }).catch(e => { console.error(e); cycHost.append(h("p", { class: "muted small" }, "The monthly cycle could not be drawn. The yearly record is unaffected.")); }); }
    return sec;
  }
  function trialSection(L) {
    const { W, R, rungs } = L, u = U(R.v.units), cal = rulingLabel(L).calibrated;
    return h("div", { class: "res-sec", id: "result-trial" }, h("h3", { id: "result-trial-h", tabindex: "-1" }, "The trial: does it hold up?"),
      h("p", { class: "chart-sub" }, "Three hearings, each changing one thing. We report what happened, whichever way the p-value moves."),
      h("ol", { class: "trial-list" }, rungs.map((r, i) => {
        const pw = Math.min(1, r.p / 0.2) * 100;
        return h("li", { class: "trial-step" },
          h("div", { class: "trial-step-top" }, h("span", {}, "Hearing " + r.n + " of 3"), h("span", { class: "chip " + (cal ? sigClass(r.p) : "neutral") }, cal ? sigLabel(r.p) : descLabel(r.p))),
          h("h4", {}, r.title || r.name), r.method ? h("p", { class: "small", style: "margin:0 0 4px" }, h("b", {}, "Method: "), r.method) : null,
          h("p", { class: "explain" }, r.note, r.extra ? " " + r.extra + "." : ""),
          h("div", { class: "pbar-row" }, h("strong", { class: "num" }, "p " + fmtP(r.p)), h("span", { class: "pbar", "aria-hidden": "true" }, h("i", { style: `width:${pw}%` }), h("em", { style: "left:25%" })), h("span", { class: "delta" }, i ? (Math.abs(r.p - rungs[i - 1].p) < 0.0005 ? "no change" : (r.p > rungs[i - 1].p ? "weaker ↑" : "stronger ↓")) : "baseline")),
          h("p", { class: "small", style: "margin:8px 0 0" }, h("b", {}, "What this step did. "), stepWords(rungs[i - 1], r), ` Sen slope ${signed(r.slope, 2)} ${u} per decade.`));
      })),
      h("p", { class: "note" }, cal ? "The short bar marks the 0.05 line: left of it is significant." : "The short bar marks the 0.05 line. These p-values are descriptive: calibration failed for this record."),
      h("p", { class: "muted small", style: "margin:0" }, `Statistics: trendtrial ${STATS_VERSION}, checked against the Python reference.`));
  }

  function drawResult() {
    killSpiral();
    const L = state.last, R = state.result, v = curVar();
    resultBusy = h("span", { class: "chip", id: "result-state", role: "status", hidden: !(pending || state.status === "loading") }, "Updating");
    const headRow = h("div", { class: "result-head" }, h("h2", { id: "result-h", tabindex: "-1" }, "Result"), h("div", { class: "chips" }, R ? h("span", { class: "chip src " + sinfo(R.v).cls }, sinfo(R.v).full) : null, h("span", { class: "chip brass" }, "Exploratory analysis"), resultBusy));
    let body;
    if (state.status === "loading" && !L) {
      body = h("div", { class: "loadbox", role: "status" }, h("h3", {}, "Getting " + (prog ? prog.name : v.name.toLowerCase()) + (prog && prog.src === "library" ? " from the NASA data library" : " from NASA POWER")), prog ? prog.bar : null, prog ? prog.cap : null,
        h("p", { class: "muted small" }, "Your choices are kept. Long records over big boxes can take a few seconds."));
    } else if (state.status === "error") {
      body = h("div", { class: "state failed", role: "alert" }, h("h3", {}, "We could not get the series"), h("p", {}, state.err || "No series yet."), h("p", { class: "muted small" }, "Your choices are kept. Try again, or change the measurement, place or period."),
        h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => run(false) }, "Try again")));
    } else if (!L) {
      body = h("p", { class: "muted" }, "The result will appear here.");
    } else if (L.W.tooShort) {
      const sk = L.R.skipped;
      body = h("div", { class: "state" }, h("h3", {}, "Too few years to test"), h("p", {}, fixVerdict(L.W.verdict.text)),
        sk.length ? h("p", {}, `${sk.length} year${sk.length === 1 ? " was" : "s were"} left out because the data have no value for at least one month of this season (${sk.join(", ")}). Gaps are never filled in.`) : null,
        h("p", { class: "muted small" }, "Next: choose a longer period, or a season with more months."));
    } else {
      body = h("div", { class: "result-grid" + (state.stale ? " stale" : "") }, h("div", { class: "result-main" }, cachedBadge(R), recordSection(L), trialSection(L)), rulingLite(L));
    }
    const foot = L && !L.W.tooShort && state.status !== "error" ? h("div", { class: "result-foot" },
      h("div", { class: "actions" }, csvBtn(L.W, L.R), linkBtn(L.R)), triesLine(),
      h("p", { class: "caution" }, "Every new window, place or season you try is another chance to find a trend by luck. Report every try, not only the one that looks best. ", h("a", { href: "#/cases" }, "See a registered case"))) : null;
    const own = R && L && !L.W.tooShort && state.status !== "error" ? h("p", { class: "result-own muted small", style: "margin:0 0 var(--sp-3)" }, `${R.v.name} \u00b7 ${isWorld(R.box) ? "whole world" : boxStr(R.box)} \u00b7 ${R.y0}\u2013${R.y1} \u00b7 ${R.season.key === "all" ? "whole year" : seasonShort(R.season)}`) : null;
    const prev = h("p", { class: "callout", id: "prev-note", role: "note", hidden: !(state.stale && (pending || state.status === "loading")) }, h("b", {}, "Previous question \u2014 updating. "), "The numbers below belong to the settings listed above them, not to the ones you have just chosen.");
    resultHost.replaceChildren(headRow, prev, own, body, foot);
    if (demo) drawDemoCard();
  }

  // ======================================================== guided examples: three real outcomes, run live, captions keyed to the five steps
  const fmt2 = x => signed(x, 2);
  function outcome(L) { // the sentence about the trial, written from the numbers actually computed
    const g = rulingLabel(L), a = fmtP(g.pRaw), b = fmtP(g.pFin);
    let t;
    if (g.noVerdict) return "Withheld: this window includes months the data product flags as unreliable.";
    if (!g.calibrated) return `${EXPLORATORY_HEAD}. The record ${moves(L.W.A_an.sen.slopePerDecade)}, but this analysis ${EXPLORATORY_SUB}. Descriptive p-values: ${a} at the start, ${b} after the correction.`;
    if (g.sig && Math.max(g.pRaw, g.pFin) < 0.001) t = `It holds, clearly: p is below 0.001 at the start and still below 0.001 after the correction.`;
    else if (g.sig && Math.abs(g.pFin - g.pRaw) < 0.0005) t = `It holds, and the trial changes nothing: all three hearings give p ${b}.`;
    else if (g.sig && g.pFin > g.pRaw * 1.5) t = `It holds, but less strongly: p goes from ${a} to ${b}.`;
    else if (g.sig) t = `It holds through all three hearings: p goes from ${a} to ${b}.`;
    else if (g.weak) t = `The trial weakens it: the first look was significant (p ${a}), but the test that allows for year-to-year persistence is not (p ${b}).`;
    else t = `It is not significant at the start (p ${a}) and still is not at the end (p ${b}).`;
    return t;
  }
  function recordCaption(L) {
    const { W, R } = L, A = W.A_raw, u = U(R.v.units), lo = Math.min(...W.raw), hi = Math.max(...W.raw), s = A.sen.slopePerDecade;
    let t = `We took the ${R.season.key === "all" ? "yearly" : seasonShort(R.season)} average for each year: ${W.n} dots, from ${minus(lo.toFixed(2))} to ${minus(hi.toFixed(2))} ${u}. The blue Sen line ${s >= 0 ? "rises" : "falls"} by ${Math.abs(s).toFixed(2)} ${u} per decade (${rulingLabel(L).calibrated ? "95% range" : "exploratory interval; coverage not validated:"} ${fmt2(A.sen.intervalPerDecade[0])} to ${fmt2(A.sen.intervalPerDecade[1])}). The dashed line is the least-squares line most people learn first. Do the dots follow the line, or scatter around it?`;
    if (R.skipped.length) t += ` ${R.skipped.length} year${R.skipped.length === 1 ? " was" : "s were"} left out because a month was missing in the season (${R.skipped.join(", ")}).`;
    return t;
  }
  function trialCaption(L) {
    const { W } = L, g = rulingLabel(L);
    let t = `${outcome(L)} Mann-Kendall gives p ${fmtP(W.A_raw.mkIndependent.p)}; the familiar t-test gives p ${fmtP(W.A_raw.ols.p)}.`;
    if (g.calibrated && g.sig && g.pFin > 0.01) t += " That is not far below the 0.05 line, so call it modest evidence, not proof.";
    if (g.calibrated === false && !g.noVerdict) t += " " + calibrationFacts(W.gate, L.R).failed.join(" ");
    return t;
  }
  const DEMOS = [
    { id: "wi", title: "Wisconsin summer air temperature", tag: "Model, NASA POWER", src: "power", key: "t2m", preset: "wisconsin", y0: 1981, y1: 2025, season: "jja", cache: "wi",
      s1: "A familiar question: how warm is the air in summer? This is the temperature a weather station reads, about 2 meters up. It comes from a NASA model that blends many measurements, so it is labeled model-based, not a direct measurement.",
      s2: "Wisconsin is a good size: big enough to average out one hot town, small enough that a single summer still shows. The box is a rectangle around the state.",
      s3: "1981 to 2025 is 45 summers. We keep June, July and August so that winter does not drown out the summer signal. Longer records make a real trend easier to see." },
    { id: "sahel", title: "Sahel wet-season rainfall", tag: "Model, NASA POWER", src: "power", key: "precip", preset: "sahel", y0: 1981, y1: 2025, season: "jjas", cache: "sahel",
      s1: "Next, rainfall. This is NASA POWER's corrected precipitation (PRECTOTCORR), in millimeters per day. It blends satellite and rain-gauge information in a model, so it is labeled model-based, not a direct measurement.",
      s2: "The Sahel is the dry belt south of the Sahara. Its rain falls in one season, so the box is wide: 42 degrees of longitude, averaged cell by cell and weighted by area.",
      s3: "We keep June to September, the wet season, for 1981 to 2025: 45 wet seasons. Rain swings a lot from year to year, so a long record matters here.",
      after: () => h("span", {}, " The satellite rainfall record (IMERG, 2001 to 2025) is a different, shorter record of the same region. It is examined in ", h("a", { href: "#/case/C-B" }, "Case file C-B"), ".") },
    { id: "india", title: "Northern India water storage", tag: "Satellite, GRACE", src: "library", key: "tws_grace", box: { s: 24, n: 32, w: 72, e: 82 }, boxName: "northern India", y0: 2002, y1: 2026, season: "mam",
      s1: "Now something no weather station can read: how much water is stored on and under the ground. The GRACE satellites sense it from tiny changes in gravity. Soil, snow, rivers and groundwater all count together.",
      s2: "A box over northern India, from 24 to 32 degrees north and 72 to 82 east. GRACE sees areas of about 300 km, so a box this size is the right scale.",
      s3: "GRACE has gaps, so a year with a missing month in the season is left out, never filled in. Spring (March to May) keeps the most years of the record, so we use it, 2002 to 2026." },
  ];
  const demoHost = h("div", { class: "demo-host" }), launchHost = h("div", {});
  function drawDemoCard() {
    if (!demo) {
      const ok = DEMOS.filter(d => d.src === "power" || M.some(v => v.src === "library" && v.key === d.key));
      demoHost.replaceChildren();
      launchHost.replaceChildren(h("details", { class: "quiet guided", id: "demo" }, h("summary", {}, "Try a guided example"),
        h("p", { class: "muted small", style: "margin:8px 0 0;max-width:62ch" }, "Three real questions with different outcomes. Each one fills in the five steps and runs the real computation. The results are computed from the selected data rather than supplied in advance. If NASA POWER cannot be reached, a clearly labeled saved copy from Nov 14 is used for the two POWER examples."),
        h("div", { class: "btns" }, ok.map(d => h("button", { class: "btn-quiet", type: "button", onclick: () => startDemo(d) }, d.title, h("span", { class: "btn-tag" }, d.tag))))));
      return;
    }
    // A running example shows all five steps at once, as a plain numbered list: nothing to click through, nothing sticky, nothing that moves focus on a timer.
    const { d } = demo, R = state.result, L = state.last, ready = L && !L.W.tooShort && state.status === "ready" && !pending && R && R.v.key === d.key && R.y0 === d.y0;
    const wait = state.status === "error" ? "The data could not be fetched just now. Try the example again, or close it." : "Running the real computation.";
    const steps = [["Choose variable", d.s1], ["Pick region", d.s2], ["Set period", d.s3],
      ["Examine the series", ready ? recordCaption(L) : wait], ["Test significance", ready ? h("span", {}, trialCaption(L), d.after ? d.after() : null) : wait]];
    launchHost.replaceChildren(h("section", { class: "demo-card demo-list", id: "demo", "aria-labelledby": "demo-h" },
      h("p", { class: "eyebrow brass" }, `Guided example: ${d.title}`, R && R.data && R.data.cached ? " · cached copy from Nov 14" : ""),
      h("h2", { id: "demo-h", tabindex: "-1" }, "The five steps, all at once"),
      h("ol", { class: "demo-steps" }, steps.map(([t, c], i) => h("li", {}, h("b", {}, `${i + 1}. ${t}. `), c))),
      h("p", { class: "muted small" }, "The settings above were filled in for you and the result below was computed live. Change any setting to ask your own question."),
      h("div", { class: "actions" }, h("button", { class: "btn-quiet", type: "button", onclick: () => exitDemo() }, "Close example"))));
    demoHost.replaceChildren();
  }
  function startDemo(d) {
    demo = { d }; state.view = "values"; state.chart = "yearly";
    state.src = d.src; state.key = d.key; state.y0 = d.y0; state.y1 = d.y1; state.season = d.season;
    const box = d.box || P.find(q => q.key === d.preset).box;
    state.box = { ...box }; wm.setBox(state.box); for (const k of "nswe") inputs[k].value = state.box[k];
    drawMeasure(); drawPeriod(); drawPlace(""); drawHeader();
    run(); drawProgress(); drawDemoCard(); document.getElementById("demo-h")?.focus({ preventScroll: true });
  }
  function exitDemo() { demo = null; document.querySelectorAll(".demo-focus").forEach(e => e.classList.remove("demo-focus")); drawDemoCard(); drawProgress(); document.getElementById("demo")?.querySelector("summary")?.focus(); }

  // ======================================================== status strip: always says what the page is showing and whether it is still catching up
  const stripText = h("span", { class: "strip-text", role: "status", "aria-live": "polite" });
  const strip = h("div", { class: "status-strip" }, stripText, h("a", { class: "btn-text strip-jump", href: "#result", onclick: e => { e.preventDefault(); jump("result"); } }, "Jump to record"));
  function updateStrip() {
    const se = curSeason(), base = `${state.y0}\u2013${state.y1} \u00b7 ${state.season === "all" ? "Whole year" : seasonShort(se).replace(/^./, c => c.toUpperCase())}`;
    const L = state.last, busy = pending || state.status === "loading";
    const n = triesNow(), count = n ? ` \u00b7 ${n} question${n === 1 ? "" : "s"} tried` : "";
    let t;
    if (busy) t = `${base} \u00b7 Updating\u2026`;
    else if (state.status === "error") t = `${base} \u00b7 Could not run`;
    else if (L && !L.W.tooShort && state.status === "ready") t = `${signed(L.W.A_an.sen.slopePerDecade, 2)} ${U(L.R.v.units)} per decade \u00b7 Exploratory${count}`;
    else if (L && L.W.tooShort) t = `${base} \u00b7 Too few years to test`;
    else t = `${base} \u00b7 Updating\u2026`;
    stripText.textContent = t;
  }
  const seeBar = strip;

  // ======================================================== layout
  const replayNote = h("div", { hidden: true });
  const panelHead = (id, title, sub) => h("div", { class: "panel-head" }, h("h2", { id: id + "-h", tabindex: "-1" }, title), sub ? h("p", { class: "muted small" }, sub) : null);
  const placeNode = h("div", { class: "place-body" }, presetPills, wm.node, boxLabel, planNote, placeHint,
    h("details", { class: "quiet" }, h("summary", {}, "Type the four edges instead"), boxRow, err));
  const builder = h("section", { class: "builder", "aria-label": "Question builder" },
    h("div", { class: "panel", id: "panel-measure" }, panelHead("panel-measure", "Measurement"), measureBody),
    h("div", { class: "panel", id: "panel-place" }, panelHead("panel-place", "Place"), placeNode),
    h("div", { class: "panel", id: "panel-period" }, panelHead("panel-period", "Period"), periodBody), seeBar);
  root.append(head, replayNote, progress, launchHost, builder, resultHost, demoHost);

  // ======================================================== start-up (the satellite library manifest is read first; it is small)
  function setup() {
    buildMeasures();
    if (!M.some(v => v.src === state.src && v.key === state.key)) { Object.assign(state, { src: "power", key: "t2m", presetKey: "wisconsin", box: { ...P.find(p => p.key === "wisconsin").box }, y0: 1981, y1: 2025, season: "all" }); }
    let replayOk = false;
    const replay = parseReplay(query);
    if (replay) { // a replay link wins over whatever this tab was doing: apply the valid parts, rerun only when all are valid
      const o = replay.out;
      if (o.v) { state.src = o.v.src; state.key = o.v.key; }
      if (o.y0) { state.y0 = o.y0; state.y1 = o.y1; state.keepFlagged = !!(o.v && pastQuality(o.v, o.y1)); } if (o.season) state.season = o.season; if (o.box) state.box = { ...o.box };
      state.last = null; state.result = null; state.status = "idle"; runId++;
      replayOk = !replay.bad.length;
      if (!replayOk) { replayNote.hidden = false; replayNote.replaceChildren(h("p", { class: "callout", role: "note" }, h("b", {}, "This link could not be fully read. "), `The ${(replay.bad.length > 1 ? replay.bad.slice(0, -1).join(", ") + " and " + replay.bad[replay.bad.length - 1] : replay.bad[0])} in it could not be used, so we kept your earlier choice there. Check the settings; the result below follows them.`)); }
    }
    if (curVar().src === "power" && isWorld(state.box)) state.box = { ...P.find(p => p.key === "wisconsin").box };
    clampYears(); wm.setBox(state.box); for (const k of "nswe") inputs[k].value = state.box[k];
    drawHeader(); drawProgress(); drawMeasure(); drawPlace(""); drawPeriod(); drawDemoCard(); updateStrip();
    built = true;
    if (state.last && !replay) { drawResult(); return; } // coming back to the page in the same tab: show the last result again
    drawResult();
    run(); // the first result counts when it is displayed, like any other
  }
  if (libVars) setup(); else { resultHost.replaceChildren(h("p", { class: "muted loading" }, "Loading the NASA data library list.")); loadLibrary().then(v => { libVars = v; setup(); }); }
  return { node: root, title: "Investigate a question", dispose() { killSpiral(); clearTimeout(timer); runId++; if (ctl) { ctl.abort(); ctl = null; } } };
}
