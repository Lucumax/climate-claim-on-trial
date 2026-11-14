// Anomaly map ("Values over time"): the case region on a flat map, one frame per year, fixed symmetric colour range.
// Question it answers: WHAT CHANGED WHEN? (the hearing map answers WHERE the tests flag evidence; the ruling never changes with this view)
// Every square is one grid cell coloured by its own value for the year shown. There is no spatial smoothing. While playing, colours blend
// between two years; paused, each cell shows that year exactly. Cells with no value that year stay visible as hatched grey.
// render(container, data, options) -> {destroy, play, pause, seek, el, timeline}.
// Options: year (start index), onYear(i), view (a basemap.js view: the docket passes one so this map and the hearing map share one frame),
//          width (plot width when no view is given), autoplay (never used by the site).
import { el, sv, tok, onTheme, makeScale, legend, prepare, timeline, controls, stageKeys, sizeObserver, clamp, signed, unitText, endpoints,
  caseLine, regionalDetails, regionalMeanText, reducedMotion, nextId } from "./common.js";
import { makeView, basemapLayers, frameLayer } from "../basemap.js";

const fmtLat = (v) => Math.abs(v).toFixed(2) + "°" + (v >= 0 ? "N" : "S");
const fmtLon = (v) => Math.abs(v).toFixed(2) + "°" + (v >= 0 ? "E" : "W");

/** The frame both docket maps use: the case region with some context around it, fitted into the given plot width. */
export function caseFrame(data, plotWidth, maxHeight = 460) {
  const b = data.region_box, spanLon = b.e - b.w, spanLat = b.n - b.s;
  const pad = Math.min(spanLon, spanLat) < 10 ? 0.35 : 0.08;               // small regions (Wisconsin) get more surrounding geography
  const box = { w: b.w - spanLon * pad, e: b.e + spanLon * pad, s: Math.max(-89, b.s - spanLat * pad), n: Math.min(89, b.n + spanLat * pad) };
  return makeView(box, { width: Math.max(200, plotWidth), maxHeight });
}

