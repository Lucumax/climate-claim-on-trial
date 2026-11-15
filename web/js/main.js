// Hash router and shell. Every view returns { node, title }. Focus moves to the page title after each navigation.
// Information architecture (one home per kind of content):
//   Home (brand)  Investigate  Case files  How it works (Method, False-Alarm Planet, Measurements)  Data & sources (utility)
import { h, announce } from "./util.js";
import { loadBundle, claimById } from "./data.js";
import { landing } from "./views/landing.js";
import { detective } from "./views/detective.js";
import { caseList, caseDocket } from "./views/cases.js";
import { method, glossary, provenance, howShell } from "./views/pages.js";
import { falseAlarm } from "./views/falsealarm.js";
import { watchText } from "./textfix.js";

const view = document.getElementById("view");
watchText(view);   // one style for "p = 0.032", "C–A" and "±" on every route (see textfix.js)
let bundle = null, catalog = null, disposeView = null;   // a view may return dispose() (stops animations, frees WebGL) and afterMount() (runs once its node is in the page)

// Old routes keep working: they are rewritten in place (no extra history entry) before routing.
const REDIRECTS = [
  [/^#\/detective\/?$/, "#/investigate"],
  [/^#\/evidence\/?$/, "#/data"],
  [/^#\/method\/registration\/?$/, "#/data/registration"],
  [/^#\/how-it-works\/?$/, "#/method"],
];

async function boot() {
  try {
    [bundle, catalog] = await Promise.all([loadBundle(), fetch("data/variables.json").then(r => r.json())]);
  } catch (e) {
    view.replaceChildren(h("div", { class: "err" }, h("h1", { id: "page-title", tabindex: "-1" }, "The evidence bundle could not be loaded"), h("p", { class: "muted" }, "Serve this folder over HTTP (for example, python -m http.server) and reload. Details: " + (e && e.message || e))));
    return;
  }
  if (bundle.synthetic) { document.getElementById("synth").hidden = false; document.getElementById("synth-text").textContent = bundle.notice || "Placeholder numbers, not NASA results."; }
  window.addEventListener("hashchange", () => route(true));
  route(false);
}

function notFound() { return { title: "Not found", node: h("div", { class: "err" }, h("h1", { id: "page-title", tabindex: "-1" }, "Page not found"), h("p", {}, h("a", { href: "#/" }, "Back to the start"))) }; }

function resolve(hash) {
  const [path, query = ""] = hash.split("?"); // a query after the path (replay links) is read by the view, not the router
  const parts = path.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, id] = parts;
  if (!a) return { nav: "home", v: landing(bundle, catalog) };
  if (a === "investigate") return { nav: "investigate", v: detective(catalog, bundle, query) };
  if (a === "cases") return { nav: "cases", v: caseList(bundle) };
  if (a === "case") {
    const c = claimById(bundle, id); if (!c) return { nav: "cases", v: notFound() };
    return { nav: "cases", v: caseDocket(bundle, c, query) }; // older sub-page links (/ladder, /series, /verdict) land on the same docket
  }
  if (a === "method") return { nav: "how", v: method(bundle), anchor: id === "limits" ? "known-limits" : null };
  if (a === "glossary") return { nav: "how", v: glossary(catalog) };
  if (a === "false-alarm") { const v = falseAlarm(); return { nav: "how", v: { ...v, node: howShell("false-alarm", v.node) } }; }
  if (a === "data") return { nav: "data", v: provenance(bundle, id === "registration" ? null : id), anchor: id === "registration" ? "registration" : null };
  return { nav: "", v: notFound() };
}

function route(moved) {
  for (const [re, to] of REDIRECTS) if (re.test(location.hash)) { history.replaceState(null, "", to); break; }
  let r;
  try { r = resolve(location.hash); } catch (e) { console.error(e); r = { nav: "", v: { title: "Error", node: h("div", { class: "err" }, h("h1", { id: "page-title", tabindex: "-1" }, "Something went wrong drawing this page"), h("p", { class: "muted" }, String(e && e.message || e))) } }; }
  if (disposeView) { try { disposeView(); } catch (e) { console.error(e); } disposeView = null; }
  view.replaceChildren(r.v.node);
  disposeView = r.v.dispose || null;
  const sb = document.getElementById("synth"); if (sb && bundle.synthetic) sb.hidden = r.nav === "investigate"; // the banner is about the case-file bundle, not live data
  document.title = r.v.title + " · Climate Claim on Trial";
  document.querySelectorAll("nav.main a, a.utility").forEach(a => a.getAttribute("data-nav") === r.nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  window.scrollTo(0, 0);
  if (r.anchor) { const el = document.getElementById(r.anchor); if (el) { el.scrollIntoView({ block: "start" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } }
  if (r.v.afterMount) { try { r.v.afterMount(); } catch (e) { console.error(e); } }
  if (moved) { const t = document.getElementById("page-title"); if (t && !r.anchor) t.focus({ preventScroll: true }); announce(r.v.title); }
}
boot();
