// Home: one question, one worked example, one action. The example computes two selected-window slopes and the full-record slope in the browser
// from the archived regional series (the C-C bundle), with the same least squares routine the Investigate page uses.
import { h, fmtNum, minus, U, range } from "../util.js";
import { olsTest } from "../stats.js";
import { windowsChart } from "../chart.js";

// Home hero, right half: "where the trials are held". One Earth with all registered case regions, each drawn by its per-cell trend per decade;
// withheld cases are hatched. It starts paused and never turns by itself. Phones and browsers without WebGL get a labelled static poster
// (web/img/globe-trials-light.jpg and -dark.jpg, a screenshot of this same globe) with the same case list under it.
const POSTER_ALT = "Earth seen from above North America, with four outlined case regions. Interior and western Alaska and the central Sahel are coloured by each cell's trend per decade; the Southeastern United States is hatched because its ruling is withheld, and Wisconsin is shown with its trend colours and a not-supported ruling.";
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } };
function heroGlobe(claims) {
  const host = h("div", { class: "hero-globe-host" });
  const cap = h("figcaption", { class: "hero-cap" }, h("b", {}, "Where the trials are held."), " Four registered regions, each drawn by its per-cell trend per decade. Click a region or a case below to open it. Imagery: NASA Blue Marble, muted.");
  const poster = () => h("a", { href: "#/cases", class: "poster-link", "aria-label": "Open the case files" },
    h("img", { class: "poster poster-light", src: "img/globe-trials-light.jpg", width: 1288, height: 996, alt: POSTER_ALT, loading: "lazy" }), h("img", { class: "poster poster-dark", src: "img/globe-trials-dark.jpg", width: 1288, height: 996, alt: POSTER_ALT, loading: "lazy" }));
  const fig = h("figure", { class: "hero-globe" }, host);
  let handle = null, dead = false;
  async function start() {
    const mod = await import("../viz/globe-trials.js").catch(() => null); if (!mod || dead) return;
    const still = async () => { host.replaceChildren(); handle = await mod.render(host, claims, { poster: poster(), caption: cap }); };
    if (window.matchMedia("(max-width: 700px)").matches || !hasWebGL()) { await still(); return; }
    try { handle = await mod.render(host, claims, { caption: cap, height: "clamp(340px, 38vw, 500px)" }); if (dead && handle) handle.destroy(); }
    catch (e) { console.error(e); if (!dead) { host.replaceChildren(); await still(); } }
  }
  return { node: fig, start, dispose() { dead = true; if (handle) { try { handle.destroy(); } catch (e) { /* ignore */ } handle = null; } } };
}

const WINDOWS = [{ a: 1998, b: 2012, cls: "a" }, { a: 2005, b: 2019, cls: "b" }];

function slopeOver(years, y, a, b) {
  const idx = years.map((v, i) => i).filter(i => years[i] >= a && years[i] <= b && y[i] != null);
  const t = idx.map(i => years[i]), v = idx.map(i => y[i]), r = olsTest(t, v);
  return { slope: r.slope * 10, n: idx.length };
}

function example(b) {
  const c = b.claims.find(q => q.id === "C-C");
  if (!c || c.synthetic) return null;
  const r = c.regional, years = r.years, y = r.anomaly;
  if (years[0] > WINDOWS[0].a || years[years.length - 1] < WINDOWS[1].b || y.some(v => v == null)) return null;
  const w = WINDOWS.map(x => ({ ...x, ...slopeOver(years, y, x.a, x.b) }));
  const t = years, mt = t.reduce((p, q) => p + q, 0) / t.length, my = y.reduce((p, q) => p + q, 0) / y.length;
  const full = olsTest(t, y), fb = full.slope, intercept = my + fb * (years[0] - mt), fullDec = fb * 10;
  return { c, w, full: { slope: fullDec, intercept, y0: years[0], y1: years[years.length - 1], n: years.length } };
}

const ds = c => /MERRA-2/.test(c.product.name) ? "NASA MERRA-2" : c.product.name;
const place = c => c.region.name.charAt(0).toLowerCase() + c.region.name.slice(1);
const headline = (c, slope) => { const p = c.region.name.charAt(0).toUpperCase() + c.region.name.slice(1); return slope < 0 ? `${p} is cooling` : `${p} is warming fast`; };

