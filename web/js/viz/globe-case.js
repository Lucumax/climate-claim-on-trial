// Globe of a case: the real cells of the case, colored by their yearly difference from baseline, on a muted NASA Blue Marble.
// Question it answers: WHERE is it changing?
// render(container, data, options) -> {destroy, play, pause, seek, setFlat, el}.
// Rendering: globe.gl (vendored, MIT) with the cells painted into the globe texture (one canvas, smooth year-to-year blend);
// the flat map paints the same cells into a 2D canvas. Phones, reduced motion and no-WebGL use the flat map first.
// Options: flat (true/false, default: flat on narrow screens or without WebGL), year (start index), onYear(i), hero (Home: compact controls, no flat toggle).
// The globe starts paused and never rotates by itself; Play moves through the years, Reset view returns to the framed region.
import { WEB, el, tok, isDark, onTheme, makeScale, legend, prepare, valueAt, timeline, controls, stageKeys, sizeObserver,
  clamp, signed, plain, unitText, caseLine, regionalDetails, regionalMeanText, reducedMotion, nextId } from "./common.js";
import { loadGeo, tracePath, isUS } from "./geo.js";

const IMG_URL = WEB + "vendor/blue-marble-4096.webp";
const DUMMY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let globeLib = null;
function loadGlobeLib() {
  if (window.Globe) return Promise.resolve(window.Globe);
  if (!globeLib) {
    globeLib = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = WEB + "vendor/globe.gl.min.js";
      sc.onload = () => (window.Globe ? resolve(window.Globe) : reject(new Error("globe.gl did not start")));
      sc.onerror = () => reject(new Error("globe.gl could not be loaded"));
      document.head.append(sc);
    });
    globeLib.catch(() => { globeLib = null; });
  }
  return globeLib;
}
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } };
const loadImage = (url) => new Promise((res) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
const fmtLat = (v) => Math.abs(v).toFixed(2) + "°" + (v >= 0 ? "N" : "S");
const fmtLon = (v) => Math.abs(v).toFixed(2) + "°" + (v >= 0 ? "E" : "W");

export async function render(container, data, options = {}) {
  const P = prepare(data);
  let scale = makeScale(data);
  const narrow = () => container.clientWidth < 700;
  const reduce = reducedMotion();
  const webgl = hasWebGL();
  let flat = options.flat != null ? !!options.flat : (narrow() || !webgl || reduce);
  if (!webgl) flat = true;
  let selected = -1, destroyed = false, globe = null, tex = null, texCanvas = null, texCtx = null, baseTex = null, baseFlat = null;
  let geo = null, img = null, flatView = null, raf = 0, dirty = false;
  const U = unitText(data);
  const lastYi = data.years.length - 1;
  const stats = { lastPaintMs: 0 };

  // ---------------------------------------------------------------- DOM
  const summaryId = nextId("viz-sum");
  const stage = el("div", { class: "viz-stage viz-stage--stage", tabindex: "0", role: "group", "aria-describedby": summaryId,
    "aria-label": `Map of ${data.region_name}. Arrow keys change the year, space plays or pauses.`, style: "height:" + (options.height || "clamp(320px,56vw,620px)") });
  const host = el("div", { style: "position:absolute;inset:0" });
  const flatCanvas = el("canvas", { "aria-hidden": "true", style: "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);cursor:crosshair" });
  stage.append(host, flatCanvas);
  const readout = el("p", { class: "viz-readout viz-num", "aria-live": "polite" }, "Click or tap a cell to read its value for the year shown.");
  const summary = el("p", { class: "viz-summary", id: summaryId, "aria-live": "polite" });
  const flatBtn = options.hero ? null : el("button", { type: "button", class: "viz-btn", "aria-pressed": String(flat), onclick: () => setFlat(!flat) }, "Flat map");
  const resetBtn = el("button", { type: "button", class: "viz-btn", onclick: () => fitCamera(true) }, "Reset view");
  let curT = options.year != null ? options.year : lastYi;
  const tl = timeline({ n: data.years.length, stepMs: 820, start: curT, onFrame: (tv) => { curT = tv; schedule(); }, onState: onState, onIndex: () => { ctl.sync(); updateReadout(); } });
  const ctl = controls(tl, { n: data.years.length, labelFn: (i) => String(data.years[i]), name: "year", extra: [flatBtn, resetBtn].filter(Boolean) });
  const credit = options.hero ? null : el("p", { class: "viz-note" }, "Earth imagery: NASA Earth Observatory / Blue Marble (public domain), muted so the data stands out. Coastlines: Natural Earth. Squares are the case's own grid cells, drawn at their true size; the thin line marks the sampled region.");
  const lg = () => legend(data, scale, options.hero ? { caption: `${data.measure}, ${unitText(data)}, difference from each cell's own ${data.baseline.years[0]}–${data.baseline.years[1]} average.` } : {});
  const root = el("figure", { class: "viz viz-globe" }, stage, options.caption || null, lg(), ctl.node, options.hero ? null : readout, summary, options.hero ? null : regionalDetails(data, undefined, "globe view"), credit);
  if (options.hero) summary.className = "sr-only", readout.className = "sr-only";
  container.append(root);

  // ---------------------------------------------------------------- composition (shared by globe texture and flat map)
  const world = (W, H) => ({ W, H, lon0: -180, lon1: 180, lat0: -90, lat1: 90 });
  const X = (v, lon) => ((lon - v.lon0) / (v.lon1 - v.lon0)) * v.W, Y = (v, lat) => ((v.lat1 - lat) / (v.lat1 - v.lat0)) * v.H;

  function makeBase(v) {
    const c = document.createElement("canvas"); c.width = Math.round(v.W); c.height = Math.round(v.H);
    const g = c.getContext("2d"), dark = isDark();
    g.fillStyle = tok("ocean", "#DCE5E8"); g.fillRect(0, 0, c.width, c.height);
    if (img) {
      const sx = ((v.lon0 + 180) / 360) * img.naturalWidth, sw = ((v.lon1 - v.lon0) / 360) * img.naturalWidth;
      const sy = ((90 - v.lat1) / 180) * img.naturalHeight, sh = ((v.lat1 - v.lat0) / 180) * img.naturalHeight;
      g.filter = dark ? "grayscale(0.75) brightness(0.62) contrast(0.8)" : "grayscale(0.7) brightness(0.92) contrast(0.62)";
      g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      g.filter = "none";
      g.fillStyle = dark ? "rgba(10,20,29,0.42)" : "rgba(222,230,233,0.62)"; g.fillRect(0, 0, c.width, c.height);   // flatten the bright Arctic whites into the ocean tone
    }
    if (geo) {
      const pxDeg = v.W / (v.lon1 - v.lon0), box = { w: v.lon0, e: v.lon1, s: v.lat0, n: v.lat1 };
      const fx = (lon) => X(v, lon), fy = (lat) => Y(v, lat);
      if (!img) { g.beginPath(); tracePath(g, geo.land, fx, fy, box); g.fillStyle = tok("land", "#F7F2E4"); g.fill(); }
      g.lineJoin = "round";
      g.beginPath(); tracePath(g, geo.countries, fx, fy, box);
      g.strokeStyle = dark ? "rgba(190,201,206,0.38)" : "rgba(60,58,48,0.34)"; g.lineWidth = Math.max(0.8, 0.035 * pxDeg); g.stroke();
      if (isUS(data.region_box) && geo.states.length) {
        g.beginPath(); tracePath(g, geo.states, fx, fy, box);
        g.strokeStyle = dark ? "rgba(190,201,206,0.3)" : "rgba(60,58,48,0.28)"; g.lineWidth = Math.max(0.7, 0.03 * pxDeg); g.stroke();
      }
      g.beginPath(); tracePath(g, geo.land, fx, fy, box);
      g.strokeStyle = dark ? "rgba(214,224,229,0.5)" : "rgba(40,40,32,0.62)"; g.lineWidth = Math.max(0.9, 0.05 * pxDeg); g.stroke();
    }
    return c;
  }

  function paintCells(g, v, t) {
    const { dlat, dlon } = data.grid, hw = ((dlon / (v.lon1 - v.lon0)) * v.W) / 2, hh = ((dlat / (v.lat1 - v.lat0)) * v.H) / 2;
    const dark = isDark(), m = scale.max;
    for (let i = 0; i < P.nC; i++) {
      const val = valueAt(P, t, i); const c = scale.rgb(val); if (!c) continue;
      const a = flat ? 0.9 : 0.62 + 0.34 * Math.min(1, Math.abs(val) / m);
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
      const x0 = Math.round(X(v, P.lon[i]) - hw), x1 = Math.round(X(v, P.lon[i]) + hw), y0 = Math.round(Y(v, P.lat[i]) - hh), y1 = Math.round(Y(v, P.lat[i]) + hh);
      g.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));      // shared rounded edges: no overlap, no seams
    }
    const b = P.bbox, bx0 = X(v, b.w), bx1 = X(v, b.e), by0 = Y(v, b.n), by1 = Y(v, b.s);        // fine boundary of the sampled region
    g.lineWidth = Math.max(1, v.W / 2400); g.strokeStyle = dark ? "rgba(244,237,222,0.9)" : "rgba(25,45,64,0.85)"; g.setLineDash([]); g.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
    if (selected >= 0) {
      const x = X(v, P.lon[selected]), y = Y(v, P.lat[selected]);
      g.lineWidth = Math.max(1.5, v.W / 1400); g.strokeStyle = dark ? "#F4EDDE" : "#192D40"; g.strokeRect(x - hw, y - hh, 2 * hw, 2 * hh);
    }
  }

  let texCap = 4096, lastPaintAt = 0, slow = 0;
  function texSize() { return Math.min(texCap, container.clientWidth >= 700 || options.hero ? 4096 : 2048); }
  // If frames arrive slowly while playing (weak GPU), halve the texture once; the map stays correct, only a little softer.
  function watchSpeed() {
    const now = performance.now();
    if (tl.playing && lastPaintAt && now - lastPaintAt > 140) slow++; else if (!tl.playing || now - lastPaintAt < 90) slow = 0;
    lastPaintAt = now;
    if (slow >= 6 && texCanvas && texCanvas.width > 2048) {
      texCap = 2048; texCanvas.width = 2048; texCanvas.height = 1024; baseTex = makeBase(world(2048, 1024)); tex.dispose(); stats.downgraded = true; slow = 0;
    }
  }
  function buildBases() {
    if (!flat || globe) { const W = texSize(); baseTex = makeBase(world(W, W / 2)); }
    if (flat) { baseFlat = makeBase(flatGeometry()); }
  }
  function flatGeometry() {
    const b = P.bbox, padLon = (b.e - b.w) * 0.1, padLat = (b.n - b.s) * 0.1;
    const lon0 = b.w - padLon, lon1 = b.e + padLon, lat0 = Math.max(-90, b.s - padLat), lat1 = Math.min(90, b.n + padLat);
    const k = Math.max(0.2, Math.cos(((lat0 + lat1) / 2) * Math.PI / 180));
    const aspect = ((lon1 - lon0) * k) / (lat1 - lat0);
    const cw = stage.clientWidth || 600, maxH = Math.max(280, Math.min(620, window.innerHeight * 0.7));
    const cssW = Math.min(cw, maxH * aspect), cssH = cssW / aspect, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (flat) stage.style.height = Math.round(cssH) + "px";     // the flat map needs only its own height
    return (flatView = { W: Math.round(cssW * dpr), H: Math.round(cssH * dpr), lon0, lon1, lat0, lat1, cssW, cssH });
  }

  function schedule() { if (dirty) return; dirty = true; raf = requestAnimationFrame(paint); }
  function paint() {
    dirty = false; if (destroyed) return;
    if (flat) {
      if (!baseFlat) return;
      const v = flatView, c = flatCanvas;
      if (c.width !== v.W || c.height !== v.H) { c.width = v.W; c.height = v.H; }
      c.style.width = v.cssW + "px"; c.style.height = v.cssH + "px";
      const g = c.getContext("2d"); g.drawImage(baseFlat, 0, 0); paintCells(g, v, currentT());
    } else if (tex && baseTex) {
      watchSpeed();
      const t0 = performance.now();
      texCtx.drawImage(baseTex, 0, 0); paintCells(texCtx, world(texCanvas.width, texCanvas.height), currentT()); tex.needsUpdate = true;
      stats.lastPaintMs = Math.round((performance.now() - t0) * 10) / 10;
    }
  }
  const currentT = () => curT;

  // ---------------------------------------------------------------- globe
  async function ensureGlobe() {
    if (globe) return;
    const Globe = await loadGlobeLib(); if (destroyed) return;
    const W = texSize(); texCanvas = document.createElement("canvas"); texCanvas.width = W; texCanvas.height = W / 2; texCtx = texCanvas.getContext("2d");
    baseTex = makeBase(world(W, W / 2));
    const g = Globe({ rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" }, animateIn: false })(host)
      .width(stage.clientWidth).height(stage.clientHeight).backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl(DUMMY).showAtmosphere(true).atmosphereColor(tok("viz-atmos", "#8FB1CC")).atmosphereAltitude(0.14)
      .onGlobeClick(({ lat, lng }) => pick(lat, lng));
    globe = g;
    try { g.renderer().setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); } catch (e) { /* default ratio */ }
    const c = g.controls(); c.enablePan = false; c.autoRotate = false; c.minDistance = 110; c.maxDistance = 420; c.rotateSpeed = 0.55; c.zoomSpeed = 0.7;
    tex = await new Promise((res) => { let n = 0; const iv = setInterval(() => { const m = g.globeMaterial().map; if (m) { clearInterval(iv); res(m); } else if (++n > 150) { clearInterval(iv); res(null); } }, 25); });
    if (!tex || destroyed) return;
    tex.dispose(); tex.image = texCanvas; tex.generateMipmaps = false; tex.minFilter = 1006;
    try { tex.anisotropy = g.renderer().capabilities.getMaxAnisotropy(); } catch (e) { /* ignore */ }
    fitCamera(false);
    schedule();
    if ("IntersectionObserver" in window) { io = new IntersectionObserver((es) => { for (const e of es) { try { if (e.isIntersecting) g.resumeAnimation(); else { g.pauseAnimation(); tl.pause(); } } catch (er) { /* ignore */ } } }); io.observe(stage); }
  }
  let io = null;
  function fitCamera(animate) {
    if (!globe) return;
    const b = P.bbox, midLat = (b.s + b.n) / 2, midLon = (b.w + b.e) / 2, d2r = Math.PI / 180;
    const aspect = Math.max(0.6, (stage.clientWidth || 800) / (stage.clientHeight || 500));
    const spanLat = (b.n - b.s) * d2r, spanLon = (b.e - b.w) * d2r * Math.cos(midLat * d2r);
    const alt = clamp(Math.max(spanLat / 0.93, spanLon / (0.93 * aspect)) * 1.45, options.hero ? 1.4 : 0.75, 2.4);   // far enough back that Earth's edge shows
    globe.pointOfView({ lat: midLat, lng: midLon, altitude: alt }, animate ? 700 : 0);
  }

  // ---------------------------------------------------------------- reading a cell
  function pick(lat, lng) {
    const ix = Math.round((lng - P.lo0) / data.grid.dlon), iy = Math.round((lat - P.la0) / data.grid.dlat);
    const i = ix >= 0 && ix < P.nx && iy >= 0 && iy < P.ny ? P.grid[iy * P.nx + ix] : -1;
    selected = i; updateReadout(); schedule();
  }
  function updateReadout() {
    const yi = tl.index;
    if (selected < 0) { readout.textContent = "Click or tap a cell to read its value for the year shown."; return; }
    const v = P.A[yi * P.nC + selected];
    readout.textContent = `${fmtLat(P.lat[selected])}, ${fmtLon(P.lon[selected])}, ${data.years[yi]}: ${Number.isNaN(v) ? "no value this year" : signed(v, 2) + " " + U + " from this cell's own baseline"}.`;
  }
  flatCanvas.addEventListener("pointerdown", (e) => {
    if (!flatView) return; const r = flatCanvas.getBoundingClientRect(), v = flatView;
    const lon = v.lon0 + ((e.clientX - r.left) / r.width) * (v.lon1 - v.lon0), lat = v.lat1 - ((e.clientY - r.top) / r.height) * (v.lat1 - v.lat0);
    pick(lat, lon);
  });

  function onState() {
    ctl.sync();
    const yi = tl.index;
    summary.textContent = `${caseLine(data)}. ${data.years[yi]}: regional average ${regionalMeanText(data, yi)}. ${P.nC.toLocaleString("en-US")} cells; the globe is for finding where, the numbers for how much.`;
    updateReadout();
    options.onYear && options.onYear(yi);
  }

  async function setFlat(v) {
    flat = !!v && true; if (!webgl) flat = true;
    flatBtn && flatBtn.setAttribute("aria-pressed", String(flat));
    resetBtn.hidden = flat;
    host.style.visibility = flat ? "hidden" : "visible"; flatCanvas.style.display = flat ? "block" : "none";
    if (flat) { try { globe && globe.pauseAnimation(); } catch (e) { /* ignore */ } baseFlat = makeBase(flatGeometry()); schedule(); }
    else { stage.style.height = options.height || "clamp(320px,56vw,620px)"; await ensureGlobe(); try { globe && globe.resumeAnimation(); } catch (e) { /* ignore */ } schedule(); }
  }

  // ---------------------------------------------------------------- start
  [img, geo] = await Promise.all([loadImage(IMG_URL), loadGeo({ states: isUS(data.region_box) }).catch(() => null)]);
  if (destroyed) return null;
  flatBtn && flatBtn.setAttribute("aria-pressed", String(flat)); resetBtn.hidden = flat;
  host.style.visibility = flat ? "hidden" : "visible"; flatCanvas.style.display = flat ? "block" : "none";
  if (flat) baseFlat = makeBase(flatGeometry());
  onState();
  if (flat) { paint(); } else { await ensureGlobe(); if (!globe) { await setFlat(true); } paint(); }
  stageKeys(stage, tl);

  const offSize = sizeObserver(stage, () => {
    if (destroyed) return;
    if (globe) { globe.width(stage.clientWidth).height(stage.clientHeight); }
    if (flat) { baseFlat = makeBase(flatGeometry()); schedule(); }
  });
  const offTheme = onTheme(() => {
    scale = makeScale(data);
    const lgEl = root.querySelector(".viz-legend"); if (lgEl) lgEl.replaceWith(lg());
    if (globe) { globe.atmosphereColor(tok("viz-atmos", "#8FB1CC")); baseTex = makeBase(world(texCanvas.width, texCanvas.height)); }
    if (flat) baseFlat = makeBase(flatGeometry());
    schedule();
  });
  if (options.autoplay && !reduce) tl.play();

  return {
    el: root, stats, play: () => tl.play(), pause: () => tl.pause(), seek: (i) => tl.seek(i), setFlat, timeline: tl,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); tl.destroy(); offSize(); offTheme(); if (io) io.disconnect();
      try { globe && globe._destructor && globe._destructor(); } catch (e) { /* ignore */ }
      root.remove();
    },
  };
}
