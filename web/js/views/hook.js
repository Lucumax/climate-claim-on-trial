// Home hook: "Same NASA record. Opposite headlines. Which one describes the whole record?"
// R7 layout: a large globe beside the story (H1, the whole-record readout, the record chart, the source line and one primary action), everything visible at once on load.
// The comparison (question, window presets, the answer), the "More" notes and the region chooser are ordinary content below or behind real buttons. The Replay button runs the
// timed demonstration: a short 15-year window is chosen on the yearly record, the headline follows it, then the whole record puts it in context. Pick another case region, or click anywhere else on the Earth (land or sea) to explore NASA AIRS air temperature there.
// Every number is computed here, in the browser, from the archived case series or the NASA AIRS library (same least squares as the Investigate page). Nothing is typed in.
// URL: ?r=C-B starts on a case region, ?at=lat,lng starts on an exploration point, ?spin=0 holds the globe still, ?t=ms freezes the timeline (for video capture).
// Prototype history: web/proto/hook.html (variants a, b, c). This is variant A's layout with C's behaviour.
import { h, fmtNum, U, range, announce } from "../util.js";
import { olsTest } from "../stats.js";
import { render as renderGlobe, hasWebGL } from "../viz/globe-trials.js";
import { loadGeo } from "../viz/geo.js";
import { WITHHELD_LINE } from "./common.js";
import { loadLibrary, libraryPlan, libraryRegional, completeSeasons } from "../library.js";

const NS = "http://www.w3.org/2000/svg";
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);        // in-out cubic
const mean = a => a.reduce((p, c) => p + c, 0) / a.length;
const phone = () => window.matchMedia("(max-width: 700px)").matches;
const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const numWord = n => NUM[n] || String(n);
const NO2 = "NO₂";

const WORDS = {
  temp: { down: "cooling", flat: "holding steady", up: "warming", fast: "warming" },
  rain: { down: "drying", flat: "holding steady", up: "getting wetter" },
  haze: { down: "getting clearer", flat: "holding steady", up: "getting hazier" },
  no2: { down: "falling", flat: "holding steady", up: "rising" },                       // a tropospheric column, not ground-level air quality: never "cleaner" or "dirtier"
  other: { down: "falling", flat: "holding steady", up: "rising" },
};
const SUBJECT = {
  "C-A": ["Summer days in the Southeast US", "are"], "C-B": ["The Sahel", "is"], "C-C": ["Alaska", "is"], "C-D": ["Wisconsin’s summer air", "is"],
  "C-E1": [`${NO2} over the eastern US`, "is"], "C-E2": [`${NO2} over northern India`, "is"],
};
const KICKER = {
  "C-A": "Summer daytime land surface temperature, southeastern US", "C-B": "Wet-season rainfall, central Sahel", "C-C": "Yearly air temperature, interior and western Alaska",
  "C-D": "Summer aerosol optical depth (haze), Wisconsin", "C-E1": `Yearly tropospheric ${NO2} column, eastern US`, "C-E2": `Yearly tropospheric ${NO2} column, northern India`,
};
const PRODUCT = { "C-A": "NASA MODIS Terra", "C-B": "NASA GPM IMERG", "C-C": "NASA MERRA-2", "C-D": "NASA MODIS Aqua", "C-E1": "NASA Aura OMI", "C-E2": "NASA Aura OMI" };
const BTN = { "C-A": "Southeast US", "C-B": "Sahel", "C-C": "Alaska", "C-D": "Wisconsin", "C-E1": "Eastern US", "C-E2": "Northern India" };
const EXPLORE = [["India", 22.5, 78.5], ["North China", 38.5, 114.5], ["Mongolia", 47.5, 105.5], ["North Atlantic", 57.5, -37.5]];
const POSTER_ALT = "Two views of the Earth side by side, with all six registered case regions outlined. On the left, North America: interior and western Alaska and Wisconsin are colored by each cell's estimated change per decade, and the Southeastern United States and the eastern United States are hatched because their rulings are withheld. On the right, Africa and Asia: the central Sahel is colored by each cell's estimated change per decade, and northern India is hatched because its ruling is withheld. Open the case files for each ruling.";
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLat = v => `${Math.abs(v).toFixed(1).replace(/\.0$/, "")}°${v >= 0 ? "N" : "S"}`, fmtLon = v => `${Math.abs(v).toFixed(1).replace(/\.0$/, "")}°${v >= 0 ? "E" : "W"}`;
const plain = msg => Object.assign(new Error(msg), { plain: true });

function countryAt(geo, lat, lng) {                                                  // even-odd test per country (islands and holes handled)
  const odd = new Map();
  for (const r of geo.countries) {
    const [w, s, e, n] = r.bb; if (lng < w || lng > e || lat < s || lat > n) continue;
    let inside = false; const p = r.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; }
    if (inside) odd.set(r.name, !odd.get(r.name));
  }
  for (const [k, on] of odd) if (on && k) return k;
  return null;
}

