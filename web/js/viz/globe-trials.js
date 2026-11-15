// "Where the trials are held": all registered case regions on one Earth, each drawn by its per-cell TREND (Sen slope per decade, from the case bundle).
// Home hero only. One symmetric color scale per case (the cases have different units). A case whose ruling is withheld is drawn as a faint dashed outline only (no fill, never trend colors),
// and says "Withheld: our tests can't rule here. Open the case." on hover. Click a region (or a label, or a chip below) to open its case file. No year playback here.
// The globe starts paused. "Turn the Earth" is a deliberate, slow rotation; reduced motion keeps the Earth still (drag and the chips still work).
// Optional (landing hook prototype): options.onPick(case) replaces "open the case file" on a region or label click, options.onPoint({lat,lng}) reports a click anywhere else on the Earth.
//   options.view = {lat,lng,altitude} sets the opening camera. The returned object also has focus(lat,lng,altitude,ms), select(id|null), markBox(box|null) and turn(on).
// Optional (Home hook): options.labels = "focus" shows a region's name label only on the selected region and on the one under the pointer (six labels never collide),
//   and marks the selected case's chip so the page can show just that chip (its color key and case-file link). The default draws every label and every chip.
// render(container, claims, options) -> {destroy, el}.  claims: bundle.claims (data.js shape: grid, cell_slope_per_decade, regional.units, verdict).
import { WEB, el, tok, isDark, onTheme, makeScale, clamp, signed, reducedMotion, nextId } from "./common.js";
import { U } from "../util.js";
import { DUMMY, loadEarth, makeBase, styleAtmosphere, useCanvasTexture } from "./globe-style.js";

const SHORT = { "C-A": "Southeast US", "C-B": "Sahel", "C-C": "Alaska", "C-D": "Wisconsin", "C-E1": "Eastern US", "C-E2": "Northern India" };
const NICE = [0.05, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5];
const caseNo = (id) => id.replace("-", "–");
const WITHHELD_TIP = "Withheld: our tests can't rule here. Open the case.";
const KEY_LINE = "Colored = trend per decade, each case on its own scale (pick one for its key) · dashed = no ruling";

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

/** What each case draws: its cells, trend scale, palette and whether it is withheld. */
export function prepareCases(claims) {
  return claims.filter((c) => c.grid && c.cell_slope_per_decade).map((c) => {
    const g = c.grid, abs = c.cell_slope_per_decade.filter((v) => v != null).map(Math.abs).sort((a, b) => a - b);
    const p98 = abs.length ? abs[Math.min(abs.length - 1, Math.floor(0.98 * (abs.length - 1)))] : 1, max = NICE.find((v) => v >= p98) || Math.ceil(p98);
    const unit = U(c.regional.units).replace(/^mm per day$/, "mm/day"), wet = /mm/.test(unit), no2 = /molecules/.test(unit) || /no2|nitrogen/i.test(`${c.variable && c.variable.key} ${c.variable && c.variable.plain}`);
    const withheld = c.verdict.branch === "withheld";
    const la0 = Math.min(...g.lat), la1 = Math.max(...g.lat), lo0 = Math.min(...g.lon), lo1 = Math.max(...g.lon);
    const hl = Math.abs(g.dlat) / 2, hw = Math.abs(g.dlon) / 2, box = { s: la0 - hl, n: la1 + hl, w: lo0 - hw, e: lo1 + hw };
    return { id: c.id, short: SHORT[c.id] || c.region.name, name: c.region.name, grid: g, slopes: c.cell_slope_per_decade, max, unit, wet, withheld, box,
      verdict: c.verdict.label, scaleData: { palette: wet ? "wet_up" : "warm_up", scale: { max } }, lat: (box.s + box.n) / 2, lng: (box.w + box.e) / 2,
      words: wet ? ["drying", "wetting"] : /unitless|AOD/.test(unit) ? ["less aerosol", "more aerosol"] : no2 ? ["less NO\u2082", "more NO\u2082"] : ["cooling", "warming"] };
  });
}

