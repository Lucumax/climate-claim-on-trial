// "Where the trials are held": all registered case regions on one Earth, each drawn by its per-cell TREND (Sen slope per decade, from the case bundle).
// Home hero only. One symmetric colour scale per case (the cases have different units). A case whose ruling is withheld is drawn as a neutral hatch,
// never in trend colours, and says "withheld" on hover. Click a region (or a label, or a chip below) to open its docket. No year playback here.
// The globe starts paused. "Turn the Earth" is a deliberate, slow rotation; reduced motion keeps the Earth still (drag and the chips still work).
// render(container, claims, options) -> {destroy, el}.  claims: bundle.claims (data.js shape: grid, cell_slope_per_decade, regional.units, verdict).
import { WEB, el, tok, isDark, onTheme, makeScale, clamp, signed, reducedMotion, nextId } from "./common.js";
import { loadGeo, tracePath } from "./geo.js";

const IMG_URL = WEB + "vendor/blue-marble-4096.webp";
const DUMMY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const SHORT = { "C-A": "Southeast US", "C-B": "Sahel", "C-C": "Alaska", "C-D": "Wisconsin" };
const NICE = [0.05, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5];
const caseNo = (id) => id.replace("-", "–");

let globeLib = null;
function loadGlobeLib() {
  if (window.Globe) return Promise.resolve(window.Globe);
  if (!globeLib) {
    globeLib = new Promise((resolve, reject) => {
      const sc = document.createElement("script"); sc.src = WEB + "vendor/globe.gl.min.js";
      sc.onload = () => (window.Globe ? resolve(window.Globe) : reject(new Error("globe.gl did not start")));
      sc.onerror = () => reject(new Error("globe.gl could not be loaded")); document.head.append(sc);
    });
    globeLib.catch(() => { globeLib = null; });
  }
  return globeLib;
}
export const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } };
const loadImage = (url) => new Promise((res) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

/** What each case draws: its cells, trend scale, palette and whether it is withheld. */
export function prepareCases(claims) {
  return claims.filter((c) => c.grid && c.cell_slope_per_decade).map((c) => {
    const g = c.grid, abs = c.cell_slope_per_decade.filter((v) => v != null).map(Math.abs).sort((a, b) => a - b);
    const p98 = abs.length ? abs[Math.min(abs.length - 1, Math.floor(0.98 * (abs.length - 1)))] : 1, max = NICE.find((v) => v >= p98) || Math.ceil(p98);
    const unit = String(c.regional.units || "").replace(/\bdegC\b/g, "°C").replace(/^mm per day$/, "mm/day"), wet = /mm/.test(unit);
    const withheld = c.verdict.branch === "withheld";
    const la0 = Math.min(...g.lat), la1 = Math.max(...g.lat), lo0 = Math.min(...g.lon), lo1 = Math.max(...g.lon);
    const hl = Math.abs(g.dlat) / 2, hw = Math.abs(g.dlon) / 2, box = { s: la0 - hl, n: la1 + hl, w: lo0 - hw, e: lo1 + hw };
    return { id: c.id, short: SHORT[c.id] || c.region.name, name: c.region.name, grid: g, slopes: c.cell_slope_per_decade, max, unit, wet, withheld, box,
      verdict: c.verdict.label, scaleData: { palette: wet ? "wet_up" : "warm_up", scale: { max } }, lat: (box.s + box.n) / 2, lng: (box.w + box.e) / 2,
      words: wet ? ["drying", "wetting"] : /unitless|AOD/.test(unit) ? ["less aerosol", "more aerosol"] : ["cooling", "warming"] };
  });
}

export async function render(container, claims, options = {}) {
  const cases = prepareCases(claims);
  if (!cases.length) throw new Error("no cases to draw");
  const reduce = reducedMotion(), id = nextId("gt");
  let destroyed = false, globe = null, tex = null, texCanvas = null, texCtx = null, baseTex = null, img = null, geo = null, io = null, hover = null, turning = false;
  let scales = new Map(cases.map((k) => [k.id, makeScale(k.scaleData)]));

  const stage = el("div", { class: "viz-stage viz-stage--stage gt-stage", "aria-hidden": "false", role: "group", "aria-label": "Globe showing where the case regions are. Drag to turn it; the case list below opens each docket.", style: "height:" + (options.height || "clamp(340px, 38vw, 500px)") });
  const host = el("div", { style: "position:absolute;inset:0" }); stage.append(host);
  const turnBtn = reduce ? null : el("button", { type: "button", class: "viz-btn", "aria-pressed": "false", onclick: () => setTurning(!turning) }, "Turn the Earth");
  const resetBtn = el("button", { type: "button", class: "viz-btn", onclick: () => home(true) }, "Reset view");
  const tip = el("p", { class: "viz-readout gt-tip", "aria-live": "polite" }, "Point at a region to see its ruling. Click it to open the case.");

  // chips: the list of cases, which is also the legend and the keyboard route to every docket
  const chipGrad = (k) => el("div", { class: "gt-bar", "aria-hidden": "true", style: "background:" + scales.get(k.id).gradient() });
  const chips = el("ul", { class: "gt-chips" }, cases.map((k) => {
    const d = k.max >= 1 ? k.max.toFixed(0) : String(k.max);
    const li = el("li", {}, el("a", { class: "gt-chip" + (k.withheld ? " is-withheld" : ""), href: "#/case/" + k.id, "data-case": k.id, "aria-label": `Open case ${caseNo(k.id)}, ${k.name}: ${k.withheld ? "ruling withheld, no trend drawn" : k.verdict}` },
      el("span", { class: "gt-chip-id" }, `Case ${caseNo(k.id)}`), el("span", { class: "gt-chip-name" }, k.short),
      k.withheld ? el("span", { class: "gt-hatch-row" }, el("i", { class: "gt-hatch", "aria-hidden": "true" }), "Ruling withheld, no trend drawn")
        : el("span", { class: "gt-scale" }, chipGrad(k), el("span", { class: "gt-ends num", "aria-hidden": "true" }, el("span", {}, `← ${k.words[0]}`), el("span", {}, `${k.words[1]} →`)),
          el("span", { class: "gt-unit num" }, `±${d} ${k.unit} per decade · ${k.verdict}`))));
    const a = li.firstChild;
    a.addEventListener("mouseenter", () => focusCase(k)); a.addEventListener("focus", () => focusCase(k));
    return li;
  }));
  const summary = el("p", { class: "sr-only" }, "Four registered cases on one Earth. " + cases.map((k) => `Case ${caseNo(k.id)}, ${k.name}: ${k.withheld ? "ruling withheld, drawn hatched" : `${k.verdict}, drawn by each cell's trend per decade`}.`).join(" "));
  if (options.poster) {             // phones and browsers without WebGL: a labelled static picture, with the same case list below it
    const r = el("figure", { class: "viz viz-trials", id }, options.poster, options.caption || null, chips, summary);
    container.append(r); return { el: r, destroy() { r.remove(); } };
  }
  const root = el("figure", { class: "viz viz-trials", id }, stage, options.caption || null, chips, el("div", { class: "viz-controls" }, turnBtn, resetBtn), tip, summary);
  container.append(root);

  // ---------------------------------------------------------------- the picture painted into the globe texture
  const X = (W, lon) => ((lon + 180) / 360) * W, Y = (H, lat) => ((90 - lat) / 180) * H;
  function makeBase(W, H) {
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"), dark = isDark();
    g.fillStyle = tok("ocean", "#DCE5E8"); g.fillRect(0, 0, W, H);
    if (img) {
      g.filter = dark ? "grayscale(0.75) brightness(0.62) contrast(0.8)" : "grayscale(0.7) brightness(0.92) contrast(0.62)";
      g.drawImage(img, 0, 0, W, H); g.filter = "none";
      g.fillStyle = dark ? "rgba(10,20,29,0.42)" : "rgba(222,230,233,0.62)"; g.fillRect(0, 0, W, H);
    }
    if (geo) {
      const box = { w: -180, e: 180, s: -90, n: 90 }, fx = (lon) => X(W, lon), fy = (lat) => Y(H, lat);
      g.lineJoin = "round"; g.beginPath(); tracePath(g, geo.countries, fx, fy, box);
      g.strokeStyle = dark ? "rgba(190,201,206,0.3)" : "rgba(60,58,48,0.28)"; g.lineWidth = Math.max(0.8, W / 4096); g.stroke();
      g.beginPath(); tracePath(g, geo.land, fx, fy, box);
      g.strokeStyle = dark ? "rgba(214,224,229,0.5)" : "rgba(40,40,32,0.62)"; g.lineWidth = Math.max(0.9, W / 3000); g.stroke();
    }
    return c;
  }
  function hatchPattern(g, W) {
    const s = Math.max(6, Math.round(W / 560)), p = document.createElement("canvas"); p.width = p.height = s; const q = p.getContext("2d");
    q.fillStyle = tok("nodata", "#F0EEE6"); q.fillRect(0, 0, s, s); q.strokeStyle = tok("nodata-mark", "#6D777C"); q.lineWidth = Math.max(1, s / 5);
    q.beginPath(); q.moveTo(0, s); q.lineTo(s, 0); q.moveTo(-s / 2, s / 2); q.lineTo(s / 2, -s / 2); q.moveTo(s / 2, s * 1.5); q.lineTo(s * 1.5, s / 2); q.stroke();
    return g.createPattern(p, "repeat");
  }
  function paint() {
    if (!texCtx || !baseTex) return;
    const W = texCanvas.width, H = texCanvas.height, g = texCtx, dark = isDark(); g.drawImage(baseTex, 0, 0);
    for (const k of cases) {
      const { grid: gr } = k, hw = (Math.abs(gr.dlon) / 360) * W / 2, hh = (Math.abs(gr.dlat) / 180) * H / 2, sc = scales.get(k.id);
      if (k.withheld) {
        const x0 = X(W, k.box.w), x1 = X(W, k.box.e), y0 = Y(H, k.box.n), y1 = Y(H, k.box.s);
        g.globalAlpha = 0.92; g.fillStyle = hatchPattern(g, W); g.fillRect(x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1;
      } else {
        for (let i = 0; i < gr.n_lat; i++) for (let j = 0; j < gr.n_lon; j++) {
          const v = k.slopes[i * gr.n_lon + j]; if (v == null) continue;
          g.fillStyle = sc.css(v, 0, 0.92);
          const x = X(W, gr.lon[j]), y = Y(H, gr.lat[i]);
          const x0 = Math.round(x - hw), x1 = Math.round(x + hw), y0 = Math.round(y - hh), y1 = Math.round(y + hh); g.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        }
      }
      g.lineWidth = Math.max(1.2, W / 2000); g.strokeStyle = dark ? "rgba(244,237,222,0.95)" : "rgba(25,45,64,0.9)"; g.strokeRect(X(W, k.box.w), Y(H, k.box.n), X(W, k.box.e) - X(W, k.box.w), Y(H, k.box.s) - Y(H, k.box.n));
    }
    tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the globe
  const polyOf = (k) => ({ id: k.id, geometry: { type: "Polygon", coordinates: [[[k.box.w, k.box.s], [k.box.e, k.box.s], [k.box.e, k.box.n], [k.box.w, k.box.n], [k.box.w, k.box.s]]] } });
  const kOf = (d) => cases.find((k) => k.id === (d && d.id));
  const tipHtml = (k) => `<div class="gt-tooltip"><b>Case ${caseNo(k.id)} · ${k.short}</b><br>${k.withheld ? "Ruling withheld: no trend is drawn." : `${k.verdict}. Colours: each cell's trend.`}<br><i>Click to open the case</i></div>`;
  const view = { lat: 42, lng: -58, altitude: 1.5 };
  function home(animate) { if (globe) globe.pointOfView(view, animate && !reduce ? 700 : 0); }
  function focusCase(k) { if (globe) globe.pointOfView({ lat: k.lat, lng: k.lng, altitude: 1.15 }, reduce ? 0 : 800); tip.textContent = k.withheld ? `Case ${caseNo(k.id)}, ${k.short}: ruling withheld, so no trend is drawn.` : `Case ${caseNo(k.id)}, ${k.short}: ${k.verdict}. Each square is one cell's trend per decade.`; }
  function setTurning(on) {
    turning = on; if (!globe) return; globe.controls().autoRotate = on; globe.controls().autoRotateSpeed = 0.45;
    if (turnBtn) { turnBtn.setAttribute("aria-pressed", String(on)); turnBtn.textContent = on ? "Pause the Earth" : "Turn the Earth"; }
  }
  async function ensureGlobe() {
    const Globe = await loadGlobeLib(); if (destroyed) return;
    const W = 4096; texCanvas = document.createElement("canvas"); texCanvas.width = W; texCanvas.height = W / 2; texCtx = texCanvas.getContext("2d"); baseTex = makeBase(W, W / 2);
    const g = Globe({ rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" }, animateIn: false })(host)
      .width(stage.clientWidth).height(stage.clientHeight).backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl(DUMMY).showAtmosphere(true).atmosphereColor(tok("viz-atmos", "#8FB1CC")).atmosphereAltitude(0.14)
      .polygonsData(cases.map(polyOf)).polygonGeoJsonGeometry("geometry").polygonAltitude((d) => (d === hover ? 0.012 : 0.004))
      .polygonCapColor((d) => (d === hover ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.015)")).polygonSideColor(() => "rgba(0,0,0,0)").polygonStrokeColor(() => "rgba(0,0,0,0)")
      .polygonLabel((d) => tipHtml(kOf(d))).onPolygonHover((d) => { hover = d || null; g.polygonAltitude((x) => (x === hover ? 0.012 : 0.004)); g.polygonCapColor((x) => (x === hover ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.015)")); stage.style.cursor = hover ? "pointer" : "grab"; if (hover) { const k = kOf(hover); tip.textContent = k.withheld ? `Case ${caseNo(k.id)}, ${k.short}: ruling withheld.` : `Case ${caseNo(k.id)}, ${k.short}: ${k.verdict}.`; } })
      .onPolygonClick((d) => { const k = kOf(d); if (k) location.hash = "#/case/" + k.id; })
      .htmlElementsData(cases).htmlLat((k) => k.lat).htmlLng((k) => k.lng).htmlAltitude(0.03).htmlElement((k) => {
        const a = el("a", { href: "#/case/" + k.id, class: "gt-label" + (k.withheld ? " is-withheld" : ""), tabindex: "-1", "aria-hidden": "true" }, `${caseNo(k.id)} ${k.short}`); a.style.pointerEvents = "auto"; return a; });
    globe = g;
    try { g.renderer().setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); } catch (e) { /* default ratio */ }
    const c = g.controls(); c.enablePan = false; c.autoRotate = false; c.minDistance = 110; c.maxDistance = 520; c.rotateSpeed = 0.55; c.zoomSpeed = 0.7;
    if (options.touchRotate === false) { c.enableRotate = false; c.enableZoom = false; host.style.touchAction = "pan-y"; host.querySelectorAll("canvas").forEach((cv) => { cv.style.touchAction = "pan-y"; }); }   // phones: a finger on the globe scrolls the page
    tex = await new Promise((res) => { let n = 0; const iv = setInterval(() => { const m = g.globeMaterial().map; if (m) { clearInterval(iv); res(m); } else if (++n > 150) { clearInterval(iv); res(null); } }, 25); });
    if (!tex || destroyed) return;
    tex.dispose(); tex.image = texCanvas; tex.generateMipmaps = false; tex.minFilter = 1006;
    try { tex.anisotropy = g.renderer().capabilities.getMaxAnisotropy(); } catch (e) { /* ignore */ }
    home(false); paint();
    if ("IntersectionObserver" in window) { io = new IntersectionObserver((es) => { for (const e of es) { try { if (e.isIntersecting) g.resumeAnimation(); else { g.pauseAnimation(); if (turning) setTurning(false); } } catch (er) { /* ignore */ } } }); io.observe(stage); }
  }

  [img, geo] = await Promise.all([loadImage(IMG_URL), loadGeo({ states: false }).catch(() => null)]);
  if (destroyed) return null;
  await ensureGlobe();
  if (!globe) throw new Error("the globe could not start");
  const offSize = (() => { if (!window.ResizeObserver) return () => {}; const ro = new ResizeObserver(() => { if (globe && !destroyed) globe.width(stage.clientWidth).height(stage.clientHeight); }); ro.observe(stage); return () => ro.disconnect(); })();
  const offTheme = onTheme(() => { scales = new Map(cases.map((k) => [k.id, makeScale(k.scaleData)])); chips.querySelectorAll(".gt-bar").forEach((b, i) => { const k = cases.filter((c) => !c.withheld)[i]; if (k) b.style.background = scales.get(k.id).gradient(); }); if (globe) { globe.atmosphereColor(tok("viz-atmos", "#8FB1CC")); baseTex = makeBase(texCanvas.width, texCanvas.height); paint(); } });
  return { el: root, destroy() { destroyed = true; offSize(); offTheme(); if (io) io.disconnect(); try { globe && globe._destructor && globe._destructor(); } catch (e) { /* ignore */ } root.remove(); } };
}
void clamp; void signed;
