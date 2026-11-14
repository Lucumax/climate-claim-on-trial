// Home: lead with the scientific surprise. One NASA record, two short windows, two opposite headlines, and the whole record beside them.
// The opener computes the two selected-window slopes and the full-record slope in the browser from the archived regional series (the C-C bundle),
// with the same least squares routine the Investigate page uses. Showcase bands below it mount when they come near the viewport.
import { h, fmtNum, U, range } from "../util.js";
import { olsTest } from "../stats.js";
import { windowsChart } from "../chart.js";

// "Where the trials are held": one Earth with all registered case regions, each drawn by its per-cell trend per decade; withheld cases are hatched.
// It starts paused and never turns by itself. Browsers without WebGL get a labelled static poster
// (web/img/globe-trials-light.jpg and -dark.jpg, a screenshot of this same globe) with the same case list under it.
const POSTER_ALT = "Earth seen from above North America, with four outlined case regions. Interior and western Alaska and the central Sahel are coloured by each cell's trend per decade; the Southeastern United States is hatched because its ruling is withheld, and Wisconsin is shown with its trend colours and a not-supported ruling. This still image was taken before the two NO2082 regions (the eastern United States and northern India, both withheld) were added.";
const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];   // the counts in the copy follow the number of registered cases
const numWord = n => NUM[n] || String(n);
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } };
const phone = () => window.matchMedia("(max-width: 700px)").matches;

// Run start() once node is near the viewport (or at once without IntersectionObserver). Returns a cancel function.
export function whenNear(node, start, margin = "300px") {
  if (!("IntersectionObserver" in window)) { start(); return () => {}; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: margin });
  io.observe(node);
  return () => io.disconnect();
}

