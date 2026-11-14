// Home: lead with the scientific surprise. The hook (views/hook.js) puts one NASA record, two short windows, two opposite headlines and the whole record at the top,
// with the big globe of the registered case regions right below it. The showcase bands below mount when they come near the viewport.
import { h } from "../util.js";
import { hook } from "./hook.js";

// Run start() once node is near the viewport (or at once without IntersectionObserver). Returns a cancel function.
export function whenNear(node, start, margin = "300px") {
  if (!("IntersectionObserver" in window)) { start(); return () => {}; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: margin });
  io.observe(node);
  return () => io.disconnect();
}

export function landing(b) {
  const handles = [], cancels = [];
  const hk = hook(b);
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
  const fallbackHead = hk ? null : h("section", { class: "hero" }, h("h1", { id: "page-title", tabindex: "-1" }, "Same NASA record. Opposite headlines."), h("p", { class: "lede" }, "Pick a NASA measurement, a place and a period, and ask different questions of the same record."), h("div", { class: "actions" }, h("a", { class: "btn", href: "#/investigate" }, "Investigate a question")));
  return { title: "Same NASA record, opposite headlines", node: h("div", { class: "home" }, hk ? hk.node : null, fallbackHead, faBand, witBand, invite),
    afterMount() { if (hk) hk.start(); },
    dispose() { dead = true; cancels.forEach(c => c()); if (hk) hk.dispose(); handles.forEach(x => x && x.destroy && x.destroy()); } };
}
