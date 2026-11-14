// Exhibit Zero: The False-Alarm Planet. A synthetic planet with no trend in any cell, put through the same three
// tests as the case files (naive Mann-Kendall, Yue-Wang corrected, Benjamini-Hochberg). Everything is computed live in
// the browser by js/falsealarm-core.js, which calls the shipped statistics module. Rendering: globe.gl (vendored, MIT)
// on a stylised sphere, or an equal-area (Mollweide) canvas map of the same cells on phones, without WebGL, or on request.
import { h, announce, reducedMotion } from "../util.js";
import { gavelIcon } from "./common.js";
import { falseAlarmPlanet, ensembleCheck, N_CELLS, ALPHA, BH_Q } from "../falsealarm-core.js";

const DEFAULT_SEED = 93;      // a planet whose naive and corrected rates sit near the average of 120 test planets
const Q = 0, ALARM = 1, CLEARED = 2, FLASH = 3;
const fmt = (n) => Number(n).toLocaleString("en-US");
const pc = (f, d = 1) => (f * 100).toFixed(d) + "%";
const oneIn = (count, total) => (count > 0 ? "1 in " + fmt(Math.max(1, Math.round(total / count))) : "none");
const plural = (n, one, many) => (n === 1 ? one : many);
const RUNG = [
  { id: 1, name: "The naive test", short: "Naive", what: "Mann-Kendall trend test, p < 0.05, treating every year as independent." },
  { id: 2, name: "The memory-corrected test", short: "Corrected", what: "The same test with the Yue-Wang correction for year-to-year memory, p < 0.05." },
  { id: 3, name: "Field-wide control", short: "FDR", what: "Benjamini-Hochberg at q = " + BH_Q.toFixed(2) + " across all cells, using the corrected p-values." },
];

// ------------------------------------------------------------------------------------------ globe library (lazy)
let globeLib = null;
function loadGlobeLib() {
  if (globeLib) return globeLib;
  globeLib = new Promise((resolve, reject) => {
    if (window.Globe) return resolve(window.Globe);
    const sc = document.createElement("script");
    sc.src = "vendor/globe.gl.min.js";
    sc.onload = () => (window.Globe ? resolve(window.Globe) : reject(new Error("globe.gl did not start")));
    sc.onerror = () => reject(new Error("globe.gl could not be loaded"));
    document.head.append(sc);
  });
  globeLib.catch(() => { globeLib = null; });
  return globeLib;
}
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return hex;
  const v = parseInt(m[1], 16); return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}
const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim() || "#888";
function palette() {
  return { alarm: tok("bad"), flash: tok("accent"), cleared: hexA(tok("accent"), 0.6), quiet: tok("edge"), land: tok("land"), ocean: tok("ocean"), line: tok("line"), ink: tok("ink"), muted: tok("muted"), accent: tok("accent") };
}

// ------------------------------------------------------------------------------------------ published validation
function interp(rows, phi, key) {
  const a = rows.slice().sort((x, y) => x.phi - y.phi);
  if (phi <= a[0].phi) return a[0][key];
  for (let i = 1; i < a.length; i++) if (phi <= a[i].phi + 1e-9) {
    const lo = a[i - 1], hi = a[i], w = (phi - lo.phi) / (hi.phi - lo.phi);
    return lo[key] + w * (hi[key] - lo[key]);
  }
  return a[a.length - 1][key];
}
function publishedFor(val, phi, n) {
  if (!val) return null;
  const lengths = [25, 45];
  const nUse = lengths.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  const rows = val.regional.filter((r) => r.n === nUse);
  const exactPhi = rows.some((r) => Math.abs(r.phi - phi) < 1e-9);
  const cellRows = val.cells.filter((r) => r.n === nUse);
  return {
    n: nUse, exactN: nUse === n, exactPhi,
    naive: interp(rows, phi, "naive"), corrected: interp(rows, phi, "corrected"),
    naiveSE: interp(rows, phi, "naive_se"), correctedSE: interp(rows, phi, "corrected_se"),
    reps: rows[0].reps,
    bhAny: cellRows.length ? interp(cellRows, phi, "bh_any_corrected") : null, bhFields: cellRows.length ? cellRows[0].fields : null,
    byLength: lengths.map((L) => { const rr = val.regional.filter((r) => r.n === L); return { n: L, naive: interp(rr, phi, "naive"), corrected: interp(rr, phi, "corrected") }; }),
  };
}

// ------------------------------------------------------------------------------------------ the view
// "Same trap, other fields": one compact strip below the ruling. Plain statements of well-known practice; no data and no logos.
function sameTrap() {
  const cell = (field, text) => h("div", { class: "strip-cell" }, h("p", { class: "eyebrow" }, field), h("p", { class: "strip-text" }, text));
  return h("section", { class: "fields-strip", "aria-labelledby": "fa-trap-h" }, h("h2", { id: "fa-trap-h" }, "Same trap, other fields"),
    h("div", { class: "strip" },
      cell("Finance", "Try enough trading strategies on the same past prices and one will look like a winner, by luck alone."),
      cell("Medicine", "A trial that checks 20 outcomes can show one that looks significant by chance alone."),
      cell("Tech", "An A/B test stopped the moment it looks good will “win” more often than 1 time in 20 when nothing changed.")));
}