export async function render(container, claims, options = {}) {
  const cases = prepareCases(claims);
  if (!cases.length) throw new Error("no cases to draw");
  const reduce = reducedMotion(), id = nextId("gt");
  const holds = new Set(); let holdT = 0;
  let selected = null, markPoly = null, destroyed = false, globe = null, tex = null, texCanvas = null, texCtx = null, baseTex = null, earth = null, io = null, hover = null, turning = false;
  let scales = new Map(cases.map((k) => [k.id, makeScale(k.scaleData)]));

  const stage = el("div", { class: "viz-stage viz-stage--stage gt-stage", "aria-hidden": "false", role: "group", "aria-label": "Globe showing where the case regions are. Drag to turn it; the case list below opens each case file.", style: "height:" + (options.height || "clamp(340px, 38vw, 500px)") });
  const host = el("div", { style: "position:absolute;inset:0" }); stage.append(host);
  const turnBtn = reduce ? null : el("button", { type: "button", class: "viz-btn", "aria-pressed": "false", onclick: () => setTurning(!turning) }, "Turn the Earth");
  const resetBtn = el("button", { type: "button", class: "viz-btn", onclick: () => home(true) }, "Reset view");
  const tip = el("p", { class: "viz-readout gt-tip", "aria-live": "polite" }, "Point at a region to see its ruling. Click it to open the case.");

  // chips: the list of cases, which is also the legend and the keyboard route to every case file
  const chipGrad = (k) => el("div", { class: "gt-bar", "aria-hidden": "true", style: "background:" + scales.get(k.id).gradient() });
  const chips = el("ul", { class: "gt-chips" }, cases.map((k) => {
    const d = k.max >= 1 ? k.max.toFixed(0) : String(k.max);
    const li = el("li", {}, el("a", { class: "gt-chip" + (k.withheld ? " is-withheld" : ""), href: "#/case/" + k.id, "data-case": k.id, "aria-label": `Open case ${caseNo(k.id)}, ${k.name}: ${k.withheld ? "withheld, no trend drawn" : k.verdict}` },
      el("span", { class: "gt-chip-id" }, `Case ${caseNo(k.id)}`), el("span", { class: "gt-chip-name" }, k.short),
      k.withheld ? el("span", { class: "gt-hatch-row" }, el("i", { class: "gt-hatch", "aria-hidden": "true" }), "Withheld: no ruling, no trend drawn")
        : el("span", { class: "gt-scale" }, chipGrad(k), el("span", { class: "gt-ends num", "aria-hidden": "true" }, el("span", {}, `← ${k.words[0]}`), el("span", {}, `${k.words[1]} →`)),
          el("span", { class: "gt-unit num" }, `±${d} ${k.unit} per decade · ${k.verdict}`))));
    const a = li.firstChild;
    a.addEventListener("mouseenter", () => focusCase(k)); a.addEventListener("focus", () => focusCase(k));
    return li;
  }));
  const key = el("p", { class: "gt-key" }, KEY_LINE);
  const hoverTip = el("div", { class: "gt-hovertip", "aria-hidden": "true", hidden: true }, WITHHELD_TIP); let tipT = 0;
  const summary = el("p", { class: "sr-only" }, `${["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten"][cases.length] || cases.length} claims we tested, shown on one Earth. ` + cases.map((k) => `Case ${caseNo(k.id)}, ${k.name}: ${k.withheld ? "ruling withheld (shown as a dashed outline)" : `${k.verdict} (colored by each square's trend per decade)`}.`).join(" "));
  if (options.poster) {             // phones and browsers without WebGL: a labeled static picture, with the same case list below it
    const r = el("figure", { class: "viz viz-trials", id }, options.poster, key, options.caption || null, chips, summary);
    container.append(r); return { el: r, destroy() { r.remove(); }, focus() {}, select() {}, markBox() {}, turn() {}, spinning() { return false; }, hasGlobe: false };
  }
  const root = el("figure", { class: "viz viz-trials", id }, stage, key, options.caption || null, chips, el("div", { class: "viz-controls" }, turnBtn, resetBtn), tip, summary);
  stage.append(hoverTip); container.append(root);
  // the "withheld" note beside the pointer (mouse hover, or about three seconds after a tap); k = null hides it
  function placeTip(k, ev, hold = 0) {
    clearTimeout(tipT);
    if (!k) { hoverTip.hidden = true; return; }
    const r = stage.getBoundingClientRect(); hoverTip.hidden = false;
    const w = hoverTip.offsetWidth, ht = hoverTip.offsetHeight, x = clamp(ev.clientX - r.left, w / 2 + 4, Math.max(w / 2 + 4, r.width - w / 2 - 4)), y = ev.clientY - r.top, above = y + 22 + ht > r.height - 4 && y - ht - 18 > 4;
    hoverTip.style.left = x + "px"; hoverTip.style.top = (above ? y - ht - 14 : y + 22) + "px";
    if (hold) tipT = setTimeout(() => { hoverTip.hidden = true; }, hold);
  }

  // ---------------------------------------------------------------- the picture painted into the globe texture
  const X = (W, lon) => ((lon + 180) / 360) * W, Y = (H, lat) => ((90 - lat) / 180) * H;
  function paint() {
    if (!texCtx || !baseTex) return;
    const W = texCanvas.width, H = texCanvas.height, g = texCtx, dark = isDark(); g.drawImage(baseTex, 0, 0);
    for (const k of cases) {
      const { grid: gr } = k, hw = (Math.abs(gr.dlon) / 360) * W / 2, hh = (Math.abs(gr.dlat) / 180) * H / 2, sc = scales.get(k.id);
      const bx = X(W, k.box.w), by = Y(H, k.box.n), bw = X(W, k.box.e) - X(W, k.box.w), bh = Y(H, k.box.s) - Y(H, k.box.n);
      if (k.withheld) {                 // no ruling: a faint dashed outline only, no fill and no trend colors
        g.save(); g.lineWidth = Math.max(1.8, W / 1450); g.setLineDash([W / 260, W / 380]); g.lineCap = "butt";
        g.strokeStyle = dark ? "rgba(244,237,222,0.82)" : "rgba(25,45,64,0.8)"; g.strokeRect(bx, by, bw, bh); g.restore();
        continue;
      }
      for (let i = 0; i < gr.n_lat; i++) for (let j = 0; j < gr.n_lon; j++) {
        const v = k.slopes[i * gr.n_lon + j]; if (v == null) continue;
        g.fillStyle = sc.css(v, 0, 0.92);
        const x = X(W, gr.lon[j]), y = Y(H, gr.lat[i]);
        const x0 = Math.round(x - hw), x1 = Math.round(x + hw), y0 = Math.round(y - hh), y1 = Math.round(y + hh); g.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
      g.lineWidth = Math.max(1.2, W / 2000); g.strokeStyle = dark ? "rgba(244,237,222,0.95)" : "rgba(25,45,64,0.9)"; g.strokeRect(bx, by, bw, bh);
    }
    tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the globe
  const polyOf = (k) => ({ id: k.id, geometry: { type: "Polygon", coordinates: [[[k.box.w, k.box.s], [k.box.e, k.box.s], [k.box.e, k.box.n], [k.box.w, k.box.n], [k.box.w, k.box.s]]] } });
  const kOf = (d) => cases.find((k) => k.id === (d && d.id));
  const isHov = (d) => !!(d && hover && d.id === hover.id);
  const capOf = (d) => (isHov(d) ? "rgba(255,255,255,0.16)" : d && d.id === selected ? "rgba(255,255,255,0.2)" : d && d.id === "__mark" ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.015)");
  const altOf = (d) => (isHov(d) || (d && (d.id === selected || d.id === "__mark")) ? 0.012 : 0.004);
  // options.labels === "focus": a name label only on the selected region and on the hovered one; the case list marks the selected case
  const labelEls = new Map(), focusLabels = options.labels === "focus";
  function syncSel() {
    for (const li of chips.children) { const a = li.firstChild; li.classList.toggle("is-selected", !!a && a.getAttribute("data-case") === selected); }
    if (focusLabels) for (const [k, a] of labelEls) a.classList.toggle("is-off", !(k === selected || (hover && hover.id === k)));
  }
  const refreshPolys = () => { if (!globe) return; globe.polygonsData([...cases.map(polyOf), ...(markPoly ? [markPoly] : [])]); globe.polygonAltitude(altOf); globe.polygonCapColor(capOf); syncSel(); };
  const pick = (k, e) => { if (options.onPick) { if (e && e.preventDefault) e.preventDefault(); options.onPick(k); } else location.hash = "#/case/" + k.id; };
  const tipHtml = (k) => `<div class="gt-tooltip"><b>Case ${caseNo(k.id)} · ${k.short}</b><br>${k.withheld ? WITHHELD_TIP : `${k.verdict}. Colors: each cell's trend.<br><i>Click to open the case</i>`}</div>`;
  const view = { lat: 42, lng: -58, altitude: 1.5, ...(options.view || {}) };       // options.view: the Home page opens on its selected region at its own camera height
  function home(animate) { if (globe) globe.pointOfView(view, animate && !reduce ? 700 : 0); }
  function focusCase(k) { if (globe) globe.pointOfView({ lat: k.lat, lng: k.lng, altitude: 1.15 }, reduce ? 0 : 800); tip.textContent = k.withheld ? `Case ${caseNo(k.id)}, ${k.short}: ${WITHHELD_TIP}` : `Case ${caseNo(k.id)}, ${k.short}: ${k.verdict}. Each square is one cell's trend per decade.`; }
  // The spin runs only while nothing holds it: a drag, a hover over a region or label, a fly-to, or the globe scrolled out of view. Reduced motion never spins.
  function applySpin() { if (!globe) return; const c = globe.controls(); c.autoRotateSpeed = options.spinSpeed || 0.45; c.autoRotate = turning && !reduce && holds.size === 0; }
  const hold = (k, on) => { if (on) holds.add(k); else holds.delete(k); applySpin(); };
  function setTurning(on) {
    turning = on; if (!globe) return; applySpin();
    if (turnBtn) { turnBtn.setAttribute("aria-pressed", String(on)); turnBtn.textContent = on ? "Pause the Earth" : "Turn the Earth"; }
  }
  async function ensureGlobe() {
    const Globe = await loadGlobeLib(); if (destroyed) return;
    const W = 4096; texCanvas = document.createElement("canvas"); texCanvas.width = W; texCanvas.height = W / 2; texCtx = texCanvas.getContext("2d"); baseTex = makeBase(W, W / 2, earth);
    const g = Globe({ rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" }, animateIn: false })(host)
      .width(stage.clientWidth).height(stage.clientHeight).backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl(DUMMY)
      .polygonsData(cases.map(polyOf)).polygonGeoJsonGeometry("geometry").polygonAltitude(altOf)
      .polygonCapColor(capOf).polygonSideColor(() => "rgba(0,0,0,0)").polygonStrokeColor(() => "rgba(0,0,0,0)")
      .polygonLabel((d) => (!options.onPoint && kOf(d) ? tipHtml(kOf(d)) : "")).onPolygonHover((d) => { if (options.onPoint) return; hover = d || null; g.polygonAltitude(altOf); g.polygonCapColor(capOf); stage.style.cursor = hover ? "pointer" : "grab"; hold("hover", !!hover); if (hover && kOf(hover)) { const k = kOf(hover); tip.textContent = k.withheld ? `Case ${caseNo(k.id)}, ${k.short}: ${WITHHELD_TIP}` : `Case ${caseNo(k.id)}, ${k.short}: ${k.verdict}.`; } })
      .onPolygonClick((d) => { if (options.onPoint) return; const k = kOf(d); if (k) pick(k); })
      .htmlElementsData(cases).htmlLat((k) => k.lat).htmlLng((k) => k.lng).htmlAltitude(0.03).htmlElement((k) => {
        const a = el("a", { href: "#/case/" + k.id, class: "gt-label" + (k.withheld ? " is-withheld" : ""), tabindex: "-1", "aria-hidden": "true" }, `${caseNo(k.id)} ${k.short}`); a.style.pointerEvents = "auto"; labelEls.set(k.id, a); a.addEventListener("mouseenter", () => hold("label", true)); a.addEventListener("mouseleave", () => hold("label", false)); if (options.onPick) a.addEventListener("click", (e) => pick(k, e)); return a; });
    styleAtmosphere(g);
    globe = g;
    try { g.renderer().setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); } catch (e) { /* default ratio */ }
    const c = g.controls(); c.enablePan = false; c.autoRotate = false; c.minDistance = 110; c.maxDistance = 520; c.rotateSpeed = 0.55; c.zoomSpeed = 0.7;
    if (options.touchRotate === false) { c.enableRotate = false; c.enableZoom = false; host.style.touchAction = "pan-y"; host.querySelectorAll("canvas").forEach((cv) => { cv.style.touchAction = "pan-y"; }); }   // phones: a finger on the globe scrolls the page
    tex = await useCanvasTexture(g, texCanvas, () => destroyed);
    if (!tex) return;
    if (options.onPoint) {              // pointer handling done here, on the visible Earth only: the view ray is intersected with the sphere, so a box on the far side can never catch the pointer
      let down = null, moveRaf = 0; const cv = g.renderer().domElement;
      const geoAt = (e) => {
        const r = cv.getBoundingClientRect(), cam = g.camera(), V = cam.position.constructor, o = cam.position.clone();
        const d = new V(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(cam).sub(o).normalize();
        const R = g.getGlobeRadius(), b = o.x * d.x + o.y * d.y + o.z * d.z, disc = b * b - (o.x * o.x + o.y * o.y + o.z * o.z - R * R);
        if (disc < 0) return null;      // off the Earth
        const t = -b - Math.sqrt(disc), pt = g.toGeoCoords({ x: o.x + t * d.x, y: o.y + t * d.y, z: o.z + t * d.z });
        return pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng) ? { lat: pt.lat, lng: ((pt.lng + 540) % 360) - 180 } : null;
      };
      const caseAt = (pt) => pt && cases.find((k) => pt.lat >= k.box.s && pt.lat <= k.box.n && pt.lng >= k.box.w && pt.lng <= k.box.e);
      cv.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
      cv.addEventListener("pointermove", (e) => {
        if (e.buttons || moveRaf) return; const ev = { clientX: e.clientX, clientY: e.clientY };
        moveRaf = requestAnimationFrame(() => { moveRaf = 0; const k = caseAt(geoAt(ev)), was = hover && hover.id; placeTip(k && k.withheld ? k : null, ev); if ((k && k.id) === was) return;
          hover = k ? { id: k.id } : null; syncSel(); g.polygonAltitude(altOf); g.polygonCapColor(capOf); stage.style.cursor = k ? "pointer" : "grab"; hold("hover", !!k); });
      });
      cv.addEventListener("pointerleave", () => { placeTip(null); if (hover) { hover = null; syncSel(); g.polygonAltitude(altOf); g.polygonCapColor(capOf); stage.style.cursor = "grab"; hold("hover", false); } });
      cv.addEventListener("click", (e) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
        const pt = geoAt(e); if (!pt) return; const k = caseAt(pt);
        if (k && k.withheld && e.pointerType === "touch") placeTip(k, e, 3500); else placeTip(null);
        if (k) pick(k); else options.onPoint(pt);
      });
    }
    c.addEventListener("start", () => { clearTimeout(holdT); hold("drag", true); }); c.addEventListener("end", () => { clearTimeout(holdT); holdT = setTimeout(() => hold("drag", false), 1200); });
    home(false); paint(); syncSel();
    if (options.autoSpin && !reduce) setTurning(true);
    if ("IntersectionObserver" in window) { io = new IntersectionObserver((es) => { for (const e of es) { try { if (e.isIntersecting) { g.resumeAnimation(); hold("offscreen", false); } else { g.pauseAnimation(); hold("offscreen", true); } } catch (er) { /* ignore */ } } }); io.observe(stage); }
  }

  earth = await loadEarth();
  if (destroyed) return null;
  await ensureGlobe();
  if (!globe) throw new Error("the globe could not start");
  const offSize = (() => { if (!window.ResizeObserver) return () => {}; const ro = new ResizeObserver(() => { if (globe && !destroyed) globe.width(stage.clientWidth).height(stage.clientHeight); }); ro.observe(stage); return () => ro.disconnect(); })();
  const offTheme = onTheme(() => { scales = new Map(cases.map((k) => [k.id, makeScale(k.scaleData)])); chips.querySelectorAll(".gt-bar").forEach((b, i) => { const k = cases.filter((c) => !c.withheld)[i]; if (k) b.style.background = scales.get(k.id).gradient(); }); if (globe) { globe.atmosphereColor(tok("viz-atmos", "#8FB1CC")); baseTex = makeBase(texCanvas.width, texCanvas.height, earth); paint(); } });
  const api = {
    hasGlobe: true,
    focus(lat, lng, altitude = 1.15, ms = 800) { if (!globe) return; globe.pointOfView({ lat, lng, altitude }, reduce ? 0 : ms); if (!reduce) { hold("fly", true); setTimeout(() => hold("fly", false), ms + 250); } },
    select(id) { selected = id || null; refreshPolys(); },
    markBox(b) { markPoly = b ? { id: "__mark", geometry: { type: "Polygon", coordinates: [[[b.w, b.s], [b.e, b.s], [b.e, b.n], [b.w, b.n], [b.w, b.s]]] } } : null; refreshPolys(); },
    turn(on) { setTurning(on); },
    raw() { return globe; },
    spinning() { return !!(globe && globe.controls().autoRotate); },
    screen(lat, lng) { return globe ? globe.getScreenCoords(lat, lng, 0) : null; },
  };
  return { ...api, el: root, destroy() { destroyed = true; clearTimeout(holdT); clearTimeout(tipT); offSize(); offTheme(); if (io) io.disconnect(); try { globe && globe._destructor && globe._destructor(); } catch (e) { /* ignore */ } root.remove(); } };
}
void clamp; void signed;