export async function render(container, data, options = {}) {
  const P = prepare(data);
  let scale = makeScale(data);
  const U = unitText(data), ends = endpoints(data), nY = data.years.length;
  let destroyed = false, raf = 0, dirty = false, curT = options.year != null ? options.year : nY - 1, selected = -1, id = nextId("avm");
  let view = options.view || caseFrame(data, (options.width || container.clientWidth || 640) - 60);

  const summaryId = nextId("viz-sum");
  const whatEl = el("div", { class: "viz-map__what" }, data.measure, el("small", {}, data.region_name.replace(/^./, (c) => c.toUpperCase()) + " · " + data.season_text));
  const yearEl = el("div", { class: "viz-map__year viz-num" }), regV = el("div", { class: "viz-map__regv viz-num" });
  const head = el("div", { class: "viz-map__head" }, whatEl,
    el("div", {}, el("div", { class: "viz-map__label" }, "Year"), yearEl),
    el("div", { class: "viz-map__reg" }, el("div", { class: "viz-map__label" }, "Regional average vs baseline"), regV));
  const cField = el("canvas", { "aria-hidden": "true", style: "cursor:crosshair" });
  const under = sv("svg", { class: "viz-bm", "aria-hidden": "true", focusable: "false" }), over = sv("svg", { class: "viz-bm", "aria-hidden": "true", focusable: "false" });
  const plot = el("div", { class: "viz-map__plot viz-stage", tabindex: "0", role: "group", "aria-describedby": summaryId,
    "aria-label": `Values over time for ${data.region_name}. Arrow keys change the year, space plays or pauses.` }, under, cField, over);
  const readout = el("p", { class: "viz-readout viz-num", "aria-live": "off" }, "Point at the map or tap a cell to read its value for the year shown.");
  const summary = el("p", { class: "viz-summary", id: summaryId, "aria-live": "polite" });
  const tl = timeline({ n: nY, stepMs: 900, start: curT, onFrame: (tv) => { curT = tv; schedule(); }, onState, onIndex: () => { ctl.sync(); updateReadout(); } });
  const ctl = controls(tl, { n: nY, labelFn: (i) => String(data.years[i]), name: "year", showYear: false });
  const note = el("p", { class: "viz-note" }, `${data.product_label}. Each square is one grid cell (${data.grid.dlat}° × ${data.grid.dlon}°) coloured by its own difference from its own baseline; nothing is smoothed in space. While playing, colours blend from one year to the next; paused, each cell shows that year exactly. Hatched grey: no value that year.`);
  const lg = () => legend(data, scale);
  let legendEl = lg();
  const colA = el("div", { class: "viz-col-a" }, plot, legendEl);
  const colB = el("div", { class: "viz-col-b" }, ctl.node, readout, summary, regionalDetails(data, undefined, "values over time"), note);
  const root = el("figure", { class: "viz viz-anomaly-map" }, head, el("div", { class: "viz-split" }, colA, colB));
  container.append(root);

  // ---------------------------------------------------------------- frame and cells
  let layers = null;
  function layout() {
    plot.style.width = view.W + "px"; plot.style.height = view.H + "px";
    for (const s of [under, over]) { s.setAttribute("width", view.W); s.setAttribute("height", view.H); s.setAttribute("viewBox", `0 0 ${view.W.toFixed(0)} ${view.H.toFixed(0)}`); }
    under.replaceChildren(); over.replaceChildren();
    layers = basemapLayers(view, { states: true, id });
    under.append(layers.defs, layers.under); over.append(layers.over, frameLayer(view, { label: data.region_name.replace(/^./, (c) => c.toUpperCase()) }));
    const d = Math.min(2, window.devicePixelRatio || 1);
    cField.width = Math.round(view.pw * d); cField.height = Math.round(view.ph * d);
    cField.style.left = view.ML + "px"; cField.style.top = view.MT + "px"; cField.style.width = view.pw + "px"; cField.style.height = view.ph + "px";
    paint();
  }
  const dlat = data.grid.dlat, dlon = data.grid.dlon;
  function cellValue(t, i) {                         // exact when paused; blended only between two years that both have values
    const y0 = clamp(Math.floor(t), 0, nY - 1), y1 = Math.min(nY - 1, y0 + 1), f = t - y0;
    const a = P.A[y0 * P.nC + i], b = P.A[y1 * P.nC + i];
    if (f < 0.002 || y1 === y0) return a;
    if (f > 0.998) return b;
    if (Number.isNaN(a) || Number.isNaN(b)) return f < 0.5 ? a : b;
    return a + (b - a) * f;
  }
  function schedule() { if (!dirty) { dirty = true; raf = requestAnimationFrame(paint); } }
  function paint() {
    dirty = false; if (destroyed) return;
    const d = cField.width / view.pw, g = cField.getContext("2d"), t = curT;
    g.clearRect(0, 0, cField.width, cField.height);
    const X = (lon) => Math.round((view.X(lon) - view.ML) * d), Y = (lat) => Math.round((view.Y(lat) - view.MT) * d);
    const hatch = [], cellPx = Math.abs(view.X(P.lon[0] + dlon) - view.X(P.lon[0]));
    for (let i = 0; i < P.nC; i++) {
      const v = cellValue(t, i), x0 = X(P.lon[i] - dlon / 2), x1 = X(P.lon[i] + dlon / 2), y0 = Y(P.lat[i] + dlat / 2), y1 = Y(P.lat[i] - dlat / 2);
      if (Number.isNaN(v)) { g.fillStyle = tok("nodata", "#F0EEE6"); g.fillRect(x0, y0, x1 - x0, y1 - y0); hatch.push([x0, y0, x1, y1]); continue; }
      g.fillStyle = scale.css(v); g.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
    if (hatch.length) { g.beginPath(); for (const [x0, y0, x1, y1] of hatch) { g.moveTo(x0, y1); g.lineTo(x1, y0); } g.strokeStyle = tok("nodata-mark", "#6D777C"); g.lineWidth = d; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1; }
    if (cellPx >= 9) {                                // fine cell edges only where cells are big enough to carry them
      g.beginPath(); g.strokeStyle = tok("surface", "#FFFDF7"); g.globalAlpha = 0.35; g.lineWidth = d * 0.6;
      for (let i = 0; i < P.nC; i++) { const x0 = X(P.lon[i] - dlon / 2), x1 = X(P.lon[i] + dlon / 2), y0 = Y(P.lat[i] + dlat / 2), y1 = Y(P.lat[i] - dlat / 2); g.rect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0); }
      g.stroke(); g.globalAlpha = 1;
    }
    if (selected >= 0) {
      const x0 = X(P.lon[selected] - dlon / 2), x1 = X(P.lon[selected] + dlon / 2), y0 = Y(P.lat[selected] + dlat / 2), y1 = Y(P.lat[selected] - dlat / 2);
      g.lineWidth = 2.5 * d; g.strokeStyle = tok("surface", "#FFFDF7"); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.lineWidth = 1.5 * d; g.strokeStyle = tok("ink", "#192D40"); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    const yi = Math.round(t); yearEl.textContent = String(data.years[yi]);
    const rv = data.regional.anomaly[yi]; regV.textContent = rv == null ? "n/a" : signed(rv, 2) + " " + U;
  }

  // ---------------------------------------------------------------- reading a cell
  function cellAt(clientX, clientY) {
    const r = cField.getBoundingClientRect(), px = (clientX - r.left) / r.width, py = (clientY - r.top) / r.height;
    const lon = view.box.w + px * (view.box.e - view.box.w), lat = view.box.n - py * (view.box.n - view.box.s);
    const ix = Math.round((lon - P.lo0) / dlon), iy = Math.round((lat - P.la0) / dlat);
    return { lat, lon, i: ix >= 0 && ix < P.nx && iy >= 0 && iy < P.ny ? P.grid[iy * P.nx + ix] : -1 };
  }
  function updateReadout() {
    const yi = tl.index;
    if (selected < 0) { readout.textContent = "Point at the map or tap a cell to read its value for the year shown."; return; }
    const v = P.A[yi * P.nC + selected];
    readout.textContent = `${fmtLat(P.lat[selected])}, ${fmtLon(P.lon[selected])}, ${data.years[yi]}: ${Number.isNaN(v) ? "no value this year" : signed(v, 2) + " " + U + " from this cell's own baseline"}.`;
  }
  function pick(e) { const c = cellAt(e.clientX, e.clientY); selected = c.i; if (c.i < 0) { readout.textContent = `${fmtLat(c.lat)}, ${fmtLon(c.lon)}: outside the cells of this case.`; schedule(); return; } updateReadout(); schedule(); }
  cField.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") pick(e); });
  cField.addEventListener("pointerdown", pick);
  cField.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && selected >= 0) { selected = -1; updateReadout(); schedule(); } });

  function onState() {
    ctl.sync();
    const yi = tl.index;
    summary.textContent = `${caseLine(data)}. ${data.years[yi]}: regional average ${regionalMeanText(data, yi)}. The colour range is the same in every year (±${data.scale.max} ${U}; ${ends.lo} to ${ends.hi}), so years can be compared directly.`;
    updateReadout();
    options.onYear && options.onYear(yi);
  }

  // ---------------------------------------------------------------- start
  layout(); onState(); stageKeys(plot, tl);
  const offSize = options.view ? () => {} : sizeObserver(container, () => { if (destroyed) return; const w = (container.clientWidth || 640) - 60; if (Math.abs(w - view.pw) > 8) { view = caseFrame(data, w); layout(); } });
  const offTheme = onTheme(() => { scale = makeScale(data); const n = lg(); legendEl.replaceWith(n); legendEl = n; layout(); });
  if (options.autoplay && !reducedMotion()) tl.play();
  return { el: root, play: () => tl.play(), pause: () => tl.pause(), seek: (i) => tl.seek(i), timeline: tl, destroy() { destroyed = true; cancelAnimationFrame(raf); tl.destroy(); offSize(); offTheme(); root.remove(); } };
}