// opts.preview: the compact Home version. It keeps the stage, the computed counts, the legend and the three test selectors, starts at the finished
// naive test, and leaves out the docket, the ensemble check and the controls. destroy() is returned for the caller; it does not listen for navigation.
export function falseAlarm(opts = {}) {
  const preview = !!opts.preview;
  const reduced = reducedMotion();
  const webgl = hasWebGL();
  const st = {
    seed: DEFAULT_SEED, phi: 0.45, n: 25,
    stage: 0, shown: { stage: 0, p: 1 }, playing: false,
    res: null, computing: false, computeMs: null,
    view: window.innerWidth < 700 || !webgl ? "flat" : "globe",
    rotate: !reduced && !preview, ens: null, ensRunning: null, val: null,
  };
  const refs = {};
  let globe = null, globeReady = false, globeFailed = false, token = 0, cancelFlag = { cancelled: false }, ensFlag = { cancelled: false };
  let rafId = 0, ensTimer = 0, sliderTimer = 0, destroyed = false, settleTimer = 0, wakeTimer = 0, lastGlobeDraw = 0;
  let rank = null, state = new Uint8Array(N_CELLS), flat = null, io = null, ro = null, mo = null, mq = null;

  // -------------------------------------------------------------- state of one cell at a given stage
  function stateAt(i, stage) {
    if (!st.res || stage === 0) return Q;
    const f = st.res.flags;
    if (f[stage - 1][i]) return ALARM;
    for (let k = 0; k < stage - 1; k++) if (f[k][i]) return CLEARED;
    return Q;
  }
  function computeFrame() {
    const { stage, p } = st.shown;
    let live = 0;
    if (!st.res) { state.fill(Q); return 0; }
    const N = st.res.N;
    for (let i = 0; i < N; i++) {
      const to = stateAt(i, stage), from = stateAt(i, stage - 1 < 0 ? 0 : stage - 1);
      let s;
      if (p >= 1 || stage === 0 || to === from) s = to;
      else if (rank[i] < p - 0.12) s = to;
      else if (rank[i] < p) s = FLASH;
      else s = from;
      state[i] = s;
      if (s === ALARM || s === FLASH) live++;
    }
    return live;
  }
  function countsNow(live) {
    // flagged count per rung for the rail; the rung on the bench shows the live count while animating
    const c = st.res ? st.res.counts : [0, 0, 0];
    const out = [null, null, null], s = st.shown;
    for (let k = 1; k <= 3; k++) {
      if (k < s.stage || (k === s.stage && s.p >= 1)) out[k - 1] = c[k - 1];
      else if (k === s.stage) out[k - 1] = live;
    }
    return out;
  }

  // -------------------------------------------------------------- DOM
  const N = N_CELLS;
  const title = h("h1", { id: "page-title", tabindex: "-1" }, "Exhibit Zero: The False-Alarm Planet");
  const chipSynth = h("span", { class: "chip warn" }, "Synthetic");
  const heading = h("div", { class: "case-heading" },
    h("div", { class: "case-number" }, h("strong", {}, "0"), h("span", {}, "Exhibit")),
    h("div", {}, h("p", { class: "eyebrow brass" }, "Before we judge real claims"), title,
      h("p", { class: "definition" }, h("b", {}, "The question. "), "If a planet has no trend at all, how many of its places will a trend test still call significant? We built that planet, ran the tests on it, and counted.")),
    h("div", { class: "case-meta" }, h("b", {}, "Planet Null"), "Every cell has zero true trend. Any cell the tests flag is a false alarm.", h("br"), chipSynth, " ", h("span", { class: "chip neutral" }, "Seed ", h("span", { id: "fa-seed-chip" }, String(st.seed)))));

  // rail: the three rungs as buttons (order of hearings)
  const railBtns = [], railNum = [], railBar = [], railDelta = [], railStatus = [];
  const railList = h("ol", { class: "hearing-list" }, RUNG.map((r, i) => {
    const num = h("strong", {}, "–"), bar = h("i", { style: "width:0%" }), delta = h("span", { class: "delta" }, ""), status = h("span", { class: "status" }, "Waiting");
    const b = h("button", { type: "button", class: "hearing", onclick: () => chooseStage(i + 1) },
      h("span", { class: "hearing-top" }, h("span", {}, "Rung " + r.id), status),
      h("span", { class: "hearing-h" }, h("span", { class: "full" }, r.name), h("span", { class: "short" }, r.short)), h("p", { class: "explain" }, r.what),
      h("span", { class: "hearing-result" }, num, h("span", { class: "mini-bar", "aria-hidden": "true" }, bar), delta));
    railBtns.push(b); railNum.push(num); railBar.push(bar); railDelta.push(delta); railStatus.push(status);
    return h("li", {}, b);
  }));
  const rail = h("aside", { class: "hearings fa-rail", "aria-labelledby": "fa-hearings-h" },
    h("div", { class: "hearings-head" }, h("p", { class: "eyebrow" }, "Three tests, one change each"), h("h2", { id: "fa-hearings-h" }, "Order of hearings")), railList,
    h("p", { class: "hearing-note" }, "Share of all cells flagged. A later rung can also flag a cell an earlier rung did not, because each rung uses a different cut. We show whichever happens."));

  // stage
  refs.headline = h("p", { class: "fa-headline", "aria-hidden": "true" });
  refs.sub = h("p", { class: "fa-sub", "aria-hidden": "true" });
  refs.globeEl = h("div", { class: "fa-globe", "aria-hidden": "true" });
  refs.canvas = h("canvas", { class: "fa-flat", role: "img", "aria-label": "Map of the synthetic planet" });
  refs.stage = h("div", { class: "fa-stage" },
    h("span", { class: "fa-badge" }, "Synthetic: every cell has zero true trend"), refs.globeEl, refs.canvas, h("p", { class: "fa-status", role: "status" }, ""));
  refs.status = refs.stage.querySelector(".fa-status");
  refs.readout = h("p", { class: "readout fa-readout", "aria-hidden": "true" }, "");

  // controls
  const outPhi = h("output", { for: "fa-phi" }, st.phi.toFixed(2)), outN = h("output", { for: "fa-n" }, String(st.n));
  refs.phi = h("input", { type: "range", id: "fa-phi", min: "0", max: "0.6", step: "0.05", value: String(st.phi), "aria-describedby": "fa-phi-help",
    oninput: (e) => { st.phi = Number(e.target.value); outPhi.textContent = st.phi.toFixed(2); e.target.setAttribute("aria-valuetext", phiText(st.phi)); dirty(); } });
  refs.n = h("input", { type: "range", id: "fa-n", min: "15", max: "60", step: "5", value: String(st.n), "aria-describedby": "fa-n-help",
    oninput: (e) => { st.n = Number(e.target.value); outN.textContent = String(st.n); e.target.setAttribute("aria-valuetext", st.n + " years"); dirty(); } });
  refs.phi.setAttribute("aria-valuetext", phiText(st.phi)); refs.n.setAttribute("aria-valuetext", st.n + " years");
  refs.seed = h("input", { type: "number", id: "fa-seed", min: "1", max: "999999", step: "1", value: String(st.seed), onchange: (e) => { const v = Math.max(1, Math.min(999999, Math.floor(Number(e.target.value) || 1))); e.target.value = String(v); st.seed = v; dirty(true); } });
  refs.newBtn = h("button", { type: "button", class: "btn-quiet", onclick: () => { st.seed = 1 + Math.floor(Math.random() * 99999); refs.seed.value = String(st.seed); dirty(true); } }, "New planet");
  refs.playBtn = h("button", { type: "button", class: "btn", onclick: () => (reduced ? chooseStage(st.stage >= 3 ? 1 : st.stage + 1) : play()) }, reduced ? "Next test" : "Play the trial");
  refs.rotBtn = h("button", { type: "button", class: "btn-quiet", "aria-pressed": String(st.rotate), onclick: () => { st.rotate = !st.rotate; applyRotate(); } }, "");
  const viewSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Map style" }, [["globe", "Globe"], ["flat", "Flat map (equal area)"]].map(([v, l]) =>
    h("label", {}, h("input", { type: "radio", name: "fa-view", value: v, checked: st.view === v, disabled: v === "globe" && !webgl ? true : null, onchange: () => setView(v) }), h("span", {}, l))));
  refs.viewSeg = viewSeg;
  const controls = h("div", { class: "fa-controls" },
    h("div", { class: "fa-slider" }, h("label", { for: "fa-phi" }, "Year-to-year memory (persistence) ", outPhi), refs.phi,
      h("p", { id: "fa-phi-help", class: "muted small" }, "0 means every year is independent. At 0.45 a warm year makes a warm next year more likely.")),
    h("div", { class: "fa-slider" }, h("label", { for: "fa-n" }, "Record length, years ", outN), refs.n,
      h("p", { id: "fa-n-help", class: "muted small" }, "Every cell gets this many yearly values (15 to 60).")),
    h("div", { class: "fa-row" }, h("div", { class: "fa-seedbox" }, h("label", { for: "fa-seed" }, "Seed"), refs.seed), refs.newBtn, refs.playBtn, refs.rotBtn),
    h("div", { class: "fa-row" }, viewSeg));

  // legend
  const legend = h("div", { class: "legend fa-legend" },
    h("span", { class: "legend-item" }, h("i", { class: "fa-key alarm", "aria-hidden": "true" }), "False alarm: flagged as a trend by the test on the bench"),
    h("span", { class: "legend-item" }, h("i", { class: "fa-key cleared", "aria-hidden": "true" }), "Cleared: flagged by an earlier test, not flagged now"),
    h("span", { class: "legend-item" }, h("i", { class: "fa-key quiet", "aria-hidden": "true" }), "Quiet: never flagged"));

  refs.summary = h("p", { class: "fa-summary" });
  refs.tableBtn = h("button", { type: "button", class: "btn-quiet", "aria-expanded": "false", "aria-controls": "fa-table", onclick: toggleTable }, "Show the data table");
  refs.tableBox = h("div", { id: "fa-table", class: "fa-tablebox", hidden: true });

  const exhibit = h("section", { class: "panel", "aria-labelledby": "fa-ex-h" },
    h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit 0"), h("h2", { id: "fa-ex-h" }, "Planet Null")), refs.exTag = h("span", { class: "tag" }, "Not yet tested")),
    refs.headline, refs.sub, refs.stage, refs.readout, controls, legend, refs.summary,
    h("p", { class: "muted small" }, "Neighbouring cells share some of their weather noise, so false alarms come in patches. That is exactly what a real regional trend would look like, which is why the test results alone cannot tell you which one you are seeing."),
    h("div", { class: "fa-tablebar" }, refs.tableBtn), refs.tableBox);

  // ruling column
  refs.rulingTitle = h("h2", { id: "fa-ruling-h" }, "");
  refs.rulingStamp = h("div", { class: "stamp" }, "");
  refs.rulingBody = h("div", {});
  const ruling = h("section", { class: "panel ruling", role: "status", "aria-labelledby": "fa-ruling-h" },
    h("div", { class: "ruling-head" }, h("p", { class: "eyebrow" }, "The ruling"), gavelIcon()), refs.rulingTitle, refs.rulingStamp, refs.rulingBody);
  refs.leak = h("section", { class: "panel record", "aria-labelledby": "fa-leak-h" });
  refs.check = h("section", { class: "panel record", "aria-labelledby": "fa-check-h" });
  const tipBox = h("div", { class: "tip" }, h("b", {}, "Detective tip"), h("p", {}, "A flagged cell is not a finding. Before you believe a map of significant places, ask what the same test does to a planet where nothing changed."));
  const rulingColumn = h("div", { class: "ruling-column" }, ruling, refs.leak, refs.check, tipBox);

  // the compact version: the three tests on the left, the planet with its headline, count and legend on the right
  const previewRail = h("aside", { class: "hearings fa-rail", "aria-label": "Choose a test" }, railList);
  const previewStage = h("div", { class: "fa-prev-main" }, refs.headline, refs.sub, refs.stage, refs.readout, legend, refs.summary);
  const node = preview
    ? h("div", { class: "fa-view fa-preview fa-pending" }, h("div", { class: "workspace fa-prev-ws" }, previewRail, previewStage))
    : h("div", { class: "fa-view fa-pending" },
      h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Exhibit 0"), heading,
      h("div", { class: "workspace" }, rail, h("div", { class: "exhibits" }, exhibit, sameTrap()), rulingColumn));

  // stylesheet: load it with the view, show the page when it is ready
  const css = document.querySelector('link[data-fa-css]') || Object.assign(document.createElement("link"), { rel: "stylesheet", href: "css/falsealarm.css" });
  const reveal = () => node.classList.remove("fa-pending");
  if (!css.isConnected) { css.setAttribute("data-fa-css", ""); css.addEventListener("load", reveal); css.addEventListener("error", reveal); document.head.append(css); } else reveal();

  function phiText(v) { return v === 0 ? "0, no memory" : v.toFixed(2) + (v >= 0.45 ? ", strong memory" : v >= 0.25 ? ", moderate memory" : ", weak memory"); }

  // -------------------------------------------------------------- compute
  function dirty(now) {
    cancelFlag.cancelled = true; ensFlag.cancelled = true; clearTimeout(sliderTimer); clearTimeout(ensTimer);
    st.ens = null; st.ensRunning = null;
    document.getElementById("fa-seed-chip") && (document.getElementById("fa-seed-chip").textContent = String(st.seed));
    stopAnim();
    setStatus("Growing the planet", true);
    sliderTimer = setTimeout(compute, now ? 20 : 220);
  }
  async function compute() {
    if (destroyed) return;
    const my = ++token;
    cancelFlag = { cancelled: false };
    const t0 = performance.now();
    st.computing = true;
    let res = null;
    try {
      res = await falseAlarmPlanet({ seed: st.seed, phi: st.phi, n: st.n, signal: cancelFlag, onProgress: (f) => { if (my === token) setStatus("Testing every cell: " + Math.round(f * 100) + "%", true); } });
    } catch (e) { console.error(e); setStatus("The test could not run: " + (e && e.message || e), true); st.computing = false; return; }
    if (!res || my !== token || destroyed) return;
    st.computeMs = performance.now() - t0; st.res = res; st.computing = false;
    if (!rank) { rank = new Float32Array(N); let a = 12345; for (let i = 0; i < N; i++) { a = (a * 1664525 + 1013904223) >>> 0; rank[i] = a / 4294967296; } }
    setStatus("", false);
    document.getElementById("fa-seed-chip") && (document.getElementById("fa-seed-chip").textContent = String(st.seed));
    prepareFlat(); if (!preview) { renderLeak(); renderCheck(); }
    if (globe) { globe.pointsData(cellObjs()); }
    if (!st.firstDone && !reduced && !preview) { st.firstDone = true; st.stage = 0; st.shown = { stage: 0, p: 1 }; render(true); play(); return; }
    st.firstDone = true;
    const s = st.stage === 0 ? (reduced || preview ? 1 : 3) : st.stage;
    st.stage = s; st.shown = { stage: s, p: 1 };
    render(true); settle();
  }
  function setStatus(msg, busy) {
    if (!refs.status) return;
    refs.status.textContent = msg;
    refs.status.classList.toggle("on", !!msg);
    refs.stage.setAttribute("aria-busy", busy ? "true" : "false");
  }
  function cellObjs() {
    const L = st.res.L, a = new Array(L.N);
    for (let i = 0; i < L.N; i++) a[i] = { i, lat: L.lat[i], lng: L.lon[i] };
    return a;
  }

  // -------------------------------------------------------------- animation
  function stopAnim() { cancelAnimationFrame(rafId); st.playing = false; }
  function chooseStage(s) {
    if (!st.res) return;
    stopAnim(); st.stage = s; st.shown = { stage: s, p: 1 }; render(true); settle(); 
    const b = railBtns[s - 1]; if (b && document.activeElement !== b && !reduced) { /* keep focus where it is */ }
  }
  function play() {
    if (!st.res) return;
    stopAnim();
    const segs = [{ d: 800, stage: 0 }, { d: 2300, stage: 1, anim: 1 }, { d: 1300, stage: 1 }, { d: 1700, stage: 2, anim: 1 }, { d: 1300, stage: 2 }, { d: 1500, stage: 3, anim: 1 }];
    const total = segs.reduce((a, s) => a + s.d, 0);
    const t0 = performance.now();
    st.playing = true; st.stage = 0; st.shown = { stage: 0, p: 1 };
    updateRuling();
    wake(total + 500);
    const frame = (now) => {
      if (destroyed || !st.playing) return;
      const e = now - t0;
      if (e >= total) { st.playing = false; st.stage = 3; st.shown = { stage: 3, p: 1 }; render(true); settle(); return; }
      let acc = 0;
      for (const sg of segs) {
        if (e < acc + sg.d) {
          const p = sg.anim ? Math.min(1, (e - acc) / sg.d) : 1;
          if (st.stage !== sg.stage) { st.stage = sg.stage; st.shown = { stage: sg.stage, p }; updateRuling(); }
          st.stage = sg.stage; st.shown = { stage: sg.stage, p };
          break;
        }
        acc += sg.d;
      }
      render(false);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------- rendering
  function render(full) {
    const live = computeFrame();
    drawCells(full);
    updateRail(live);
    updateHeadline(live);
    if (full) { updateRuling(); updateRailStatusFinal(); }
    refs.playBtn.disabled = !st.res;
  }
  function updateRail(live) {
    const c = st.res ? st.res.counts : [0, 0, 0], cn = countsNow(live), s = st.shown;
    RUNG.forEach((r, i) => {
      const k = i + 1, v = cn[i];
      const heard = k < s.stage || (k === s.stage);
      railNum[i].textContent = v == null ? "–" : pc(v / N, 1);
      railBar[i].style.width = v == null ? "0%" : Math.min(100, (v / N) * 100 * 4) + "%";   // bar is scaled x4 so small shares stay visible
      let d = "";
      if (v != null) {
        d = fmt(v) + " cells";
        if (k > 1 && cn[i - 1] != null) { const diff = v - cn[i - 1]; d += diff === 0 ? ", no change" : ", " + (diff < 0 ? "−" : "+") + fmt(Math.abs(diff)); }
      }
      railDelta[i].textContent = d;
      railBtns[i].setAttribute("aria-current", s.stage === k ? "step" : "false");
      if (s.stage !== k) railBtns[i].removeAttribute("aria-current");
      railStatus[i].textContent = s.stage === k ? "● On the bench" : k < s.stage ? "✓ Heard" : "Waiting";
      railBtns[i].setAttribute("aria-label", `Rung ${k}: ${r.name}. ${v == null ? "Not heard yet" : fmt(c[i]) + " of " + fmt(N) + " cells flagged"}.`);
    });
  }
  function updateRailStatusFinal() { /* kept for symmetry: statuses are set in updateRail */ }
  function updateHeadline(live) {
    const s = st.shown, c = st.res ? st.res.counts : [0, 0, 0];
    let big = "", sub = "";
    if (!st.res) { big = "Growing Planet Null."; sub = ""; }
    else if (s.stage === 0) { big = "Planet Null has no trend anywhere."; sub = "Press Play the trial, or choose a test on the left."; }
    else {
      const v = s.p >= 1 ? c[s.stage - 1] : live;
      if (s.stage === 1) { big = "The naive test cries wolf on " + (s.p >= 1 ? oneIn(v, N) : "…") + " cells."; sub = `${fmt(v)} of ${fmt(N)} cells flagged as a trend (p < 0.05). There is no trend to find.`; }
      if (s.stage === 2) { big = "With the memory correction: " + (s.p >= 1 ? oneIn(v, N) : "…") + " cells."; sub = `${fmt(v)} of ${fmt(N)} cells still flagged. Most of the alarms went dark.`; }
      if (s.stage === 3) { big = s.p >= 1 ? (v === 0 ? "No cell survives all three tests." : `${fmt(v)} of ${fmt(N)} cells survive all three tests.`) : "Checking every cell together…"; sub = `Benjamini-Hochberg, q = ${BH_Q.toFixed(2)}. Each survivor is still a false alarm.`; }
    }
    refs.headline.textContent = big; refs.sub.textContent = sub;
    refs.exTag.textContent = s.stage === 0 ? "Not yet tested" : `Rung ${s.stage} of 3: ${RUNG[s.stage - 1].name}`;
    document.getElementById("fa-seed-chip") && (document.getElementById("fa-seed-chip").textContent = String(st.seed));
  }

  function resultText() {
    const r = st.res; if (!r) return "";
    const [a, b, c] = r.counts;
    return `Planet Null, seed ${st.seed}: ${fmt(N)} cells, ${st.n} years each, persistence ${st.phi.toFixed(2)}. No cell has any true trend. ` +
      `The naive test flags ${fmt(a)} cells (${pc(a / N)}, ${oneIn(a, N)}). With the memory correction it flags ${fmt(b)} (${pc(b / N)}, ${oneIn(b, N)}). ` +
      `After Benjamini-Hochberg at q = ${BH_Q.toFixed(2)} it flags ${fmt(c)} (${pc(c / N, 2)}). Every flag is a false alarm.`;
  }
  function updateRuling() {
    const r = st.res, s = st.shown.stage;
    refs.summary.textContent = r ? resultText() : "";
    refs.canvas.setAttribute("aria-label", r ? resultText() : "Map of the synthetic planet");
    if (st.playing) { refs.rulingTitle.textContent = "The court is hearing the tests"; refs.rulingStamp.textContent = st.shown.stage ? "Rung " + st.shown.stage + " on the bench" : "Planet Null enters the court"; refs.rulingBody.replaceChildren(h("p", {}, "Watch the red cells. Each one is a place where a test claims to see a trend on a planet that has none.")); return; }
    if (!r) { refs.rulingTitle.textContent = "Ruling pending"; refs.rulingStamp.textContent = "Planet is being grown"; refs.rulingBody.replaceChildren(); return; }
    const [a, b, c] = r.counts;
    const body = [];
    if (s <= 1) {
      refs.rulingTitle.textContent = s === 0 ? "No test has been heard" : `Interim: ${fmt(a)} false alarms so far`;
      refs.rulingStamp.textContent = s === 0 ? "Pending" : "After rung 1 only";
      body.push(h("p", {}, h("b", {}, s === 0 ? "Planet Null was built with no trend in any cell." : `The naive test flagged ${fmt(a)} of ${fmt(N)} cells (${pc(a / N)}).`)));
      body.push(h("p", {}, "It treats each year as a fresh, independent draw. Years that follow warm years are not independent, so it is far too easy to impress. " + (s === 0 ? "Every flag it raises will be false." : `${fmt(r.nAup)} of the flags look like warming and ${fmt(r.nAdown)} like cooling. All are noise.`)));
    } else if (s === 2) {
      refs.rulingTitle.textContent = `Interim: ${fmt(b)} false alarms so far`; refs.rulingStamp.textContent = "After rung 2";
      body.push(h("p", {}, h("b", {}, `The memory correction cut ${fmt(a)} flags to ${fmt(b)} (${pc(b / N)}).`)));
      body.push(h("p", {}, b / N > 0.075 ? `That is still more than the 5% a fair test promises. With ${st.n} years the test cannot measure the memory well enough to correct it fully.` : "That is close to the 5% a fair test promises."));
    } else {
      refs.rulingTitle.textContent = `Ruling on Planet Null: ${fmt(c)} false ${plural(c, "alarm survives", "alarms survive")}`; refs.rulingStamp.textContent = "Final, after rung 3";
      body.push(h("p", {}, h("b", {}, `The naive test flagged ${fmt(a)} of ${fmt(N)} cells. The memory correction left ${fmt(b)}. Benjamini-Hochberg left ${fmt(c)}.`)));
      body.push(h("p", {}, `This planet was built with no trend, so every one of those is false. Together the tests removed ${pc(1 - c / Math.max(1, a), 1)} of the naive alarms and left ${fmt(c)}.`));
      const p = pubNow();
      if (p && p.bhAny != null) body.push(h("p", { class: "caveat" }, h("b", {}, "One planet is one draw. "), `In the published check (${p.bhFields} planets like this), Benjamini-Hochberg left at least one false alarm on about ${pc(p.bhAny, 0)} of them at ${p.exactPhi ? "this memory" : "a nearby memory"}. Press New planet to see the spread.`));
      else body.push(h("p", { class: "caveat" }, h("b", {}, "One planet is one draw. "), "Press New planet to see how much the counts change from planet to planet."));
    }
    refs.rulingBody.replaceChildren(...body);
  }
  function settle() {
    updateRuling(); if (!preview) { renderLeak(); renderCheck(); }
    if (st.tableOpen) renderTable();
    const r = st.res; if (!r) return;
    const s = st.shown.stage; clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { if (s > 0) announce(`${RUNG[s - 1].name}: ${fmt(r.counts[s - 1])} of ${fmt(N)} cells flagged. ${s === 3 ? "Ruling on Planet Null: " + fmt(r.counts[2]) + " false " + plural(r.counts[2], "alarm survives", "alarms survive") + "." : ""}`); }, 400);
    if (!preview) scheduleEnsemble();
  }

  // -------------------------------------------------------------- the honest twist and the check against the validation
  function pubNow() { return publishedFor(st.val, st.phi, st.n); }
  function renderLeak() {
    const r = st.res; if (!r) return;
    const [a, b] = r.counts, p = pubNow();
    const kids = [h("h3", { id: "fa-leak-h" }, "Where the corrections leak")];
    kids.push(h("p", {}, `At memory ${st.phi.toFixed(2)} and ${st.n} years, the corrected test flagged ${pc(b / N)} of this planet's cells. A fair 5% test would flag 5%. `,
      b / N > 0.075 ? "It leaks, because a short record cannot pin down how strong the memory is." : "Here it stays close to its promise."));
    if (p) {
      const [s25, s45] = p.byLength;
      kids.push(h("p", {}, h("b", {}, "A longer record helps, slowly. "), `In the published runs at this memory, the corrected test falls from ${pc(s25.corrected)} at 25 years to ${pc(s45.corrected)} at 45 years. The naive test does not improve at all (${pc(s25.naive)} to ${pc(s45.naive)}). Slide the record length up and watch the corrected share fall while the naive share stays high.`));
    }
    kids.push(h("p", { class: "muted small" }, "These numbers are for a planet of pure noise. Real data has real trends in it as well, which is why the case files also report what is left standing after every test."));
    refs.leak.replaceChildren(...kids);
  }
  function renderCheck() {
    const r = st.res; if (!r) return;
    const [a, b, c] = r.counts, p = pubNow(), e = st.ens;
    const kids = [h("h3", { id: "fa-check-h" }, "Does it match the validation?")];
    if (!st.val) { kids.push(h("p", { class: "muted small" }, "The published validation table has not loaded.")); refs.check.replaceChildren(...kids); return; }
    const cmp = (ens, se, pub, pubSe) => {
      if (!ens || !p || !p.exactN) return "";
      const tol = 2 * Math.sqrt(se * se + pubSe * pubSe) + (p.exactPhi ? 0 : 0.01);
      return Math.abs(ens - pub) <= tol ? "agrees" : "differs";
    };
    const row = (label, mine, avg, pub, verdict) => h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, mine), h("td", {}, avg), h("td", {}, pub), h("td", {}, verdict));
    const nv = e ? cmp(e.naive, e.naiveSE, p.naive, p.naiveSE) : "", cv = e ? cmp(e.corrected, e.correctedSE, p.corrected, p.correctedSE) : "";
    const ensTxt = (v, se) => (e ? `${pc(v)} ± ${pc(se)}` : (st.ensRunning != null ? `running ${Math.round(st.ensRunning * 100)}%` : "waiting"));
    kids.push(h("p", { class: "muted small" }, "Cell flag rates on a no-trend planet, from this page's live computation and from the project's validation run (4,000 series per row, seed 101)."));
    kids.push(h("div", { class: "scroll fa-cmp", tabindex: "0", role: "region", "aria-label": "Comparison with the published validation (scrolls sideways)" }, h("table", { class: "data" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Test"), h("th", { scope: "col" }, "This planet"), h("th", { scope: "col" }, e ? `Average of ${e.R} planets` : "Average of planets"), h("th", { scope: "col" }, "Published"), h("th", { scope: "col" }, "Check"))),
      h("tbody", {},
        row("Naive", pc(a / N), ensTxt(e && e.naive, e && e.naiveSE), p ? pc(p.naive) : "n/a", nv),
        row("Memory-corrected", pc(b / N), ensTxt(e && e.corrected, e && e.correctedSE), p ? pc(p.corrected) : "n/a", cv),
        row("Benjamini-Hochberg: survivors", fmt(c) + " cells", e ? `${e.anyC} of ${e.R} planets had at least one` : (st.ensRunning != null ? "running" : "waiting"), p && p.bhAny != null ? `${pc(p.bhAny, 0)} of planets had at least one` : "n/a", "")))));
    const notes = [];
    if (p && !p.exactN) notes.push(`No published run uses ${st.n} years. The nearest, ${p.n} years, is shown for scale only.`);
    else if (p && !p.exactPhi) notes.push("The published runs use memory 0, 0.1, 0.2, 0.3, 0.45 and 0.6. The value shown is interpolated between them.");
    if (e) notes.push(`The average comes from ${e.R} fresh planets of ${e.N} cells each, the same design as the validation (spatial smoothing of 2 cells), computed just now in your browser. “agrees” means within two standard errors.`);
    if (p && p.bhAny != null) notes.push(`The published Benjamini-Hochberg figure uses ${p.bhFields} planets of 400 cells at 25 years, so it is a rough guide to the planet-level count here (this planet has ${fmt(N)} cells, so a survivor is somewhat more likely).`);
    notes.push(`Computed in this browser: ${fmt(N)} cells, ${st.n} years, 2 tests each, in ${st.computeMs != null ? (st.computeMs / 1000).toFixed(2) + " s" : "n/a"}.`);
    notes.forEach((t) => kids.push(h("p", { class: "muted small", style: "margin:6px 0 0" }, t)));
    refs.check.replaceChildren(...kids);
  }
  function scheduleEnsemble() {
    clearTimeout(ensTimer); ensFlag.cancelled = true;
    if (!st.res) return;
    ensTimer = setTimeout(runEnsemble, st.playing ? 3000 : 500);
  }
  async function runEnsemble() {
    if (destroyed) return;
    if (st.playing) { ensTimer = setTimeout(runEnsemble, 1200); return; }
    ensFlag = { cancelled: false };
    const my = ensFlag, phi = st.phi, n = st.n, seedBase = 7001 + st.seed % 50 * 100;
    st.ens = null; st.ensRunning = 0; renderCheck();
    let res = null;
    try { res = await ensembleCheck({ phi, n, R: n <= 30 ? 30 : 14, seed0: seedBase, signal: my, onProgress: (f) => { st.ensRunning = f; if (!my.cancelled && Math.round(f * 20) % 2 === 0) renderCheck(); } }); } catch (e) { console.error(e); }
    if (!res || my.cancelled || destroyed) return;
    st.ens = res; st.ensRunning = null; renderCheck();
  }

  // -------------------------------------------------------------- data table
  function toggleTable() {
    st.tableOpen = !st.tableOpen;
    refs.tableBtn.setAttribute("aria-expanded", String(st.tableOpen));
    refs.tableBtn.textContent = st.tableOpen ? "Hide the data table" : "Show the data table";
    refs.tableBox.hidden = !st.tableOpen;
    if (st.tableOpen) renderTable();
  }
  function renderTable() {
    const r = st.res; if (!r) { refs.tableBox.replaceChildren(h("p", {}, "No data yet.")); return; }
    const p = pubNow();
    const [a, b, c] = r.counts;
    const t1 = h("table", { class: "data" }, h("caption", { class: "sr-only" }, "Cells flagged at each test"),
      h("thead", {}, h("tr", {}, ["Test", "Cells flagged", "Share of cells", "About 1 in", "Published share"].map((x) => h("th", { scope: "col" }, x)))),
      h("tbody", {}, [[RUNG[0].name, a, p && p.naive], [RUNG[1].name, b, p && p.corrected], [RUNG[2].name, c, null]].map(([nm, v, pub]) => h("tr", {}, h("th", { scope: "row" }, nm), h("td", {}, fmt(v)), h("td", {}, pc(v / N, 2)), h("td", {}, v ? fmt(Math.round(N / v)) : "none"), h("td", {}, pub != null ? pc(pub) : "n/a")))));
    const idx = []; for (let i = 0; i < N; i++) if (r.flags[0][i] || r.flags[1][i] || r.flags[2][i]) idx.push(i);
    idx.sort((x, y) => r.pA[x] - r.pA[y]);
    const rows = idx.slice(0, 400).map((i) => h("tr", {}, h("th", { scope: "row" }, String(i + 1)), h("td", {}, r.L.lat[i].toFixed(1)), h("td", {}, r.L.lon[i].toFixed(1)), h("td", {}, r.dir[i] > 0 ? "rising" : "falling"),
      h("td", {}, r.pA[i].toFixed(4)), h("td", {}, r.pB[i].toFixed(4)), h("td", {}, r.padj[i].toFixed(4)), h("td", {}, r.flags[2][i] ? "survives all three" : r.flags[1][i] ? "flagged by rungs 1 and 2" : r.flags[0][i] ? "cleared at rung 2" : "added at rung 2")));
    const t2 = h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Cells flagged by any test (scrolls)" }, h("table", { class: "data" }, h("caption", { class: "fa-cap" }, `Cells flagged by any test (${fmt(idx.length)}${idx.length > 400 ? ", the 400 with the smallest naive p-value" : ""}). Every one is a false alarm.`),
      h("thead", {}, h("tr", {}, ["Cell", "Lat", "Lon", "Looks like", "Naive p", "Corrected p", "BH-adjusted p", "Status"].map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows)));
    refs.tableBox.replaceChildren(h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Cells flagged at each test (scrolls sideways)" }, t1), t2);
  }

  // -------------------------------------------------------------- drawing: flat equal-area map
  function prepareFlat() {
    const L = st.res.L, nCell = L.N, th = new Float64Array(nCell);
    for (let i = 0; i < nCell; i++) {
      const phi = L.lat[i] * Math.PI / 180; let t = phi;
      for (let k = 0; k < 40; k++) { const f = 2 * t + Math.sin(2 * t) - Math.PI * Math.sin(phi), d = 2 + 2 * Math.cos(2 * t); if (Math.abs(d) < 1e-9) break; const dt = f / d; t -= dt; if (Math.abs(dt) < 1e-10) break; }
      th[i] = t;
    }
    flat = { th, W: 0, H: 0, px: new Float32Array(nCell), py: new Float32Array(nCell), sp: 1 };
  }
  function layoutFlat() {
    const wrap = refs.stage, W = Math.max(240, Math.floor(wrap.clientWidth)), H = Math.round(W / 2);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    refs.canvas.width = Math.round(W * dpr); refs.canvas.height = Math.round(H * dpr);
    refs.canvas.style.width = W + "px"; refs.canvas.style.height = H + "px";
    flat.W = W; flat.H = H; flat.dpr = dpr;
    const m = 6, R = (W - 2 * m) / (4 * Math.SQRT2), L = st.res.L;
    for (let i = 0; i < L.N; i++) {
      const lam = L.lon[i] * Math.PI / 180;
      flat.px[i] = W / 2 + (2 * Math.SQRT2 / Math.PI) * R * lam * Math.cos(flat.th[i]);
      flat.py[i] = H / 2 - Math.SQRT2 * R * Math.sin(flat.th[i]);
    }
    flat.R = R; flat.sp = Math.sqrt(4 * Math.PI * R * R / L.N);
  }
  function drawFlat() {
    if (!flat || !st.res) return;
    const wrap = refs.stage;
    if (!flat.W || (wrap.clientWidth > 0 && flat.W !== Math.max(240, Math.floor(wrap.clientWidth)))) layoutFlat();
    const ctx = refs.canvas.getContext("2d"), pal = palette(), { W, H, R } = flat, L = st.res.L;
    ctx.setTransform(flat.dpr, 0, 0, flat.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pal.ocean; ctx.fillRect(0, 0, W, H);
    // sphere outline (Mollweide ellipse), fill and graticule
    const cx = W / 2, cy = H / 2, rx = 2 * Math.SQRT2 * R, ry = Math.SQRT2 * R;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.fillStyle = pal.land; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.clip();
    ctx.strokeStyle = pal.line; ctx.lineWidth = 1;
    const theta = (lat) => { const phi = lat * Math.PI / 180; let t = phi; for (let k = 0; k < 40; k++) { const d = 2 + 2 * Math.cos(2 * t); if (Math.abs(d) < 1e-9) break; const dt = (2 * t + Math.sin(2 * t) - Math.PI * Math.sin(phi)) / d; t -= dt; if (Math.abs(dt) < 1e-10) break; } return t; };
    for (const lat of [-60, -30, 0, 30, 60]) { const y = cy - ry * Math.sin(theta(lat)), half = rx * Math.cos(theta(lat)); ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke(); }
    for (let lon = -150; lon <= 150; lon += 30) { ctx.beginPath(); for (let la = -90; la <= 90; la += 5) { const t = theta(la), x = cx + (2 * Math.SQRT2 / Math.PI) * R * (lon * Math.PI / 180) * Math.cos(t), y = cy - ry * Math.sin(t); la === -90 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.strokeStyle = tok("edge"); ctx.lineWidth = 1.2; ctx.stroke();
    // cells: quiet first, then cleared rings, then alarms on top
    const sp = flat.sp;
    ctx.globalAlpha = 0.55; ctx.fillStyle = pal.quiet;
    for (let i = 0; i < L.N; i++) if (state[i] === Q) { ctx.beginPath(); ctx.arc(flat.px[i], flat.py[i], Math.max(0.9, sp * 0.2), 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = pal.cleared; ctx.lineWidth = 1.1;
    for (let i = 0; i < L.N; i++) if (state[i] === CLEARED) { ctx.beginPath(); ctx.arc(flat.px[i], flat.py[i], Math.max(1.4, sp * 0.42), 0, 6.2832); ctx.stroke(); }
    ctx.fillStyle = pal.flash;
    for (let i = 0; i < L.N; i++) if (state[i] === FLASH) { ctx.beginPath(); ctx.arc(flat.px[i], flat.py[i], Math.max(2, sp * 0.8), 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = pal.alarm;
    for (let i = 0; i < L.N; i++) if (state[i] === ALARM) { ctx.beginPath(); ctx.arc(flat.px[i], flat.py[i], Math.max(1.6, sp * 0.55), 0, 6.2832); ctx.fill(); }
  }

  // -------------------------------------------------------------- drawing: globe
  function applyRotate() {
    refs.rotBtn.setAttribute("aria-pressed", String(st.rotate));
    refs.rotBtn.textContent = reduced ? "Rotation off (reduced motion)" : st.rotate ? "Pause rotation" : "Resume rotation";
    refs.rotBtn.disabled = reduced || st.view !== "globe";
    if (globe) { const c = globe.controls(); c.autoRotate = st.rotate && !reduced; wake(st.rotate ? 0 : 800); }
  }
  function wake(ms) {
    if (!globe) return;
    try { globe.resumeAnimation(); } catch (e) { /* not ready */ }
    clearTimeout(wakeTimer);
    if (!(st.rotate && !reduced) && !st.playing) wakeTimer = setTimeout(() => { if (!st.playing && !(st.rotate && !reduced) && globe) { try { globe.pauseAnimation(); } catch (e) { /* ignore */ } } }, Math.max(ms, 600));
    else if (ms) wakeTimer = setTimeout(() => wake(0), ms);
  }
  const GCOL = () => { const p = palette(); return [p.quiet, p.alarm, p.cleared, p.flash]; };
  const GALT = [0.004, 0.045, 0.008, 0.07], GRAD = [0.5, 1.05, 0.7, 1.25];
  function drawGlobe(force) {
    if (!globe || !globeReady || !st.res) return;
    const now = performance.now();
    if (!force && now - lastGlobeDraw < 40) return;
    lastGlobeDraw = now;
    const col = GCOL(), s = state;
    globe.pointColor((d) => col[s[d.i]]).pointAltitude((d) => GALT[s[d.i]]).pointRadius((d) => GRAD[s[d.i]]);
    wake(600);
  }
  function drawCells(full) { if (st.view === "flat") drawFlat(); else drawGlobe(full); }
  function themeGlobe() {
    if (!globe) return;
    const pal = palette();
    globe.globeMaterial().color.set(pal.land);
    globe.atmosphereColor(pal.accent);
    globe.pathColor(() => pal.line);
    drawGlobe(true);
  }
  async function setView(v) {
    st.view = v;
    node.dataset.view = v;
    refs.stage.dataset.view = v;
    refs.readout.textContent = v === "flat" ? "Move over or tap the map to read a cell." : "Hover a cell to read its p-values. Drag to turn the globe.";
    applyRotate();
    if (v === "flat") { refs.stage.classList.add("is-flat"); refs.stage.classList.remove("is-globe"); if (globe) { try { globe.pauseAnimation(); } catch (e) { /* ignore */ } } layoutFlat && flat && layoutFlat(); drawFlat(); return; }
    refs.stage.classList.add("is-globe"); refs.stage.classList.remove("is-flat");
    await ensureGlobe();
    if (globe) { sizeGlobe(); wake(800); drawGlobe(true); }
  }
  function sizeGlobe() {
    if (!globe) return;
    const w = Math.max(240, refs.stage.clientWidth), hgt = Math.max(260, refs.stage.clientHeight);
    globe.width(w).height(hgt);
  }
  async function ensureGlobe() {
    if (globe || globeFailed) return;
    setStatus("Loading the globe", true);
    try {
      const Globe = await loadGlobeLib();
      if (destroyed) return;
      const g = Globe()(refs.globeEl);
      const pal = palette();
      g.backgroundColor("rgba(0,0,0,0)").showAtmosphere(true).atmosphereColor(pal.accent).atmosphereAltitude(0.16);
      g.globeMaterial().color.set(pal.land);
      g.pointOfView({ lat: 22, lng: -30, altitude: preview ? 1.75 : 2.15 });
      const c = g.controls(); c.enableZoom = false; c.enablePan = false; c.autoRotate = st.rotate && !reduced; c.autoRotateSpeed = 0.55;
      g.pointsData([]).pointLat("lat").pointLng("lng").pointResolution(5).pointsMerge(false).pointsTransitionDuration(0)
        .pointLabel((d) => cellLabel(d.i));
      const lines = [];
      for (const lat of [-60, -30, 0, 30, 60]) { const a = []; for (let lon = -180; lon <= 180; lon += 6) a.push([lat, lon]); lines.push(a); }
      for (let lon = -180; lon < 180; lon += 30) { const a = []; for (let lat = -90; lat <= 90; lat += 6) a.push([lat, lon]); lines.push(a); }
      g.pathsData(lines).pathPoints((d) => d).pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathPointAlt(() => 0.001).pathColor(() => pal.line).pathStroke(null).pathTransitionDuration(0);
      globe = g; globeReady = true;
      if (st.res) g.pointsData(cellObjs());
      setStatus("", false);
      sizeGlobe(); applyRotate(); drawGlobe(true);
      refs.globeEl.addEventListener("pointerdown", () => wake(2500)); refs.globeEl.addEventListener("pointermove", () => wake(1500));
    } catch (e) {
      console.error(e); globeFailed = true; setStatus("", false);
      refs.status.textContent = "The globe could not be loaded, so the flat map is shown."; refs.status.classList.add("on");
      const flatRadio = viewSeg.querySelector('input[value="flat"]'); if (flatRadio) flatRadio.checked = true;
      const gr = viewSeg.querySelector('input[value="globe"]'); if (gr) gr.disabled = true;
      setView("flat");
    }
  }
  function cellLabel(i) {
    const r = st.res; if (!r) return "";
    return `<div class="fa-tip">Cell ${i + 1}, lat ${r.L.lat[i].toFixed(1)}, lon ${r.L.lon[i].toFixed(1)}<br>naive p ${r.pA[i].toFixed(3)}, corrected p ${r.pB[i].toFixed(3)}<br>${r.flags[0][i] ? "flagged by the naive test" : "not flagged"}${r.flags[2][i] ? "; survives all three" : ""}</div>`;
  }

  // flat-map readout
  refs.canvas.addEventListener("pointermove", (e) => {
    if (!st.res || !flat) return;
    const rc = refs.canvas.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
    let best = -1, bd = (flat.sp * 1.6) ** 2;
    for (let i = 0; i < st.res.N; i++) { const dx = flat.px[i] - x, dy = flat.py[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    refs.readout.textContent = best < 0 ? "Move over or tap the map to read a cell." : `Cell ${best + 1}: lat ${st.res.L.lat[best].toFixed(1)}, lon ${st.res.L.lon[best].toFixed(1)}. Naive p ${st.res.pA[best].toFixed(3)}, corrected p ${st.res.pB[best].toFixed(3)}. ${st.res.flags[0][best] ? "Flagged by the naive test." : "Not flagged."}${st.res.flags[2][best] ? " Survives all three." : ""}`;
  });

  // -------------------------------------------------------------- life cycle
  function destroy() {
    if (destroyed) return; destroyed = true;
    stopAnim(); clearTimeout(sliderTimer); clearTimeout(ensTimer); clearTimeout(settleTimer); clearTimeout(wakeTimer);
    cancelFlag.cancelled = true; ensFlag.cancelled = true;
    if (io) io.disconnect(); if (ro) ro.disconnect(); if (mo) mo.disconnect();
    if (mq && mq.removeEventListener) mq.removeEventListener("change", themeAll);
    window.removeEventListener("hashchange", onHash);
    if (preview && node.isConnected) node.remove();
    if (globe) { try { globe.pauseAnimation(); globe._destructor && globe._destructor(); } catch (e) { /* ignore */ } globe = null; }
  }
  function onHash() { if (!/^#\/false-alarm/.test(location.hash)) destroy(); }
  function themeAll() { if (st.view === "flat") drawFlat(); else themeGlobe(); }
  if (!preview) window.addEventListener("hashchange", onHash);

  // start once attached
  queueMicrotask(() => {
    applyRotate();
    refs.stage.classList.add(st.view === "flat" ? "is-flat" : "is-globe");
    node.dataset.view = st.view;
    refs.readout.textContent = st.view === "flat" ? "Move over or tap the map to read a cell." : "Hover a cell to read its p-values. Drag to turn the globe.";
    updateRail(0); updateHeadline(0); updateRuling();
    mo = new MutationObserver(themeAll); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)"); if (mq && mq.addEventListener) mq.addEventListener("change", themeAll);
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (destroyed) return; if (st.view === "flat") { if (flat) { layoutFlat(); drawFlat(); } } else { sizeGlobe(); wake(600); } }); ro.observe(refs.stage); }
    if (window.IntersectionObserver) { io = new IntersectionObserver((en) => { if (!globe || st.view !== "globe") return; if (en[0].isIntersecting) wake(500); else { try { globe.pauseAnimation(); } catch (e) { /* ignore */ } } }); io.observe(refs.stage); }
    if (!preview) fetch("data/false_alarm_validation.json").then((r) => r.json()).then((v) => { st.val = v; if (st.res) { renderLeak(); renderCheck(); updateRuling(); if (st.tableOpen) renderTable(); } }).catch((e) => console.error(e));
    if (st.view === "globe") ensureGlobe().then(() => { applyRotate(); });
    compute();
  });

  return { title: "Exhibit Zero: The False-Alarm Planet", node, destroy };
}