/** The hook for the Home page. claims: the bundle's case claims. Returns { node, start(), dispose() } or null when no case has a usable record. */
export function hook(bundle) {
  const claims = bundle.claims.filter(c => c.regional && !c.synthetic && Array.isArray(c.regional.years) && c.regional.years.length >= 8);
  const claimOf = id => claims.find(c => c.id === id);
  const q = new URLSearchParams(location.search), hq = new URLSearchParams((location.hash.split("?")[1]) || "");
  const param = k => q.get(k) != null ? q.get(k) : hq.get(k);
  const first = claimOf(param("r")) || claimOf("C-C");
  if (!first) return null;
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let dead = false;

  const kindOf = c => (/no2|nitrogen/i.test(`${c.variable.key} ${c.variable.plain} ${c.claim_text}`) ? "no2" : /degC|degF/.test(c.regional.units) ? "temp" : /mm/.test(c.regional.units) ? "rain" : /unitless|AOD/i.test(c.regional.units + c.variable.key) ? "haze" : "other");

  // ---------------------------------------------------------------- the page furniture
  const chip = (attrs, ...kids) => h("button", { type: "button", ...attrs }, ...kids);
  // Hero: the story (H1, the readout, the record, the source, one primary action) beside a large globe. Everything in the hero is visible at once, nothing waits for a timer.
  // Below the hero: the comparison (question, window presets, the answer), the "More" disclosures and the secondary links. The guided card (guided.js) goes between the two.
  const root = h("section", { class: "hook", "data-stage": "ready", "aria-labelledby": "page-title" },
    h("div", { class: "hk-hero" },
      h("h1", { id: "page-title", tabindex: "-1", class: "hk-h1" }, h("span", { id: "hk-h1a" }, "Same NASA record. "), h("span", { id: "hk-h1b" }, "Opposite headlines.")),
      h("section", { class: "hk-globe", "aria-labelledby": "hk-globe-h" },
        h("h2", { class: "sr-only", id: "hk-globe-h" }, "Where the trials are held"),
        h("div", { class: "hk-globe-host", id: "hk-globe" }),
        h("div", { class: "hk-bar", id: "hk-bar" },
          chip({ class: "hk-tool hk-legend-btn", id: "hk-legend-btn", "aria-expanded": "false", "aria-controls": "hk-legend", hidden: true }, "Color key"),
          chip({ class: "hk-tool hk-region-btn", id: "hk-region-btn", "aria-expanded": "false", "aria-controls": "hk-regions" }, "Try another region")),
        h("div", { class: "hk-regions", id: "hk-regions", role: "group", "aria-label": "Try another region", hidden: true },
          h("p", { class: "hk-regions-h", id: "hk-regions-h" }, "Press a region on the globe, or anywhere else, land or sea, to explore it."),
          h("div", { class: "hk-regions-row" },
            h("div", { class: "hk-regions-g" }, h("span", { class: "hk-regions-l", id: "hk-rl-c" }, "Case regions"), h("span", { class: "hk-regions-btns", id: "hk-regions-cases", role: "group", "aria-labelledby": "hk-rl-c" })),
            h("div", { class: "hk-regions-g" }, h("span", { class: "hk-regions-l", id: "hk-rl-x" }, "Explore, not a trial"), h("span", { class: "hk-regions-btns", id: "hk-regions-x", role: "group", "aria-labelledby": "hk-rl-x" }))),
          h("p", { class: "hk-peek", id: "hk-peek", hidden: true })),
        h("p", { class: "hk-msg", id: "hk-msg", role: "status", hidden: true })),
      h("div", { class: "hk-cta", id: "hk-cta" }),
      h("div", { class: "hk-disclose" }, h("p", { class: "hk-src", id: "hk-src" }), h("p", { class: "hk-ill" }, "Illustrative headlines written from the numbers, not real news")),
      h("div", { class: "hk-readout" },
        h("p", { class: "hk-kicker", id: "hk-kicker" }, " "),
        h("div", { class: "hk-head", id: "hk-readout", "data-mode": "full" }, h("span", { class: "hk-lead", id: "hk-lead" }, " "), h("span", { class: "hk-num num", id: "hk-num" }, " ")),
        h("p", { class: "hk-est", id: "hk-est" }, "Headline demo: least-squares estimate")),
      h("div", { class: "hk-fig", id: "hk-fig", role: "group", "aria-labelledby": "hk-kicker" })),
    h("div", { class: "hk-below" },
      h("section", { class: "hk-compare", "aria-labelledby": "hk-q" },
        h("h2", { class: "hk-q", id: "hk-q" }),
        h("div", { class: "hk-pick", id: "hk-pick", role: "group", "aria-label": "Choose a window" },
          chip({ class: "hk-chip", "data-pick": "a", "aria-pressed": "false" }), chip({ class: "hk-chip", "data-pick": "b", "aria-pressed": "false" }), chip({ class: "hk-chip", "data-pick": "full", "aria-pressed": "false" }),
          h("span", { class: "hk-hint", id: "hk-hint" }, "Drag the shaded window along the record."),
          chip({ class: "hk-replay", id: "hk-replay" }, "Replay")),
        h("p", { class: "hk-resolve", id: "hk-resolve", hidden: true }),
        h("div", { class: "hk-link", id: "hk-link", hidden: true }),
        h("details", { class: "hk-more", id: "hk-more" }, h("summary", {}, "More about these estimates"), h("div", { class: "hk-more-body", id: "hk-more-body" }))),
      h("details", { class: "hk-more hk-more-globe" }, h("summary", {}, "Where the trials are held"),
        h("div", { class: "hk-more-body" }, h("p", {}, `${numWord(claims.length)} registered regions. Each grid cell is colored by its estimated change per decade, and withheld cases are hatched. Imagery: NASA Blue Marble, muted.`))),
      h("div", { class: "hk-actions" }, h("a", { class: "btn", href: "#/investigate" }, "Investigate a question"), h("a", { class: "btn-text", href: "#/cases" }, "Explore registered cases"))));
  const $ = id => root.querySelector("#" + id);
  const fig = $("hk-fig"), lead = $("hk-lead"), num = $("hk-num"), head = $("hk-readout"), kicker = $("hk-kicker"), msg = $("hk-msg"), linkBox = $("hk-link"), globeHost = $("hk-globe"), moreBody = $("hk-more-body");
  const chipEls = [...root.querySelectorAll(".hk-pick .hk-chip")];
  const say = t => announce(t);

  // ---------------------------------------------------------------- the case records (from the bundles) and what each is called
  function caseSpec(c) {
    const r = c.regional, y0 = r.years[0], y1 = r.years[r.years.length - 1], sub = SUBJECT[c.id] || [cap(c.region.name.replace(/^the /i, "")), "is"];
    const prodName = PRODUCT[c.id] || ("NASA " + String(c.product.name || "").replace(/\s*\(.*$/, "").trim());
    const kind = c.data_kind === "model_reanalysis" ? "model-based" : "satellite observation";
    const v = c.verdict, withheld = v.branch === "withheld";
    return {
      type: "case", id: c.id, kind: kindOf(c), subject: sub[0], verb: sub[1], years: r.years, ser: r.anomaly, units: U(r.units),
      kicker: `${KICKER[c.id] || `${cap(c.variable.plain)}, ${c.region.name}`}, ${range(y0, y1)}`, src: `${prodName} · ${kind} · ${range(y0, y1)}`,
      short: c.region.name, box: c.region.box, claimId: c.id, verdict: v.id || v.branch, sen: r.sen && Number.isFinite(r.sen.slope_per_decade) ? r.sen.slope_per_decade : null,
      link: { href: `#/case/${c.id}`, text: `Open case ${c.id.replace("-", "–")}`,
        lead: withheld ? `Case ${c.id.replace("-", "–")}: no verdict given.` : `Case ${c.id.replace("-", "–")}, tested on the whole record: ${v.label}.`,
        note: "We selected these two windows to illustrate how the estimated trend changes with the years. Both describe their selected periods; neither represents the full record. Only the registered test on the whole record gets a verdict.", must: withheld ? WITHHELD_LINE : "" },
    };
  }

  // ---------------------------------------------------------------- exploration: any other point on the globe, from the NASA AIRS library
  const EXP = { variable: "airs_tair", span: 5 };
  async function exploreSpec(lat, lng) {
    lng = ((lng + 540) % 360) - 180;
    const geo = await loadGeo().catch(() => null);
    const country = geo ? countryAt(geo, lat, lng) : null;                              // only used to name the place; the ocean is explored too (AIRS covers it)
    const lib = (await loadLibrary()).find(v => v.key === EXP.variable);
    if (!lib) throw plain("The NASA satellite library could not be read just now, so no exploration is available.");
    const s = clamp(Math.floor(lat) - 2, -90, 85), w = clamp(Math.floor(lng) - 2, -180, 175), box = { s, n: s + EXP.span, w, e: w + EXP.span };
    const plan = libraryPlan(lib, box);
    if (plan.empty) throw plain(`The NASA library has no air-temperature value for ${fmtLat(lat)} ${fmtLon(lng)}: that spot is empty in the data. Try a point nearby.`);
    const y0 = lib.since, y1 = lib.lastMonth === 12 ? lib.last : lib.last - 1;
    let data; try { data = await libraryRegional({ variable: lib, box, y0, y1 }); } catch (e) { throw plain(`The NASA library has no usable air-temperature data inside that box (${e && e.message ? e.message : "no data"}). Try a point nearby.`); }
    const full = completeSeasons(data.rows, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], y0, y1).rows, by = new Map();
    for (const r of full) { const a = by.get(r.year) || []; a.push(r.value); by.set(r.year, a); }
    const years = [...by.keys()].sort((a, b) => a - b), vals = years.map(y => mean(by.get(y))), m0 = mean(vals);
    if (years.length < 10) throw plain("That place has too few complete years of satellite data for an exploration.");
    const place = `${fmtLat((box.s + box.n) / 2)} ${fmtLon((box.w + box.e) / 2)}`, yrs = range(years[0], years[years.length - 1]);
    return {
      type: "explore", id: "explore", kind: "temp", subject: country ? `This ${EXP.span}° box in ${country}` : `This ${EXP.span}° box at ${place}`, verb: "is", years, ser: vals.map(v => v - m0), units: "°C",
      kicker: `Exploration · AIRS surface air temperature, yearly mean, ${EXP.span}° box centered ${place}, ${yrs}`, src: `NASA AIRS · satellite retrieval · ${yrs}`,
      short: country || place, box, center: { lat: (box.s + box.n) / 2, lng: (box.w + box.e) / 2 },
      link: { href: `#/investigate?src=library&v=${EXP.variable}&b=${box.s},${box.n},${box.w},${box.e}&y=${years[0]}-${years[years.length - 1]}&s=ALL`, text: "Open this place in Investigate",
        lead: "Exploration, not a trial: no registered test.", note: "Nobody registered this question before looking, so the windows show what is possible, not what is true. AIRS covers land and sea, and the box takes in whatever lies inside it." },
    };
  }

  // ---------------------------------------------------------------- dataset in play (everything the chart and headline read)
  let years, ser, units, Y0, Y1, N, WIN, PRESET, SLOPES, fullFit, cache, spec, STEADY, FASTAT, DEC, AGREE = false, CAN_FLIP = true, TONES;
  const winStats = a => {                                                              // least squares over years a..a+WIN-1, per decade
    const idx = years.map((v, i) => i).filter(i => years[i] >= a && years[i] <= a + WIN - 1), t = idx.map(i => years[i]), v = idx.map(i => ser[i]), r = olsTest(t, v);
    return { a, b: a + WIN - 1, slope: r.slope * 10, per: r.slope, tm: mean(t), ym: mean(v), n: idx.length };
  };
  const win = a => { a = clamp(Math.round(a), Y0, Y1 - WIN + 1); if (!cache.has(a)) cache.set(a, winStats(a)); return cache.get(a); };
  const signedFmt = v => fmtNum(v, DEC).replace(/^(\d)/, "+$1");
  const tone = s => (s <= -STEADY ? "down" : s < STEADY ? "flat" : "up");
  const word = (s, base) => { const W = WORDS[spec.kind], t = tone(s); return t === "up" && spec.kind === "temp" && !base && s >= FASTAT ? W.fast : W[t]; };
  const said = w => (spec.kind === "no2" ? `${NO2} is ${w}` : w);                    // "the record says NO₂ is falling", "the record says warming"

  function setData(sp) {
    spec = sp;
    const pts = sp.years.map((y, i) => [y, sp.ser[i]]).filter(p => p[1] != null && Number.isFinite(p[1]));
    years = pts.map(p => p[0]); ser = pts.map(p => p[1]); units = sp.units;
    Y0 = years[0]; Y1 = years[years.length - 1]; N = years.length;
    WIN = Math.min(15, N - 3); cache = new Map();                                      // 15-year windows, or the longest that still leaves room to slide
    const sd = Math.sqrt(mean(ser.map(v => (v - mean(ser)) ** 2)));
    STEADY = sp.kind === "temp" ? 0.3 : 0.15 * sd; FASTAT = 1;
    const need = Math.ceil(0.8 * WIN), all = [];
    for (let a = Y0; a <= Y1 - WIN + 1; a++) { const w = win(a); if (w.n >= need) all.push(w); }
    CAN_FLIP = all.length >= 2;
    const lo = CAN_FLIP ? all.reduce((p, c) => (c.slope < p.slope ? c : p)) : win(Y0), hi = CAN_FLIP ? all.reduce((p, c) => (c.slope > p.slope ? c : p)) : win(Y0);
    PRESET = { a: lo.a, b: hi.a };
    const r = olsTest(years, ser), mt = mean(years), my = mean(ser);
    fullFit = { slope: r.slope * 10, per: r.slope, intercept: my + r.slope * (Y0 - mt), n: N };
    const mx = Math.max(Math.abs(lo.slope), Math.abs(hi.slope), Math.abs(fullFit.slope));
    DEC = mx >= 100 ? 0 : mx >= 10 ? 1 : mx >= 0.1 ? 2 : mx >= 0.01 ? 3 : 4;
    SLOPES = { a: lo.slope, b: hi.slope, full: fullFit.slope };
    TONES = { a: tone(lo.slope), b: tone(hi.slope), full: tone(fullFit.slope) };
    AGREE = CAN_FLIP && TONES.a === TONES.b;
    window.__hookSlopes = SLOPES;
    const d = document.documentElement.dataset;
    Object.assign(d, { slopeA: lo.slope.toFixed(DEC), slopeB: hi.slope.toFixed(DEC), slopeFull: fullFit.slope.toFixed(DEC), winA: `${lo.a}-${lo.b}`, winB: `${hi.a}-${hi.b}`, region: sp.id, agree: String(AGREE) });
    $("hk-src").textContent = sp.src;
    $("hk-resolve").textContent = resolveText(); $("hk-resolve").hidden = false;
    kicker.dataset.base = sp.kicker; kicker.textContent = sp.kicker;
    $("hk-h1b").textContent = AGREE ? "Every window agrees." : TONES.a !== "flat" && TONES.b !== "flat" ? "Opposite headlines." : "Different windows, different headlines.";
    $("hk-q").textContent = AGREE ? `Same NASA record, and every ${WIN}-year window points the same way. Choosing a window would not change the headline.` : "Which one describes the whole record?";
  }

  // ---------------------------------------------------------------- the resolving line: what the whole record says, and what the case's own test said (from its bundle)
  function resolveText() {
    const u = `${signedFmt(SLOPES.full)} ${units} per decade`, ft = TONES.full, fw = said(word(SLOPES.full, true)), a = win(PRESET.a), b = win(PRESET.b);
    const says = ft === "flat" ? `The full ${N}-year record shows no clear change (${u})` : `The full ${N}-year record says ${fw} (${u})`;
    if (spec.type === "explore") return `${says}. No registered test here: open Investigate to test it yourself.`;
    const odd = [...new Set([a, b].filter(w => tone(w.slope) !== ft).map(w => `“${said(word(w.slope, true))}”`))];
    const short = !CAN_FLIP ? "" : AGREE ? ` Every ${WIN}-year window points the same way.` : odd.length ? ` The ${odd.join(" and ")} ${odd.length > 1 ? "describe short windows" : "describes a short window"} of years, not the whole record.` : "";
    switch (spec.verdict) {
      case "supported": return `${says}, and it holds up when tested.${short}`;
      case "partly_supported": return `${says}, but only part of the claim holds up when tested.${short}`;
      case "contradicted": return `${says}, which runs against the claim, and it holds up when tested.${short}`;
      case "not_supported": return `${says}, but the record does not show the claimed change at our bar.${short}`;
      case "withheld": return `${says}, but we cannot rule on this case yet: the checks a verdict depends on did not pass. Open the case file to see why.${short}`;
      default: return `${says}.${short}`;
    }
  }

  // ---------------------------------------------------------------- state
  const S = { draw: 0, start: 0, fstart: 0, winVis: 0, fit: 0, full: 0, mode: "none" };   // mode: none | win | full
  let lastKey = "";

  // ---------------------------------------------------------------- the chart (own SVG so the window can be dragged). Real plot height (R7): 204 / 180 / 132 px inside a 264 / 240 / 192 px SVG.
  let C = null;                                                                       // geometry and element handles for the current width
  function build() {
    const W = Math.max(280, Math.round(fig.clientWidth)), narrow = W < 400;                  // narrow: tick density and label length only; the height is chosen separately
    const H = W >= 480 ? 264 : W >= 400 ? 240 : 192;
    const m = { l: narrow ? 36 : 48, r: narrow ? 8 : 16, t: 40, b: 28 };
    const lo0 = Math.min(...ser), hi0 = Math.max(...ser), pad = (hi0 - lo0) * 0.08, lo = lo0 - pad, hi = hi0 + pad;
    const xs = v => m.l + (v - Y0) / (Y1 - Y0) * (W - m.l - m.r), ys = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-label": `${cap(spec.kicker)}, anomaly in ${units}, ${Y0} to ${Y1}. Drag the shaded window, or use the buttons, to choose a ${WIN}-year window.`, role: "group" });
    const maxTicks = Math.max(2, Math.floor((H - m.t - m.b) / 34));
    const nice = [1, 2, 5].flatMap(k => [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000].map(p => k * p)).sort((a, b) => a - b);
    const step = [0.5, ...nice].filter(s => s > 0).sort((a, b) => a - b).find(s => (hi - lo) / s <= maxTicks) || 5;
    const sdec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      svg.append(sv("line", { class: "grid", x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t) }));
      const tx = sv("text", { x: m.l - 8, y: ys(t) + 4, "text-anchor": "end" }); tx.textContent = fmtNum(Math.abs(t) < step / 1e3 ? 0 : t, Math.max(0, sdec)); svg.append(tx);
    }
    const unit = sv("text", { x: m.l, y: 11 }); unit.textContent = narrow && units.length > 8 ? "Anomaly" : `Anomaly, ${units}`; svg.append(unit);
    if (lo < 0 && hi > 0) svg.append(sv("line", { class: "zero", x1: m.l, x2: W - m.r, y1: ys(0), y2: ys(0) }));
    svg.append(sv("line", { class: "axis", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
    const yrAll = [...new Set([Y0, ...[1980, 1990, 2000, 2010, 2020].filter(y => y > Y0 + 2 && y < Y1 - 1), Y1])];
    const showTicks = [];                                                              // both record endpoints stay; a middle tick that would touch one is dropped
    for (const y of yrAll) {
      const last = () => showTicks[showTicks.length - 1];
      if (y === Y1) { while (showTicks.length > 1 && xs(y) - xs(last()) < 36) showTicks.pop(); showTicks.push(y); }
      else if (!showTicks.length || xs(y) - xs(last()) >= 36) showTicks.push(y);
    }
    for (const yr of showTicks) {
      const tx = sv("text", { x: xs(yr), y: H - m.b + 17, "text-anchor": "middle" }); tx.textContent = String(yr);
      svg.append(tx, sv("line", { class: "axis", x1: xs(yr), x2: xs(yr), y1: H - m.b, y2: H - m.b + 4 }));
    }
    // the record, revealed left to right through a clip
    const cid = "hk-clip";
    const defs = sv("defs"), cp = sv("clipPath", { id: cid }), cr = sv("rect", { x: m.l - 6, y: 0, width: 0, height: H });
    cp.append(cr); defs.append(cp); svg.append(defs);
    const rec = sv("g", { "clip-path": `url(#${cid})` });
    rec.append(sv("polyline", { class: "ser", points: years.map((v, i) => `${xs(v).toFixed(1)},${ys(ser[i]).toFixed(1)}`).join(" ") }));
    years.forEach((v, i) => rec.append(sv("circle", { class: "pt", cx: xs(v).toFixed(1), cy: ys(ser[i]).toFixed(1), r: narrow ? 2.4 : 2.8 })));
    // whole-record line and its label
    const fy = v => fullFit.intercept + fullFit.per * (v - Y0);
    const fl = sv("line", { class: "full-line", x1: xs(Y0), y1: ys(fy(Y0)), x2: xs(Y0), y2: ys(fy(Y0)) });
    const flab = sv("text", { class: "full-lbl", "text-anchor": "end", x: W - m.r, y: 11, opacity: 0 });
    flab.textContent = narrow ? "Whole record" : `Whole record ${range(Y0, Y1)}`;
    const fsw = sv("line", { class: "full-line full-sw", y1: 7, y2: 7, x1: 0, x2: 0, opacity: 0 });
    // hit area (click to place the window) under the window group
    const hit = sv("rect", { class: "plot-hit", x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b });
    // the window
    const g = sv("g", { class: "win-g", role: "slider", tabindex: 0, "aria-label": `${WIN}-year window, first year`, "aria-valuemin": Y0, "aria-valuemax": Y1 - WIN + 1 });
    const wr = sv("rect", { class: "win", y: m.t, height: H - m.t - m.b, "fill-opacity": 0.17 });
    const e1 = sv("line", { class: "win-edge", y1: m.t, y2: H - m.b }), e2 = sv("line", { class: "win-edge", y1: m.t, y2: H - m.b });
    const fit = sv("line", { class: "win-fit" });
    const grip = sv("rect", { class: "win-grip", y: m.t, height: H - m.t - m.b });
    const eh1 = sv("rect", { class: "win-edge-hit", y: m.t, width: 28, height: H - m.t - m.b }), eh2 = sv("rect", { class: "win-edge-hit", y: m.t, width: 28, height: H - m.t - m.b });   // wide transparent targets for the thin handles
    const hh = 22, hy = (m.t + H - m.b) / 2 - hh / 2;
    const h1 = sv("rect", { class: "win-handle", width: 9, height: hh, rx: 4.5, y: hy }), h2 = sv("rect", { class: "win-handle", width: 9, height: hh, rx: 4.5, y: hy });
    const m1 = sv("line", { class: "win-handle-mark", y1: hy + hh / 2 - 5, y2: hy + hh / 2 + 5 }), m2 = sv("line", { class: "win-handle-mark", y1: hy + hh / 2 - 5, y2: hy + hh / 2 + 5 });
    const lbl = sv("text", { class: "win-label", "text-anchor": "middle", y: m.t - 7 });
    g.append(wr, e1, e2, grip, eh1, eh2, fit, h1, h2, m1, m2, lbl);
    svg.append(rec, fl, hit, g, fsw, flab);
    fig.replaceChildren(svg);
    try { const L = flab.getComputedTextLength(); fsw.setAttribute("x1", W - m.r - L - 30); fsw.setAttribute("x2", W - m.r - L - 8); } catch (e) { /* no layout yet */ }
    C = { W, H, m, xs, ys, yearAt: x => Y0 + (x - m.l) / (W - m.l - m.r) * (Y1 - Y0), svg, cr, fl, flab, fsw, fy, g, wr, e1, e2, fit, grip, eh1, eh2, h1, h2, m1, m2, lbl, hit };
    wire(); apply();
  }

  function apply() {
    if (!C) return;
    const { m, W, xs, ys, cr, fl, flab, fsw, fy, g, wr, e1, e2, fit, grip, eh1, eh2, h1, h2, m1, m2, lbl } = C;
    cr.setAttribute("width", ((W - m.l - m.r + 12) * S.draw).toFixed(1));
    const w = win(S.start), fs = S.fstart, x0 = xs(fs - 0.5), x1 = xs(fs + WIN - 1 + 0.5), yl = x => w.ym + w.per * (x - w.tm);
    fig.dataset.tone = tone(w.slope);
    g.setAttribute("opacity", S.winVis.toFixed(3));
    g.style.pointerEvents = S.winVis < 0.05 ? "none" : "all";
    wr.setAttribute("x", x0); wr.setAttribute("width", x1 - x0);
    e1.setAttribute("x1", x0); e1.setAttribute("x2", x0); e2.setAttribute("x1", x1); e2.setAttribute("x2", x1);
    grip.setAttribute("x", x0); grip.setAttribute("width", x1 - x0); eh1.setAttribute("x", x0 - 14); eh2.setAttribute("x", x1 - 14);
    const fa = fs, fb = fs + WIN - 1, fe = fa + (fb - fa) * S.fit;
    fit.setAttribute("x1", xs(fa)); fit.setAttribute("y1", ys(yl(fa))); fit.setAttribute("x2", xs(fe)); fit.setAttribute("y2", ys(yl(fe)));
    h1.setAttribute("x", x0 - 4.5); h2.setAttribute("x", x1 - 4.5);
    m1.setAttribute("x1", x0 - 1.5); m1.setAttribute("x2", x0 - 1.5); m2.setAttribute("x1", x1 + 1.5); m2.setAttribute("x2", x1 + 1.5);
    lbl.setAttribute("x", clamp((x0 + x1) / 2, m.l + 40, W - m.r - 40)); lbl.textContent = range(w.a, w.b);
    g.setAttribute("aria-valuenow", w.a); g.setAttribute("aria-valuetext", `${w.a} to ${w.b}, estimated rate ${signedFmt(w.slope)} ${units} per decade`);
    const fe2 = Y0 + (Y1 - Y0) * S.full;
    fl.setAttribute("stroke-opacity", S.full > 0.001 ? 1 : 0); fl.setAttribute("x2", xs(fe2)); fl.setAttribute("y2", ys(fy(fe2)));
    const lo_ = clamp((S.full - 0.6) / 0.4, 0, 1).toFixed(2); flab.setAttribute("opacity", lo_); fsw.setAttribute("opacity", lo_);
  }

  // ---------------------------------------------------------------- headline, kicker, chips
  function chipLabels() {
    const f = (el, label, s, t) => { el.replaceChildren(); el.dataset.tone = t; const sp = document.createElement("span"); sp.textContent = label; const b = document.createElement("b"); b.className = "num"; b.textContent = signedFmt(s); el.append(sp, b); };
    const ra = range(PRESET.a, PRESET.a + WIN - 1), rb = range(PRESET.b, PRESET.b + WIN - 1);
    chipEls[0].setAttribute("aria-label", `${ra}, estimated rate ${signedFmt(SLOPES.a)} ${units} per decade`);
    chipEls[1].setAttribute("aria-label", `${rb}, estimated rate ${signedFmt(SLOPES.b)} ${units} per decade`);
    chipEls[2].setAttribute("aria-label", `Whole record, estimated rate ${signedFmt(SLOPES.full)} ${units} per decade`);
    f(chipEls[0], ra, SLOPES.a, TONES.a); f(chipEls[1], rb, SLOPES.b, TONES.b); f(chipEls[2], "Whole record", SLOPES.full, "full");
    chipEls[0].hidden = chipEls[1].hidden = !CAN_FLIP;
  }
  const sentence = (mode, w) => {
    const lc = t => (/^(The|This|Air|Summer) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);   // after "The whole record:" common nouns go lower case, names stay
    const sj = `${mode === "win" && !AGREE ? spec.subject : lc(spec.subject)} ${spec.verb}`;
    if (mode === "win") return AGREE ? `Every ${WIN}-year window agrees: ${sj} ${word(w.slope, true)}:` : `${sj} ${word(w.slope)}:`;
    return `The whole record: ${sj} ${word(SLOPES.full)}:`;
  };
  function setHeadline(animate) {
    if (S.mode === "none") { head.dataset.mode = "none"; return; }
    const w = win(S.start);
    const key = S.mode === "win" ? "w" + (AGREE ? "agree" : word(w.slope)) : "f";
    const L = sentence(S.mode, w), Nn = S.mode === "win" ? w.slope : SLOPES.full;
    head.dataset.mode = S.mode; head.dataset.tone = S.mode === "win" ? tone(w.slope) : "full";
    lead.textContent = L;
    num.textContent = `${signedFmt(Nn)} `;
    const sm = document.createElement("small"); sm.textContent = `${units} per decade`; num.append(sm);
    if (animate && !reduce && key !== lastKey) for (const el of [lead, num]) el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 460, easing: "cubic-bezier(.2,.7,.2,1)" });
    lastKey = key;
    kicker.textContent = S.mode === "win" ? `Window ${range(w.a, w.b)} · ${WIN} years` : `Whole record · ${range(Y0, Y1)} · ${N} years`;
    chipEls[0].setAttribute("aria-pressed", String(S.mode === "win" && S.start === PRESET.a));
    chipEls[1].setAttribute("aria-pressed", String(S.mode === "win" && S.start === PRESET.b));
    chipEls[2].setAttribute("aria-pressed", String(S.mode === "full"));
  }
  let liveT = 0;
  const sayLater = t => { clearTimeout(liveT); liveT = setTimeout(() => { if (!dead) say(t); }, 500); };
  function announceWin() { sayLater(S.mode === "win" ? `${range(win(S.start).a, win(S.start).b)}: ${lead.textContent} ${num.textContent}` : `Whole record: estimated rate ${signedFmt(SLOPES.full)} ${units} per decade`); }
  function announceFinal() {
    const a = win(PRESET.a), b = win(PRESET.b), u = `${units} per decade`;
    sayLater(CAN_FLIP ? `${spec.short}. ${range(a.a, a.b)}: ${spec.subject} ${spec.verb} ${word(a.slope, AGREE)}, ${signedFmt(a.slope)} ${u}. ${range(b.a, b.b)}: ${word(b.slope, AGREE)}, ${signedFmt(b.slope)} ${u}. Whole record: estimated rate ${signedFmt(SLOPES.full)} ${u}. ${$("hk-resolve").textContent} ${spec.link.lead}` : `${spec.short}. Whole record: estimated rate ${signedFmt(SLOPES.full)} ${u}. ${$("hk-resolve").textContent} ${spec.link.lead}`);
  }

  // ---------------------------------------------------------------- globe
  const G = { api: null, ready: false };
  const HOME_ALT = phone() ? 1.5 : 1.41;                                                // camera height: the Earth fills about 96% of the stage height (phone: 93%) at the usual 20-degree region
  function altFor(box) { const span = Math.max(box.n - box.s, (box.e - box.w) * 0.8); return clamp(HOME_ALT + (span - 20) / 80, HOME_ALT, 1.9); }
  const centerOf = b => [(b.s + b.n) / 2, (b.w + b.e) / 2];
  function flyTo(sp) {
    if (!G.ready || !G.api || !G.api.hasGlobe) return;
    const b = sp.box, [la, lo] = centerOf(b); G.api.focus(la, lo, sp.type === "explore" ? HOME_ALT + 0.1 : altFor(b), 900);
    if (sp.type === "case") { G.api.markBox(null); G.api.select(sp.id); } else { G.api.select(null); G.api.markBox(sp.box); }
  }
  const globeSec = root.querySelector(".hk-globe"), bar = $("hk-bar"), legendBtn = $("hk-legend-btn");
  let legendEl = null;
  function syncLegend() {                                                                // a phone shows the color key on request, in the page flow; wider screens always show it
    if (!legendEl) return;
    const ph = phone(), open = legendBtn.getAttribute("aria-expanded") === "true";
    legendBtn.hidden = !ph; legendEl.hidden = ph && !open;
  }
  legendBtn.addEventListener("click", () => { legendBtn.setAttribute("aria-expanded", String(legendBtn.getAttribute("aria-expanded") !== "true")); syncLegend(); });
  const mqPhone = window.matchMedia("(max-width: 700px)"), onMq = () => syncLegend();
  if (mqPhone.addEventListener) mqPhone.addEventListener("change", onMq);
  async function mountGlobe() {
    const poster = () => { const a = h("a", { href: "#/cases", class: "poster-link", "aria-label": "Open the case files" });
      for (const k of ["light", "dark"]) a.append(h("img", { class: `poster poster-${k}`, src: `img/globe-trials-${k}.jpg`, width: 1288, height: 645, alt: POSTER_ALT })); return a; };
    try {
      if (!hasWebGL()) { G.api = await renderGlobe(globeHost, bundle.claims, { poster: poster() }); return; }
      const [la, lo] = centerOf(spec.box);
      const opts = { height: "var(--hk-stage-h)", touchRotate: !phone(), labels: "focus", autoSpin: param("spin") !== "0", spinSpeed: 0.35, view: { lat: la, lng: lo, altitude: spec.type === "explore" ? HOME_ALT + 0.1 : altFor(spec.box) },
        onPick: k => selectCase(k.id, true), onPoint: p => selectPoint(p.lat, p.lng, true) };
      // The live globe takes a moment (the library, the textures, a phone's graphics chip). Until it has painted, the existing poster picture stands in for it, so the space is never blank.
      const wait = h("div", { class: "hk-poster-wait", "aria-hidden": "true" }, poster()); wait.querySelector("a").tabIndex = -1; globeHost.append(wait); globeHost.classList.add("is-waiting");
      try { G.api = await renderGlobe(globeHost, bundle.claims, opts); } finally { wait.remove(); globeHost.classList.remove("is-waiting"); }
      if (dead) { if (G.api) G.api.destroy(); G.api = null; return; }
      G.ready = !!G.api; window.__hookGlobe = G.api; globeHost.classList.add("is-live");
      // quiet controls: the persistent Pause button joins the corner bar; the color key moves out of the figure so it can sit directly under the Earth
      const turn = globeHost.querySelector(".viz-controls .viz-btn[aria-pressed]"); if (turn) { turn.classList.add("hk-tool"); turn.classList.remove("viz-btn"); bar.prepend(turn); }
      legendEl = globeHost.querySelector(".gt-chips"); if (legendEl) { legendEl.id = "hk-legend"; globeSec.append(legendEl); }
      syncLegend();
      document.documentElement.dataset.globeReady = "1";
    } catch (e) {
      console.error(e);
      if (!dead) { globeHost.replaceChildren(); try { G.api = await renderGlobe(globeHost, bundle.claims, { poster: poster() }); } catch (e2) { console.error(e2); } }
    }
  }

  // ---------------------------------------------------------------- the Replay demonstration (explicit, or frozen at ?t=ms for video capture)
  const HOLD = param("t") != null ? +param("t") : null;
  let raf = 0, t0 = 0, running = false, fired = {}, firstRun = true;
  const END = 7600;                                                                   // the Replay demonstration runs this long; a normal load does not play it
  const setStage = s => { root.dataset.stage = s; };
  function resetState() {
    Object.assign(S, { draw: 0, start: PRESET.a, fstart: PRESET.a, winVis: 0, fit: 0, full: 0, mode: "none" }); lastKey = ""; fired = {};
    head.dataset.mode = "none"; kicker.textContent = kicker.dataset.base; fig.dataset.tone = tone(SLOPES.a);
    chipEls.forEach(c => c.setAttribute("aria-pressed", "false"));
  }
  function finalState(speak = true) {                                                  // the complete, readable state: the whole record, its line, the answer. Every normal load and every region pick lands here at once.
    Object.assign(S, { draw: 1, start: PRESET.b, fstart: PRESET.b, winVis: CAN_FLIP ? 0.5 : 0, fit: 1, full: 1, mode: "full" });
    setHeadline(false); apply(); setStage("ready"); if (speak) announceFinal();
  }
  function settle(speak) { stop(); resetState(); finalState(speak); }
  function stop() { cancelAnimationFrame(raf); running = false; }
  function play() {
    stop(); resetState();
    const hold = firstRun ? HOLD : null; firstRun = false;
    if (reduce) { finalState(); return; }
    if (hold != null) { setStage(hold >= END ? "ready" : "intro"); step(hold); return; }      // ?t=2800 freezes the timeline at that millisecond (for screenshots)
    document.documentElement.dataset.playAt = Date.now(); setStage("intro"); apply(); running = true; t0 = performance.now(); raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    const t = now - t0; step(t);
    if (t < END) raf = requestAnimationFrame(frame); else { running = false; setStage("ready"); }
  }
  function step(t) {
    S.draw = ease(clamp(t / 1500));
    if (t >= 1500) { S.winVis = CAN_FLIP ? ease(clamp((t - 1500) / 400)) : 0; S.fit = ease(clamp((t - 1800) / 500)); }
    if (t >= 1700 && !fired.a && CAN_FLIP) { fired.a = 1; S.mode = "win"; S.start = S.fstart = PRESET.a; setHeadline(true); }
    if (t >= 3300 && t < 4300 && CAN_FLIP) {                                        // slide the lowest window to the highest, the headline follows the window
      const p = ease(clamp((t - 3300) / 900)); S.fstart = PRESET.a + (PRESET.b - PRESET.a) * p;
      const s = Math.round(S.fstart); if (s !== S.start) { S.start = s; setHeadline(false); }
    }
    if (t >= 4300 && !fired.b && CAN_FLIP) { fired.b = 1; S.fstart = S.start = PRESET.b; setHeadline(false); }
    if (t >= 5100) {                                                                // the whole record lights up, the window steps back
      if (!fired.c) { fired.c = 1; S.mode = "full"; setHeadline(true); }
      const p = ease(clamp((t - 5100) / 800)); S.full = p; S.winVis = CAN_FLIP ? 1 - 0.5 * p : 0;
    }
    if (t >= 7300 && !fired.e) { fired.e = 1; announceFinal(); }
    apply();
  }
  function skipIntro() { if (!running) return; stop(); resetState(); finalState(); S.winVis = 0.5; apply(); }

  // ---------------------------------------------------------------- interaction: drag, click, keys, presets
  function glideTo(target, dur = 420) {
    if (reduce) { S.start = S.fstart = target; apply(); return; }
    const from = S.fstart, s0 = performance.now(); cancelAnimationFrame(glideTo.raf);
    const stp = now => { const p = ease(clamp((now - s0) / dur)); S.fstart = from + (target - from) * p; const s = Math.round(S.fstart); if (s !== S.start) { S.start = s; setHeadline(false); } apply(); if (p < 1) glideTo.raf = requestAnimationFrame(stp); else { S.start = S.fstart = target; setHeadline(false); apply(); } };
    glideTo.raf = requestAnimationFrame(stp);
  }
  function engage() { skipIntro(); S.winVis = 1; S.fit = 1; if (S.mode !== "win") { S.mode = "win"; setHeadline(true); } }
  function place(start, animate) {
    start = clamp(Math.round(start), Y0, Y1 - WIN + 1);
    cancelAnimationFrame(glideTo.raf); engage();
    if (animate) { glideTo(start); setHeadline(true); } else { S.start = S.fstart = start; setHeadline(false); apply(); }
    announceWin();
  }
  function wire() {
    const { svg, g, hit, grip, eh1, eh2 } = C;
    let drag = null;
    const toYear = e => { const r = svg.getBoundingClientRect(); return C.yearAt((e.clientX - r.left) * (C.W / r.width)); };
    const down = e => {
      if (e.button != null && e.button > 0) return;
      engage(); const yr = toYear(e), inside = yr >= S.start - 0.5 && yr <= S.start + WIN - 0.5;
      drag = { off: inside ? yr - S.start : (WIN - 1) / 2 };
      if (e.pointerType === "mouse" || inside) { e.preventDefault(); }
      try { svg.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      cancelAnimationFrame(glideTo.raf); S.fstart = S.start = clamp(Math.round(yr - drag.off), Y0, Y1 - WIN + 1); setHeadline(false); apply(); g.focus({ preventScroll: true }); announceWin();
    };
    const move = e => { if (!drag) return; const v = clamp(Math.round(toYear(e) - drag.off), Y0, Y1 - WIN + 1); S.fstart = S.start = v; setHeadline(false); apply(); announceWin(); };
    const up = () => { drag = null; };
    for (const el of [hit, grip, eh1, eh2]) el.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
    g.addEventListener("keydown", e => {
      const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 }[e.key];
      if (e.key === "Home") { e.preventDefault(); place(Y0, false); } else if (e.key === "End") { e.preventDefault(); place(Y1, false); }
      else if (k) { e.preventDefault(); place(S.start + k, false); }
    });
  }
  chipEls[0].addEventListener("click", () => { skipIntro(); S.winVis = 1; S.fit = 1; S.mode = "win"; glideTo(PRESET.a); setHeadline(true); announceWin(); });
  chipEls[1].addEventListener("click", () => { skipIntro(); S.winVis = 1; S.fit = 1; S.mode = "win"; glideTo(PRESET.b); setHeadline(true); announceWin(); });
  chipEls[2].addEventListener("click", () => { skipIntro(); S.mode = "full"; S.winVis = CAN_FLIP ? 0.5 : 0; S.full = 1; setHeadline(true); apply(); announceWin(); });
  $("hk-replay").addEventListener("click", () => { cancelAnimationFrame(glideTo.raf); showHook(true); play(); });

  // ---------------------------------------------------------------- regions: pick a case on the globe or from the list, or explore any other point
  let token = 0;
  function setMsg(t, kind) { msg.hidden = !t; msg.textContent = t || ""; msg.dataset.kind = kind || ""; if (t) say(t); }
  // a mouse or touch pick from the globe or the buttons scrolls the headline back into view when the visitor has scrolled down to the globe; a keyboard press does not move the page
  function showHook(byPointer) {
    if (!byPointer) return;
    const r = fig.getBoundingClientRect();
    if (r.bottom < 40 || r.top > innerHeight - 40) kicker.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }
  function paintLink() {
    linkBox.hidden = false; linkBox.dataset.kind = spec.type;
    const a = h("a", { href: spec.link.href, class: "hk-go" }, spec.link.text);
    linkBox.replaceChildren(h("p", { class: "hk-link-lead" }, spec.link.lead), h("p", { class: "hk-link-row" }, a, " →"), ...(spec.link.must ? [h("p", { class: "hk-link-note" }, spec.link.must)] : []));
    moreBody.replaceChildren(h("p", {}, spec.link.note),
      ...(spec.type === "case" && spec.sen != null ? [h("p", { class: "hk-slopes" }, [h("b", {}, "Two estimates, one record. "), `Headline demo: least-squares estimate, ${signedFmt(SLOPES.full)} ${units} per decade (the “whole record” line above). Registered case: Sen estimate, ${signedFmt(spec.sen)}, the median of the slopes between pairs of years, which one odd year barely moves.`])] : []),
      h("p", {}, "The rates are least-squares straight-line fits to yearly differences from the record's average; the registered case tests the whole record with a different method."));
  }
  function paintList() {
    for (const b of root.querySelectorAll(".hk-regions button")) b.setAttribute("aria-pressed", String(spec.type === "case" ? b.dataset.case === spec.id : (b.dataset.x === `${spec.center.lat.toFixed(1)},${spec.center.lng.toFixed(1)}`)));
  }
  function startRun(sp, { fly = true } = {}) {
    cancelAnimationFrame(glideTo.raf); stop();
    setData(sp); chipLabels(); paintLink(); paintList(); build(); settle(true); if (fly) flyTo(sp);
    fig.classList.remove("is-loading"); kicker.classList.remove("is-loading");
  }
  function selectCase(id, byPointer) {
    const c = claimOf(id); if (!c) return;
    token++; setMsg(""); showHook(byPointer);
    if (spec && spec.type === "case" && spec.id === id && !running) { setChooser(false); flyTo(spec); return; }   // the same region again changes nothing (Replay is its own button)
    startRun(caseSpec(c));
  }
  async function selectPoint(lat, lng, byPointer) {
    const my = ++token; setMsg(""); showHook(byPointer);
    fig.classList.add("is-loading"); kicker.textContent = `Reading NASA AIRS air temperature near ${fmtLat(lat)} ${fmtLon(lng)}…`; kicker.classList.add("is-loading"); say(kicker.textContent);
    try {
      const sp = await exploreSpec(lat, lng);
      if (my !== token || dead) return;
      startRun(sp);
    } catch (e) {
      if (my !== token || dead) return;
      fig.classList.remove("is-loading"); kicker.classList.remove("is-loading"); kicker.textContent = (S.mode === "full" || S.mode === "win") ? (S.mode === "win" ? `Window ${range(win(S.start).a, win(S.start).b)} · ${WIN} years` : `Whole record · ${range(Y0, Y1)} · ${N} years`) : spec.kicker;
      if (e && e.plain) setMsg(e.message, "info"); else { console.error(e); setMsg("The NASA library could not be read for that spot just now. Try another point.", "info"); }
    }
  }
  // The region chooser: a real button with aria-expanded, a panel that is `hidden` while closed, a preview on hover or keyboard focus (the same text opens on tap by selecting), Escape closes it.
  const regionBtn = $("hk-region-btn"), chooser = $("hk-regions"), peekEl = $("hk-peek");
  function setChooser(on) {
    chooser.hidden = !on; regionBtn.setAttribute("aria-expanded", String(!!on)); if (!on) peek("");
  }
  const peek = t => { peekEl.hidden = !t; peekEl.textContent = t || ""; };
  const closeAfter = () => { const had = chooser.contains(document.activeElement); setChooser(false); if (had) regionBtn.focus(); };   // keyboard focus returns to the trigger instead of vanishing
  regionBtn.addEventListener("click", () => setChooser(chooser.hidden));
  const onKey = e => { if (e.key === "Escape" && !chooser.hidden) { setChooser(false); regionBtn.focus(); } };
  const onDown = e => { if (!chooser.hidden && !chooser.contains(e.target) && !regionBtn.contains(e.target)) setChooser(false); };
  document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown);
  function buildRegionList() {
    const host = $("hk-regions-cases"), ex = $("hk-regions-x");
    const bind = (b, text) => { for (const ev of ["mouseenter", "focus"]) b.addEventListener(ev, () => peek(text)); for (const ev of ["mouseleave", "blur"]) b.addEventListener(ev, () => peek("")); };
    for (const c of claims) {
      const b = chip({ class: "hk-chip hk-reg", "data-case": c.id, "aria-pressed": "false" }, BTN[c.id] || c.region.name);
      b.addEventListener("click", e => { selectCase(c.id, e.detail > 0); closeAfter(); }); bind(b, `${BTN[c.id] || c.region.name}. ${caseSpec(c).link.lead}`); host.append(b);
    }
    for (const [label, lat, lng] of EXPLORE) {
      const b = chip({ class: "hk-chip hk-reg hk-reg-x", "data-x": `${lat.toFixed(1)},${lng.toFixed(1)}`, "aria-pressed": "false", "aria-label": `Explore ${label}, not a trial` }, label);
      b.addEventListener("click", e => { selectPoint(lat, lng, e.detail > 0); closeAfter(); }); bind(b, `${label}. Exploration, not a trial: no registered test.`); ex.append(b);
    }
  }

  // ---------------------------------------------------------------- go
  let ro = null, started = false;
  async function start() {
    if (started || dead) return; started = true;
    const xq = (param("at") || param("x") || "").split(",").map(Number), wantX = xq.length === 2 && xq.every(Number.isFinite);
    buildRegionList();
    let firstSpec = caseSpec(first);
    if (wantX) { try { firstSpec = await exploreSpec(xq[0], xq[1]); } catch (e) { setMsg(e && e.plain ? e.message : "The NASA library could not be read for that spot just now.", "info"); } }
    if (dead) return;
    setData(firstSpec); chipLabels(); paintLink(); paintList(); build();
    let rw = fig.clientWidth; if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (Math.abs(fig.clientWidth - rw) > 1) { rw = fig.clientWidth; build(); } }); ro.observe(fig); }
    // A normal load shows the complete state at once: the whole record, its line, the answer. The globe mounts on its own clock (the poster stands in until it has painted).
    // Only ?t=ms (a frozen frame for video capture) or the Replay button runs the timed demonstration.
    if (HOLD != null) play(); else settle(false);
    document.documentElement.dataset.hookReady = "1";
    await mountGlobe();
    if (dead) return;
    flyTo(spec);
    if (!G.ready) { const wait = setInterval(() => { if (dead) clearInterval(wait); else if (G.ready) { clearInterval(wait); flyTo(spec); } }, 400); setTimeout(() => clearInterval(wait), 15000); }
  }
  function dispose() {
    dead = true; stop(); cancelAnimationFrame(glideTo.raf); clearTimeout(liveT); if (ro) ro.disconnect();
    document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); if (mqPhone.removeEventListener) mqPhone.removeEventListener("change", onMq);
    if (G.api) { try { G.api.destroy(); } catch (e) { /* ignore */ } G.api = null; }
    for (const k of ["hookReady", "playAt", "globeReady"]) delete document.documentElement.dataset[k];
    if (window.__hookGlobe) delete window.__hookGlobe;
  }
  return { node: root, start, dispose };
}
