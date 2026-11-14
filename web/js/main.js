// Hash router and shell. Every view returns { node, title }. Focus moves to the page title after each navigation.
import { h, announce } from "./util.js";
import { loadBundle, claimById } from "./data.js";
import { landing } from "./views/landing.js";
import { detective } from "./views/detective.js";
import { caseList, caseDocket } from "./views/cases.js";
import { method, evidence } from "./views/pages.js";
import { falseAlarm } from "./views/falsealarm.js";

const view = document.getElementById("view");
let bundle = null, catalog = null;

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
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, id, sub] = parts;
  if (!a) return { nav: "home", v: landing(bundle, catalog) };
  if (a === "false-alarm") return { nav: "false-alarm", v: falseAlarm() };
  if (a === "detective") return { nav: "detective", v: detective(catalog, bundle) };
  if (a === "cases") return { nav: "cases", v: caseList(bundle) };
  if (a === "case") {
    const c = claimById(bundle, id); if (!c) return { nav: "cases", v: notFound() };
    return { nav: "cases", v: caseDocket(bundle, c) }; // older sub-page links (/ladder, /series, /verdict) land on the same docket
  }
  if (a === "method") return { nav: "method", v: method(bundle), anchor: id };
  if (a === "evidence") return { nav: "evidence", v: evidence(bundle) };
  return { nav: "", v: notFound() };
}

function route(moved) {
  let r;
  try { r = resolve(location.hash); } catch (e) { console.error(e); r = { nav: "", v: { title: "Error", node: h("div", { class: "err" }, h("h1", { id: "page-title", tabindex: "-1" }, "Something went wrong drawing this page"), h("p", { class: "muted" }, String(e && e.message || e))) } }; }
  view.replaceChildren(r.v.node);
  const sb = document.getElementById("synth"); if (sb && bundle.synthetic) sb.hidden = r.nav === "detective"; // the banner is about the case-file bundle, not live data
  document.title = r.v.title + " · Climate Claim on Trial";
  document.querySelectorAll("nav.main a").forEach(a => a.getAttribute("data-nav") === r.nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  window.scrollTo(0, 0);
  if (r.anchor) { const el = document.getElementById(r.anchor); if (el) { el.scrollIntoView({ block: "start" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); } }
  if (moved) { const t = document.getElementById("page-title"); if (t && !r.anchor) t.focus({ preventScroll: true }); announce(r.v.title); }
}
boot();