export function landing(b) {
  const ex = example(b);
  const globe = ex ? heroGlobe(b.claims) : null;
  const u = ex ? U(ex.c.regional.units) : "";
  const card = x => h("article", { class: "hl-card " + x.cls },
    h("p", { class: "hl-window" }, "Selected window ", range(x.a, x.b)),
    h("h3", {}, headline(ex.c, x.slope)),
    h("p", { class: "hl-num num" }, fmtNum(x.slope, 2).replace(/^(\d)/, "+$1"), " ", u, h("small", {}, `per decade, ${x.n} years`)),
    h("span", { class: "hl-mark", "aria-hidden": "true" }, "selected window"));
  const panel = h("div", { class: "reveal-panel", id: "reveal-panel", hidden: true, tabindex: "-1" });
  let revealBtn;
  if (ex) {
    const f = ex.full, [a, bb] = ex.w;
    panel.append(h("div", { class: "fig" }, windowsChart({
      x: b.claims.find(q => q === ex.c).regional.years, y: ex.c.regional.anomaly, units: u, windows: ex.w.map(x => ({ ...x, label: range(x.a, x.b) })),
      full: { slope: f.slope, intercept: f.intercept, label: `Whole record ${range(f.y0, f.y1)}: ${fmtNum(f.slope, 2).replace(/^(\d)/, "+$1")} ${u} per decade` },
      describe: `Yearly regional temperature anomaly for ${ex.c.region.name}, ${f.y0} to ${f.y1}. The ${range(a.a, a.b)} window slopes ${fmtNum(a.slope, 2)} ${u} per decade and the ${range(bb.a, bb.b)} window slopes ${fmtNum(bb.slope, 2)} ${u} per decade. The whole record slopes ${fmtNum(f.slope, 2)} ${u} per decade.`,
    })),
    h("p", { class: "verdict-line" }, `Both headlines are arithmetic on real data. Over all ${f.n} years the trend is ${fmtNum(f.slope, 2).replace(/^(\d)/, "+$1")} ${u} per decade, and neither short window is the record.`),
    h("p", { class: "note" }, `Least squares slopes of the yearly regional anomaly (${ds(ex.c)}, ${ex.c.season.toLowerCase()}). The case file tests the whole record with a different method, chosen by simulation.`),
    h("a", { class: "btn-text", href: "#/case/" + ex.c.id }, "See how the registered case tests it"));
    revealBtn = h("button", { class: "btn-quiet", type: "button", "aria-expanded": "false", "aria-controls": "reveal-panel", onclick: e => {
      const open = panel.hidden; panel.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open));
      e.currentTarget.textContent = open ? "Hide the full record" : "Reveal the full record";
      if (open) panel.focus({ preventScroll: false });
    } }, "Reveal the full record");
  }
  return { title: "How strong is the evidence for climate change here?", node: h("div", {},
    h("section", { class: "hero" + (globe ? " hero-split" : "") },
      h("div", { class: "hero-text" },
        h("p", { class: "eyebrow brass" }, "NASA Earth data · trend detective"),
        h("h1", { id: "page-title", tabindex: "-1" }, "How strong is the evidence for climate change here?"),
        h("p", { class: "lede" }, "Pick a NASA measurement, a place and a period, and ask different questions of the same record, and see whether the trend holds. The answer depends on how you ask."),
        h("div", { class: "actions" }, h("a", { class: "btn", href: "#/investigate" }, "Start investigating"), h("a", { class: "btn-text", href: "#/cases" }, "Explore registered cases"))),
      globe ? globe.node : null),
    ex ? h("section", { class: "example", "aria-labelledby": "ex-h" },
      h("p", { class: "eyebrow" }, "A worked example"),
      h("h2", { id: "ex-h" }, "Same NASA record, opposite headlines"),
      h("p", { class: "example-sub" }, `One yearly series: ${ds(ex.c)} air temperature over ${place(ex.c)}, ${range(ex.c.period.start, ex.c.period.end)}. Choose the start and end years, and you choose the headline.`),
      h("p", { class: "hl-label", role: "note" }, "Two headlines you could write from selected years"),
      h("div", { class: "hl-pair" }, ex.w.map(card)),
      h("p", { class: "hl-foot" }, "Illustrative headlines written from the numbers, not real news items."),
      h("div", { class: "reveal" }, revealBtn), panel) : null),
    afterMount: globe ? globe.start : null, dispose: globe ? globe.dispose : null };
}