function heroGlobe(claims) {
  const host = h("div", { class: "hero-globe-host" });
  const cap = h("figcaption", { class: "hero-cap" }, h("b", {}, "Where the trials are held."), ` ${numWord(claims.length)} registered regions, each drawn by its per-cell trend per decade. Click a region or a case below to open it. Imagery: NASA Blue Marble, muted.`);
  const poster = () => h("a", { href: "#/cases", class: "poster-link", "aria-label": "Open the case files" },
    h("img", { class: "poster poster-light", src: "img/globe-trials-light.jpg", width: 1288, height: 996, alt: POSTER_ALT, loading: "lazy" }), h("img", { class: "poster poster-dark", src: "img/globe-trials-dark.jpg", width: 1288, height: 996, alt: POSTER_ALT, loading: "lazy" }));
  const fig = h("figure", { class: "hero-globe" }, host);
  let handle = null, dead = false;
  async function start() {
    const mod = await import("../viz/globe-trials.js").catch(() => null); if (!mod || dead) return;
    const still = async () => { host.replaceChildren(); handle = await mod.render(host, claims, { poster: poster(), caption: cap }); };
    if (!hasWebGL()) { await still(); return; }
    try { handle = await mod.render(host, claims, { caption: cap, height: phone() ? "280px" : "clamp(340px, 38vw, 500px)", touchRotate: !phone() }); if (dead && handle) handle.destroy(); }
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
const kindWord = c => (c.data_kind === "model_reanalysis" ? "model-based" : "satellite observation");
const placeShort = c => (/Alaska/.test(c.region.name) ? "Alaska" : c.region.name.charAt(0).toUpperCase() + c.region.name.slice(1));
const headline = (c, slope) => (slope < 0 ? "Cooling" : "Warming fast");
const signedFmt = v => fmtNum(v, 2).replace(/^(\d)/, "+$1");

export function landing(b) {
  const ex = example(b);
  const handles = [], cancels = [];
  const u = ex ? U(ex.c.regional.units) : "";
  let opener = null;
  if (ex) {
    const c = ex.c, f = ex.full, [wa, wb] = ex.w, p = placeShort(c), per = range(f.y0, f.y1);
    const chart = windowsChart({
      x: c.regional.years, y: c.regional.anomaly, units: u, compact: true, windows: ex.w.map(x => ({ ...x, label: range(x.a, x.b) })),
      full: { slope: f.slope, intercept: f.intercept, label: `Whole record ${per}: ${signedFmt(f.slope)} ${u} per decade` },
      describe: `Yearly regional temperature anomaly for ${c.region.name}, ${f.y0} to ${f.y1}. The ${range(wa.a, wa.b)} window slopes ${fmtNum(wa.slope, 2)} ${u} per decade and the ${range(wb.a, wb.b)} window slopes ${fmtNum(wb.slope, 2)} ${u} per decade. The whole record slopes ${fmtNum(f.slope, 2)} ${u} per decade.`,
    });
    const radios = [];
    const pick = (x, on) => { chart.setActive(on ? x.cls : null); radios.forEach(r => r.closest("label").classList.toggle("on", r.checked)); clear.hidden = !on; };
    const choice = x => {
      const input = h("input", { type: "radio", name: "hl-window", value: x.cls, onchange: () => pick(x, true) });
      radios.push(input);
      return h("label", { class: "hl-choice " + x.cls }, input,
        h("span", { class: "hl-card" },
          h("span", { class: "hl-head" }, h("b", {}, headline(c, x.slope)), h("span", { class: "hl-window" }, range(x.a, x.b))),
          h("span", { class: "hl-num num" }, signedFmt(x.slope), h("small", {}, ` ${u} per decade`))));
    };
    const clear = h("button", { class: "btn-text hl-clear", type: "button", hidden: true, onclick: () => { radios.forEach(r => { r.checked = false; }); pick(null, false); } }, "Show both windows");
    opener = h("section", { class: "opener", "aria-labelledby": "page-title" },
      h("div", { class: "opener-text" },
        h("p", { class: "eyebrow brass" }, "NASA Earth data · trend detective"),
        h("h1", { id: "page-title", tabindex: "-1" }, "Same NASA record. Opposite headlines."),
        h("p", { class: "lede" }, `${p}'s air temperature, ${per}. Two short windows tell different stories. The full record puts both in context.`),
        h("div", { class: "actions" }, h("a", { class: "btn", href: "#/investigate" }, "Investigate a question"), h("a", { class: "btn-text", href: "#/cases" }, "Explore registered cases"))),
      h("div", { class: "opener-ex", role: "group", "aria-labelledby": "ex-h" },
        h("h2", { id: "ex-h" }, `Has ${p}'s air temperature risen?`),
        h("p", { class: "opener-src" }, `${ds(c)} · ${kindWord(c)} · ${per}`),
        h("div", { class: "fig" }, chart),
        h("fieldset", { class: "hl-pick" }, h("legend", {}, "Choose a window to write its headline", clear), h("div", { class: "hl-pair" }, ex.w.map(choice))),
        h("p", { class: "hl-whole" }, h("b", {}, "Whole record: "), h("span", { class: "num" }, `${signedFmt(f.slope)} ${u} per decade`), `, ${f.n} years. Neither short window is the record: selecting years changes the headline.`),
        h("p", { class: "hl-foot" }, "Illustrative headlines, not news quotations. Slopes are least squares on the yearly anomaly; the registered case tests the whole record with a different method. ", h("a", { href: "#/case/" + c.id }, "See the case"))));
  }
  const globe = ex ? heroGlobe(b.claims) : null;
  const globeBand = globe ? h("section", { class: "band band-globe", "aria-labelledby": "globe-h" },
    h("div", { class: "band-head" }, h("h2", { id: "globe-h" }, `${numWord(b.claims.length)} questions. ${numWord(b.claims.length)} case files.`), h("p", {}, "Each registered claim was put on trial with its own NASA record. The globe shows where, and what each region's data did.")),
    globe.node) : null;
  // ---- showcase bands: each mounts when it comes near the viewport and is destroyed when the visitor leaves
  const mountLive = (host, loader) => { cancels.push(whenNear(host, async () => { try { const r = await loader(); if (r) { if (dead) r.destroy && r.destroy(); else handles.push(r); } } catch (e) { console.error(e); host.append(h("p", { class: "muted small" }, "This preview could not be drawn here. The full exhibit is one click away.")); } })); };
  let dead = false;
  const getJson = u => fetch(u).then(r => { if (!r.ok) throw new Error("Could not load " + u); return r.json(); });
  const faHost = h("div", { class: "fa-prev-host", style: "min-height:min(60vw, 420px)" });
  mountLive(faHost, async () => { const mod = await import("./falsealarm.js"); const v = mod.falseAlarm({ preview: true }); faHost.replaceChildren(v.node); return v; });
  const faBand = h("section", { class: "band band-fa", "aria-labelledby": "fa-h" },
    h("div", { class: "band-head" }, h("h2", { id: "fa-h" }, "Every flag is wrong."), h("p", {}, "This simulated planet has no underlying trend. See what the tests flag anyway."),
      h("a", { class: "btn", href: "#/false-alarm" }, "Explore False-Alarm Planet")),
    faHost);
  const ca = b.claims.find(q => q.id === "C-A");
  const wHostA = h("div", { class: "wit-host", style: "min-height:260px" }), wHostB = h("div", { class: "wit-host", style: "min-height:260px" });
  mountLive(wHostA, async () => { const [mod, d] = await Promise.all([import("../viz/witness.js"), getJson("data/witness/C-A.json")]); return mod.render(wHostA, d, { preview: true }); });
  mountLive(wHostB, async () => { const [mod, d] = await Promise.all([import("../viz/witness2.js"), getJson("data/witness/C-A_esa.json")]); return mod.render(wHostB, d, { preview: true }); });
  const witBand = ca ? h("section", { class: "band band-wit", "aria-labelledby": "wit-h" },
    h("div", { class: "band-head" }, h("h2", { id: "wit-h" }, "Before trusting the trend, check the witness."),
      h("p", {}, `A satellite can drift. Two exploratory checks on the land-surface record for ${ca.region.name}. They do not change the ruling, which is ${ca.verdict.branch === "withheld" ? "withheld" : String(ca.verdict.label).toLowerCase()}.`)),
    h("div", { class: "wit-pair" },
      h("div", { class: "wit-col" }, wHostA, h("a", { class: "btn-quiet", href: "#/case/C-A?view=witness" }, "When did Terra look?")),
      h("div", { class: "wit-col" }, wHostB, h("a", { class: "btn-quiet", href: "#/case/C-A?view=witness2" }, "Compare the second witness")))) : null;
  const invite = h("section", { class: "band band-invite", "aria-labelledby": "inv-h" },
    h("h2", { id: "inv-h" }, "Now ask your own question"),
    h("p", {}, "Pick a NASA measurement, a place and a period. The answer updates as you choose, and the page keeps count of how many questions you have tried."),
    h("div", { class: "actions" }, h("a", { class: "btn", href: "#/investigate" }, "Start investigating"), h("a", { class: "btn-text", href: "#/method" }, "How it works"), h("a", { class: "btn-text", href: "#/data" }, "Data and provenance")));
  const fallbackHead = ex ? null : h("section", { class: "hero" }, h("h1", { id: "page-title", tabindex: "-1" }, "Same NASA record. Opposite headlines."), h("p", { class: "lede" }, "Pick a NASA measurement, a place and a period, and ask different questions of the same record."), h("div", { class: "actions" }, h("a", { class: "btn", href: "#/investigate" }, "Investigate a question")));
  return { title: "Same NASA record, opposite headlines", node: h("div", { class: "home" }, opener, fallbackHead, faBand, witBand, globeBand, invite),
    afterMount() { if (globe) cancels.push(whenNear(globe.node, globe.start)); },
    dispose() { dead = true; cancels.forEach(c => c()); if (globe) globe.dispose(); handles.forEach(x => x && x.destroy && x.destroy()); } };
}
