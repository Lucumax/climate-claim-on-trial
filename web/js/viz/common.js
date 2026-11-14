// Shared helpers for the visual modules (globe-case, spiral, anomaly-map, distribution, stripes).
// No dependencies. Each module imports only from here and from geo.js, so the lab page can load them in any order.
// Rules enforced here: one symmetric diverging scale per case (zero = neutral midpoint), tabular numerals, true minus signs,
// reduced-motion check, theme tokens read from CSS custom properties (and re-read when the theme changes).

export const WEB = new URL("../../", import.meta.url).href;   // .../web/

const SVGNS = "http://www.w3.org/2000/svg";
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
export function sv(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; e.setAttribute(k, v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
export const tok = (name, fallback = "#888888") => getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim() || fallback;
export function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
/** Calls cb() when the theme attribute or the system setting changes. Returns an unsubscribe function. */
export function onTheme(cb) {
  const mo = new MutationObserver(() => cb());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const fn = () => cb();
  if (mq && mq.addEventListener) mq.addEventListener("change", fn);
  return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener("change", fn); };
}

// ------------------------------------------------------------------------------------------------ number text
export const MINUS = "−";
export const minus = (s) => String(s).replace(/-(?=\d)/g, MINUS);
export function signed(v, d = 2) {
  if (v == null || Number.isNaN(v)) return "n/a";
  const a = Math.abs(v).toFixed(d);
  return (v > 0 && +a !== 0 ? "+" : v < 0 && +a !== 0 ? MINUS : "") + a;
}
export const plain = (v, d = 2) => (v == null || Number.isNaN(v) ? "n/a" : minus(v.toFixed(d)));
export const unitText = (data) => String(data.units_label || data.units || "");
/** decimals for a regional anomaly of this case */
export const decimals = (data) => (data.units === "mm/day" ? 2 : 2);
export const tickDecimals = (data) => {
  const h = data.scale.max / 2;
  for (let d = 0; d < 3; d++) if (Math.abs(h - +h.toFixed(d)) < 1e-9) return d;
  return 2;
};

// ------------------------------------------------------------------------------------------------ colour (OKLab mixing)
function hexRgb(hex) {
  const h = String(hex).trim().replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const unlin = (c) => { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return clamp(Math.round(c * 255), 0, 255); };
function toLab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
function ramp(stops) {          // stops: array of [r,g,b] equally spaced 0..1 -> f(u) rgb
  const labs = stops.map(toLab), n = stops.length - 1;
  return (u) => {
    u = clamp(u, 0, 1); const x = u * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
    return fromLab(labs[i].map((v, k) => v + (labs[i + 1][k] - v) * f));
  };
}

/** The anomaly scale of a case. rgb(v) for a value in the data units; symmetric about zero, clipped at +/- max. */
export function makeScale(data) {
  const mid = hexRgb(tok("viz-mid", "#ECE8DD"));
  const cool = [1, 2, 3, 4].map((i) => hexRgb(tok("viz-cool-" + i, "#3F7FB0")));
  const warm = [1, 2, 3, 4].map((i) => hexRgb(tok("viz-warm-" + i, "#C86E2E")));
  const wetUp = data.palette === "wet_up";
  const posStops = [mid].concat(wetUp ? cool : warm), negStops = [mid].concat(wetUp ? warm : cool);
  const pos = ramp(posStops), neg = ramp(negStops);
  const max = data.scale.max;
  const rgb = (v, floor = 0) => {                 // floor: skip the palest part of the ramp (for thin lines)
    if (v == null || Number.isNaN(v)) return null;
    const u = clamp(Math.abs(v) / max, 0, 1), uu = floor && u > 0 ? floor + (1 - floor) * u : u;
    return v >= 0 ? pos(uu) : neg(uu);
  };
  const css = (v, floor = 0, a = 1) => { const c = rgb(v, floor); return c ? (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`) : "transparent"; };
  const gradient = () => {
    const parts = [];
    for (let i = 0; i <= 20; i++) { const v = -max + (2 * max * i) / 20; parts.push(`${css(v)} ${(i * 5)}%`); }
    return `linear-gradient(90deg, ${parts.join(", ")})`;
  };
  return { max, rgb, css, gradient, mid: `rgb(${mid.join(",")})` };
}

/** Legend element: gradient bar, printed range with units, baseline sentence. */
export function legend(data, scale, { caption = true } = {}) {
  const m = scale.max, d = tickDecimals(data), u = unitText(data);
  const ticks = [-m, -m / 2, 0, m / 2, m];
  const box = el("div", { class: "viz-legend" });
  box.append(
    el("div", { class: "viz-legend__bar", role: "img", "aria-label": `Colour scale from ${signed(-m, d)} to ${signed(m, d)} ${u} difference from baseline, neutral at zero`, style: `background:${scale.gradient()}` }),
    el("div", { class: "viz-legend__ticks viz-num", "aria-hidden": "true" }, ticks.map((v) => el("span", { class: v === 0 ? "viz-legend__zero" : "" }, v === 0 ? "0 (baseline)" : signed(v, d)))),
  );
  if (typeof caption === "string") box.append(el("div", { class: "viz-legend__cap" }, caption));
  else if (caption) box.append(el("div", { class: "viz-legend__cap" }, `Difference from baseline in ${u}. Baseline: ${data.baseline.text}. Values beyond ±${m} ${u} use the end colour.`));
  return box;
}

// ------------------------------------------------------------------------------------------------ prepared case data
const prepared = new WeakMap();
/** Typed arrays and a regular grid index, computed once per data object. */
export function prepare(data) {
  if (prepared.has(data)) return prepared.get(data);
  const c = data.cells, nY = data.years.length, nC = c.lat.length;
  const A = new Float32Array(nY * nC);
  for (let y = 0; y < nY; y++) for (let i = 0; i < nC; i++) { const v = c.anom[y][i]; A[y * nC + i] = v == null ? NaN : v; }
  const { dlat, dlon } = data.grid;
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (let i = 0; i < nC; i++) { la0 = Math.min(la0, c.lat[i]); la1 = Math.max(la1, c.lat[i]); lo0 = Math.min(lo0, c.lon[i]); lo1 = Math.max(lo1, c.lon[i]); }
  const ny = Math.round((la1 - la0) / dlat) + 1, nx = Math.round((lo1 - lo0) / dlon) + 1;
  const grid = new Int32Array(ny * nx).fill(-1);
  for (let i = 0; i < nC; i++) grid[Math.round((c.lat[i] - la0) / dlat) * nx + Math.round((c.lon[i] - lo0) / dlon)] = i;
  const rv = data.regional.anomaly;
  const P = { nY, nC, A, lat: c.lat, lon: c.lon, years: data.years, ny, nx, grid, la0, lo0, bbox: { s: la0 - dlat / 2, n: la1 + dlat / 2, w: lo0 - dlon / 2, e: lo1 + dlon / 2 }, regional: rv };
  prepared.set(data, P);
  return P;
}
export function valueAt(P, t, i) {
  const y0 = Math.min(P.nY - 1, Math.max(0, Math.floor(t))), y1 = Math.min(P.nY - 1, y0 + 1), f = t - y0;
  const a = P.A[y0 * P.nC + i], b = P.A[y1 * P.nC + i];
  if (Number.isNaN(a)) return b; if (Number.isNaN(b)) return a;
  return a + (b - a) * f;
}
export function regionalAt(data, yi) { const v = data.regional.anomaly[yi]; return v == null ? null : v; }

// ------------------------------------------------------------------------------------------------ timeline and controls
/** Year player. onFrame(tView, tRaw) is called for every change; tView is eased (each year holds a moment) unless ease:false. */
export function timeline({ n, stepMs = 700, ease = true, start = 0, onFrame, onState, onIndex }) {
  let t = clamp(start, 0, n - 1), playing = false, last = 0, raf = 0, lastIdx = Math.round(t);
  const reduce = reducedMotion();
  const view = (x) => {
    if (!ease) return x;
    const i = Math.floor(x), f = x - i; if (i >= n - 1) return n - 1;
    const u = clamp((f - 0.28) / 0.72, 0, 1); return i + u * u * (3 - 2 * u);
  };
  const emit = () => { onFrame && onFrame(view(t), t); const i = Math.round(view(t)); if (i !== lastIdx) { lastIdx = i; onIndex && onIndex(i); } };
  function frame(now) {
    if (!playing) return;
    const dt = Math.min(300, now - last);   // time-based: a slow frame skips ahead instead of slowing the whole play-through last = now;
    t = Math.min(n - 1, t + dt / stepMs);
    emit();
    if (t >= n - 1) { playing = false; onState && onState(); } else raf = requestAnimationFrame(frame);
  }
  const api = {
    get t() { return t; }, get index() { return Math.round(view(t)); }, get playing() { return playing; }, get reduced() { return reduce; },
    play() {
      if (reduce) { api.next(); return; }
      if (t >= n - 1 - 1e-6) t = 0;
      playing = true; last = performance.now(); raf = requestAnimationFrame(frame); onState && onState();
    },
    pause() { if (!playing) return; playing = false; cancelAnimationFrame(raf); t = Math.round(view(t)); emit(); onState && onState(); },
    toggle() { playing ? api.pause() : api.play(); },
    seek(i) { playing = false; cancelAnimationFrame(raf); t = clamp(Math.round(i), 0, n - 1); emit(); onState && onState(); },
    next() { api.seek(api.index >= n - 1 ? 0 : api.index + 1); },
    destroy() { playing = false; cancelAnimationFrame(raf); },
  };
  return api;
}

let uid = 0;
export const nextId = (p) => `${p}-${++uid}`;

/** Play button, scrubber and year readout. Returns {node, sync()}; labelFn(i) gives the text for step i. */
export function controls(tl, { n, labelFn, name = "year", extra = [], wide = false, showYear = true }) {
  const id = nextId("viz-scrub");
  const reduce = tl.reduced;
  const btn = el("button", { type: "button", class: "viz-btn viz-btn--primary", onclick: () => tl.toggle() }, reduce ? "Next " + name : "Play");
  const range = el("input", { type: "range", id, min: 0, max: n - 1, step: 1, value: tl.index, "aria-label": `Choose ${name}`, oninput: (e) => tl.seek(+e.target.value) });
  const out = el("output", { class: "viz-year viz-num" + (wide ? " viz-year--wide" : ""), for: id });
  const sync = () => {
    const i = tl.index;
    range.value = i; out.textContent = labelFn(i); range.setAttribute("aria-valuetext", labelFn(i));
    if (!reduce) btn.textContent = tl.playing ? "Pause" : "Play";
  };
  const node = el("div", { class: "viz-controls" }, btn, el("div", { class: "viz-scrub" }, range, showYear ? out : null), ...extra);
  sync();
  return { node, sync, btn, range };
}

/** Left/right arrows and space on a focusable stage drive the timeline (native controls remain the primary route). */
export function stageKeys(stage, tl) {
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); tl.seek(tl.index + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); tl.seek(tl.index - 1); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); tl.toggle(); }
    else if (e.key === "Home") { e.preventDefault(); tl.seek(0); }
    else if (e.key === "End") { e.preventDefault(); tl.seek(1e9); }
  });
}

export function sizeObserver(node, cb) {
  if (!window.ResizeObserver) { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); }
  let raf = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(cb); });
  ro.observe(node);
  return () => ro.disconnect();
}

export function regionalMeanText(data, yi) {
  const v = data.regional.anomaly[yi];
  return v == null ? "no regional value this year" : `${signed(v, 2)} ${unitText(data)}`;
}

/** One-line description of a case for summaries. */
export function caseLine(data) {
  const y = data.years, last = y.length - 1;
  return `${data.measure} over ${data.region_name}, ${y[0]}–${y[last]} (${data.season_text}), shown as the difference from ${data.baseline.text}`;
}

/** Collapsed table of the regional values (a text route to the same numbers the graphic shows). */
export function regionalDetails(data, label = "Regional values by year (table)", ctx = "") {
  const u = unitText(data);
  const rows = data.regional.years.map((y, i) => [String(y), data.regional.anomaly[i] == null ? "n/a" : signed(data.regional.anomaly[i], 2)]);
  return el("details", { class: "viz-details" }, el("summary", {}, label), dataTable(["Year", `Regional average, ${u} vs baseline`], rows, `Regional average difference from baseline by year, ${u}${ctx ? ", " + ctx : ""}`));
}

export function dataTable(headers, rows, caption) {
  const t = el("table", {}, el("caption", { class: "sr-only", style: "position:absolute;left:-9999px" }, caption));
  t.append(el("thead", {}, el("tr", {}, headers.map((h) => el("th", { scope: "col" }, h)))));
  t.append(el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c, i) => (i === 0 ? el("th", { scope: "row" }, c) : el("td", {}, c)))))));
  return el("div", { class: "viz-table-scroll", tabindex: "0", role: "region", "aria-label": caption }, t);
}
