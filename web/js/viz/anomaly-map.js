// Anomaly map: the case region on a flat map, one frame per year, smooth blend between years, fixed symmetric colour range.
// Question it answers: WHERE, and WHEN? (the globe shows where; this one lets you compare years against one fixed scale)
// render(container, data, options) -> {destroy, play, pause, seek, el, timeline}. Options: year (start index), onYear(i), smooth (default true).
import { el, sv, tok, isDark, onTheme, makeScale, legend, prepare, valueAt, timeline, controls, stageKeys, sizeObserver, clamp,
  signed, unitText, caseLine, regionalDetails, regionalMeanText, reducedMotion, nextId } from "./common.js";
import { loadGeo, tracePath, isUS } from "./geo.js";

const fmtLat = (v) => Math.abs(v).toFixed(2) + "°" + (v >= 0 ? "N" : "S");
const fmtLon = (v) => Math.abs(v).toFixed(2) + "°" + (v >= 0 ? "E" : "W");
const niceStep = (span, maxTicks) => { for (const s of [0.5, 1, 2, 5, 10, 15, 20, 30]) if (span / s <= maxTicks) return s; return 45; };

export async function render(container, data, options = {}) {
  const P = prepare(data);
  let scale = makeScale(data);
  const U = unitText(data), smooth = options.smooth !== false;
  let destroyed = false, geo = null, G = null, raf = 0, dirty = false, curT = options.year != null ? options.year : data.years.length - 1;
  const lastYi = data.years.length - 1;

  const summaryId = nextId("viz-sum");
  const yearEl = el("div", { class: "viz-map__year viz-num" }, String(data.years[Math.round(curT)]));
  const regV = el("div", { class: "viz-map__regv viz-num" }), regL = el("div", { class: "viz-map__label" }, "Regional average, difference from baseline");
  const head = el("div", { class: "viz-map__head" }, el("div", {}, yearEl, el("div", { class: "viz-map__label" }, data.measure + ", " + data.season_text)), el("div", { class: "viz-map__reg" }, regV, regL));
  const cBase = el("canvas", { "aria-hidden": "true" }), cField = el("canvas", { "aria-hidden": "true" }), cLines = el("canvas", { "aria-hidden": "true", style: "cursor:crosshair" });
  const svg = sv("svg", { "aria-hidden": "true", focusable: "false" });
  const plot = el("div", { class: "viz-map__plot viz-stage", tabindex: "0", role: "group", "aria-describedby": summaryId,
    "aria-label": `Anomaly map of ${data.region_name}. Arrow keys change the year, space plays or pauses.` }, cBase, cField, cLines, svg);
  const readout = el("p", { class: "viz-readout viz-num" }, "Point at the map or tap a cell to read its value for the year shown.");
  const summary = el("p", { class: "viz-summary", id: summaryId, "aria-live": "polite" });
  const tl = timeline({ n: data.years.length, stepMs: 900, start: curT, onFrame: (tv) => { curT = tv; schedule(); }, onState, onIndex: () => ctl.sync() });
  const ctl = controls(tl, { n: data.years.length, labelFn: (i) => String(data.years[i]), name: "year", showYear: false });
  const note = el("p", { class: "viz-note" }, `${data.product_label}. Colours blend smoothly between years; each pixel is interpolated from cells of ${data.grid.dlat}°, so read values from the legend, not from single edges.`);
  const root = el("figure", { class: "viz viz-anomaly-map" }, head, plot, ctl.node, legend(data, scale), readout, summary, regionalDetails(data, undefined, "map view"), note);
  container.append(root);

  // ---------------------------------------------------------------- geometry (CSS pixels)
  function geometry() {
    const b = P.bbox, padLon = (b.e - b.w) * 0.06, padLat = (b.n - b.s) * 0.06;
    const box = { w: b.w - padLon, e: b.e + padLon, s: b.s - padLat, n: b.n + padLat };
    const k = Math.max(0.2, Math.cos(((box.s + box.n) / 2) * Math.PI / 180));
    const ML = 46, MT = 6, MB = 26, MR = 8, avail = Math.max(240, plot.clientWidth || container.clientWidth || 640);
    const aspect = ((box.e - box.w) * k) / (box.n - box.s);
    let pw = avail - ML - MR, ph = pw / aspect;
    const maxH = Math.max(300, Math.min(640, window.innerHeight * 0.72));
    if (ph > maxH) { ph = maxH; pw = ph * aspect; }
    const x0 = ML + (avail - ML - MR - pw) / 2;
    return (G = { box, ML: x0, MT, pw, ph, W: avail, H: MT + ph + MB, dpr: Math.min(2, window.devicePixelRatio || 1),
      X: (lon) => (lon - box.w) / (box.e - box.w) * pw, Y: (lat) => (box.n - lat) / (box.n - box.s) * ph });
  }
  function layout() {
    geometry();
    plot.style.height = G.H + "px";
    for (const c of [cBase, cField, cLines]) {
      c.width = Math.round(G.pw * G.dpr); c.height = Math.round(G.ph * G.dpr);
      c.style.left = G.ML + "px"; c.style.top = G.MT + "px"; c.style.width = G.pw + "px"; c.style.height = G.ph + "px";
    }
    drawStatic(); drawAxes(); paint();
  }
  function drawStatic() {
    const d = G.dpr, X = (lon) => G.X(lon) * d, Y = (lat) => G.Y(lat) * d, dark = isDark();
    let g = cBase.getContext("2d");
    g.clearRect(0, 0, cBase.width, cBase.height);
    g.fillStyle = tok("ocean", "#DCE5E8"); g.fillRect(0, 0, cBase.width, cBase.height);
    if (geo) { g.beginPath(); tracePath(g, geo.land, X, Y, G.box, 2); g.fillStyle = tok("land", "#F7F2E4"); g.fill(); }
    g = cLines.getContext("2d");
    g.clearRect(0, 0, cLines.width, cLines.height);
    if (!geo) return;
    g.lineJoin = "round";
    g.beginPath(); tracePath(g, geo.countries, X, Y, G.box, 2); g.strokeStyle = tok("border", "#8E8878"); g.globalAlpha = 0.7; g.lineWidth = 0.8 * d; g.stroke();
    if (isUS(data.region_box) && geo.states.length) { g.beginPath(); tracePath(g, geo.states, X, Y, G.box, 2); g.globalAlpha = 0.6; g.lineWidth = 0.7 * d; g.stroke(); }
    g.globalAlpha = 1; g.beginPath(); tracePath(g, geo.land, X, Y, G.box, 2); g.strokeStyle = tok("coast", "#6F6A5A"); g.lineWidth = 1.1 * d; g.stroke();
    // frame
    g.strokeStyle = tok("line", "#C9C3B5"); g.lineWidth = d; g.strokeRect(d / 2, d / 2, cLines.width - d, cLines.height - d);
    void dark;
  }
  function drawAxes() {
    svg.replaceChildren();
    svg.setAttribute("width", G.W); svg.setAttribute("height", G.H); svg.setAttribute("viewBox", `0 0 ${G.W} ${G.H}`);
    const b = G.box, ls = niceStep(b.n - b.s, 5), os = niceStep(b.e - b.w, 7), muted = "t-muted num";
    for (let la = Math.ceil(b.s / ls) * ls; la <= b.n; la += ls) {
      const y = G.MT + G.Y(la); svg.append(sv("line", { x1: G.ML - 4, x2: G.ML, y1: y, y2: y, stroke: tok("edge", "#7D7868"), "stroke-width": 1 }), sv("text", { x: G.ML - 8, y: y + 4, "text-anchor": "end", class: muted, "font-size": 12 }, Math.abs(la) + "°" + (la < 0 ? "S" : la > 0 ? "N" : "")));
    }
    for (let lo = Math.ceil(b.w / os) * os; lo <= b.e; lo += os) {
      const x = G.ML + G.X(lo); svg.append(sv("line", { x1: x, x2: x, y1: G.MT + G.ph, y2: G.MT + G.ph + 4, stroke: tok("edge", "#7D7868"), "stroke-width": 1 }), sv("text", { x, y: G.MT + G.ph + 18, "text-anchor": "middle", class: muted, "font-size": 12 }, Math.abs(lo) + "°" + (lo < 0 ? "W" : lo > 0 ? "E" : "")));
    }
  }

  // ---------------------------------------------------------------- field raster
  const small = document.createElement("canvas"), mask = document.createElement("canvas"), tmp = document.createElement("canvas");
  small.width = mask.width = P.nx; small.height = mask.height = P.ny;
  const sCtx = small.getContext("2d"), mCtx = mask.getContext("2d");
  const img = sCtx.createImageData(P.nx, P.ny), mimg = mCtx.createImageData(P.nx, P.ny);
  for (let iy = 0; iy < P.ny; iy++) for (let ix = 0; ix < P.nx; ix++) { const has = P.grid[iy * P.nx + ix] >= 0; const o = ((P.ny - 1 - iy) * P.nx + ix) * 4; mimg.data[o + 3] = has ? 255 : 0; }
  mCtx.putImageData(mimg, 0, 0);
  const vals = new Float32Array(P.nx * P.ny);

  function fieldPixels(t) {
    vals.fill(NaN);
    for (let iy = 0; iy < P.ny; iy++) for (let ix = 0; ix < P.nx; ix++) { const ci = P.grid[iy * P.nx + ix]; if (ci >= 0) vals[iy * P.nx + ix] = valueAt(P, t, ci); }
    // fill gaps from valid neighbours so the smooth blend does not fade at coast edges (the hard mask is re-applied afterwards)
    for (let pass = 0; pass < 2; pass++) {
      const nxt = vals.slice();
      for (let iy = 0; iy < P.ny; iy++) for (let ix = 0; ix < P.nx; ix++) {
        const i = iy * P.nx + ix; if (!Number.isNaN(vals[i])) continue;
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const jy = iy + dy, jx = ix + dx; if (jy < 0 || jx < 0 || jy >= P.ny || jx >= P.nx) continue; const v = vals[jy * P.nx + jx]; if (!Number.isNaN(v)) { s += v; n++; } }
        if (n) nxt[i] = s / n;
      }
      vals.set(nxt);
    }
    for (let iy = 0; iy < P.ny; iy++) for (let ix = 0; ix < P.nx; ix++) {
      const v = vals[iy * P.nx + ix], c = scale.rgb(Number.isNaN(v) ? 0 : v), o = ((P.ny - 1 - iy) * P.nx + ix) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    sCtx.putImageData(img, 0, 0);
  }
  function schedule() { if (!dirty) { dirty = true; raf = requestAnimationFrame(paint); } }
  function paint() {
    dirty = false; if (destroyed || !G) return;
    const t = curT, d = G.dpr;
    fieldPixels(t);
    const b = P.bbox, dx = G.X(b.w) * d, dy = G.Y(b.n) * d, dw = (G.X(b.e) - G.X(b.w)) * d, dh = (G.Y(b.s) - G.Y(b.n)) * d;
    if (tmp.width !== cField.width || tmp.height !== cField.height) { tmp.width = cField.width; tmp.height = cField.height; }
    const tg = tmp.getContext("2d"); tg.globalCompositeOperation = "source-over"; tg.clearRect(0, 0, tmp.width, tmp.height);
    tg.imageSmoothingEnabled = smooth; tg.imageSmoothingQuality = "high";
    // keep the half-cell border sharp: draw the raster so cell centres sit on their true positions
    tg.drawImage(small, dx, dy, dw, dh);
    tg.globalCompositeOperation = "destination-in"; tg.imageSmoothingEnabled = false; tg.drawImage(mask, dx, dy, dw, dh);
    const fg = cField.getContext("2d"); fg.clearRect(0, 0, cField.width, cField.height); fg.globalAlpha = 0.94; fg.drawImage(tmp, 0, 0); fg.globalAlpha = 1;
    const yi = Math.round(t); yearEl.textContent = String(data.years[yi]);
    const rv = data.regional.anomaly[yi]; regV.textContent = rv == null ? "n/a" : signed(rv, 2) + " " + U;
  }

  // ---------------------------------------------------------------- reading a cell
  function readAt(clientX, clientY) {
    if (!G) return;
    const r = cLines.getBoundingClientRect(), px = (clientX - r.left) / r.width, py = (clientY - r.top) / r.height;
    const lon = G.box.w + px * (G.box.e - G.box.w), lat = G.box.n - py * (G.box.n - G.box.s);
    const ix = Math.round((lon - P.lo0) / data.grid.dlon), iy = Math.round((lat - P.la0) / data.grid.dlat);
    const i = ix >= 0 && ix < P.nx && iy >= 0 && iy < P.ny ? P.grid[iy * P.nx + ix] : -1, yi = tl.index;
    if (i < 0) { readout.textContent = `${fmtLat(lat)}, ${fmtLon(lon)}: outside the cells of this case.`; return; }
    const v = P.A[yi * P.nC + i];
    readout.textContent = `${fmtLat(P.lat[i])}, ${fmtLon(P.lon[i])}, ${data.years[yi]}: ${Number.isNaN(v) ? "no value this year" : signed(v, 2) + " " + U + " from this cell's own baseline"}.`;
  }
  cLines.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") readAt(e.clientX, e.clientY); });
  cLines.addEventListener("pointerdown", (e) => readAt(e.clientX, e.clientY));

  function onState() {
    ctl.sync();
    const yi = tl.index;
    summary.textContent = `${caseLine(data)}. ${data.years[yi]}: regional average ${regionalMeanText(data, yi)}. The colour range is the same in every year (±${data.scale.max} ${U}), so years can be compared directly.`;
    options.onYear && options.onYear(yi);
  }

  // ---------------------------------------------------------------- start
  geo = await loadGeo({ states: isUS(data.region_box) }).catch(() => null);
  if (destroyed) return null;
  layout(); onState(); stageKeys(plot, tl);
  const offSize = sizeObserver(plot, () => { if (!destroyed) layout(); });
  const offTheme = onTheme(() => { scale = makeScale(data); const lg = root.querySelector(".viz-legend"); if (lg) lg.replaceWith(legend(data, scale)); drawStatic(); drawAxes(); schedule(); });
  if (options.autoplay && !reducedMotion()) tl.play();
  void lastYi;
  return { el: root, play: () => tl.play(), pause: () => tl.pause(), seek: (i) => tl.seek(i), timeline: tl, destroy() { destroyed = true; cancelAnimationFrame(raf); tl.destroy(); offSize(); offTheme(); root.remove(); } };
}
