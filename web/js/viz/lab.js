// Lab page driver: loads a case file from web/data/viz/, mounts each module, records first-render timings.
import { el } from "./common.js";

const MODULES = [
  { id: "m-globe", path: "./globe-case.js", name: "globe" },
  { id: "m-map", path: "./anomaly-map.js", name: "map" },
  { id: "m-spiral", path: "./spiral.js", name: "spiral" },
  { id: "m-dist", path: "./distribution.js", name: "distribution" },
  { id: "m-stripes", path: "./stripes.js", name: "stripes" },
];
const handles = {};
window.__labHandles = handles;
window.__labTimings = {};
window.__labErrors = [];
const params = new URLSearchParams(location.search);
const only = params.get("only");

async function mountAll(caseId) {
  for (const k of Object.keys(handles)) { try { handles[k] && handles[k].destroy(); } catch (e) { /* ignore */ } delete handles[k]; }
  const res = await fetch(`data/viz/${caseId}.json`);
  if (!res.ok) throw new Error("case file " + caseId);
  const data = await res.json();
  await Promise.all(MODULES.map(async (m) => {
    const host = document.getElementById(m.id);
    host.replaceChildren();
    if (only && only !== m.name) return;
    const t0 = performance.now();
    try {
      const mod = await import(m.path);
      handles[m.name] = await mod.render(host, data, { year: params.has("year") ? +params.get("year") : undefined });
      window.__labTimings[m.name] = Math.round(performance.now() - t0);
    } catch (e) {
      window.__labErrors.push(m.name + ": " + (e && e.message));
      host.append(el("p", { class: "viz-fallback" }, `This view could not start (${m.name}): ${e && e.message}`));
      console.error(m.name, e);
    }
  }));
  window.__labReady = true;
}

(async () => {
  const sel = document.getElementById("case");
  let cases = ["C-A", "C-B", "C-C"];
  try { cases = (await (await fetch("data/viz/index.json")).json()).cases; } catch (e) { /* default list */ }
  const names = { "C-A": "C-A Southeast US summer land surface temperature", "C-B": "C-B Sahel wet-season rainfall", "C-C": "C-C Alaska yearly air temperature", "C-D": "C-D Wisconsin summer aerosol" };
  for (const c of cases) sel.append(el("option", { value: c }, names[c] || c));
  sel.value = params.get("case") && cases.includes(params.get("case")) ? params.get("case") : cases[0];
  sel.addEventListener("change", () => { window.__labReady = false; mountAll(sel.value); });
  await mountAll(sel.value);
})();
