// One exhibit area for a case docket. A View selector switches what the area shows; exactly one view is mounted at a time and the one
// that was showing is disposed first. The ruling sits above this area and never changes with the view.
// views: [{ key, label, title, ask, mount(body, env) -> { destroy() } | null }]
// env: { bodyW, wide, plotW } (plotW is the plot width a map should use, so the two maps share one frame at any width).
import { h, announce } from "../util.js";

const SIDE = 340;                       // width of the control column next to a map (plus the gap), at container widths of 880 px and up
const MAP_MARGINS = 60;                 // basemap.js margins that hold the axis labels (ML 46 + MR 14)

export function exhibit({ views, initial, tag, rulingNote, onView }) {
  let cur = views.some(v => v.key === initial) ? initial : views[0].key, handle = null, ro = null, lastPlotW = 0, token = 0;
  const title = h("h2", { id: "ex-h" }), ask = h("p", { class: "ex-ask" });
  const body = h("div", { class: "ex-body", "aria-live": "off" });
  const env = () => {
    const bodyW = Math.max(240, Math.round(body.clientWidth || 640)), wide = bodyW >= 880;
    return { bodyW, wide, plotW: Math.max(220, (wide ? bodyW - SIDE : bodyW) - MAP_MARGINS) };
  };
  // The ordinary views are always visible. Views marked `more: true` (alternative ways to draw the same data) sit behind a "More views" disclosure.
  const mkSeg = (list, name, label) => h("div", { class: "seg", role: "radiogroup", "aria-label": label }, list.map(v =>
    h("label", {}, h("input", { type: "radio", name, value: v.key, checked: v.key === cur, onchange: () => select(v.key, { focus: true }) }), h("span", {}, v.label))));
  const mainViews = views.filter(v => !v.more), moreViews = views.filter(v => v.more);
  const seg = mkSeg(mainViews, "ex-view", "View"), segMore = moreViews.length ? mkSeg(moreViews, "ex-view-more", "More views") : null;
  const moreBox = segMore ? h("details", { class: "quiet ex-more", open: moreViews.some(v => v.key === cur) }, h("summary", {}, "More views"), h("p", { class: "muted small", style: "margin:8px 0" }, "Other ways to draw the same data. None of them is a test, and none changes the ruling."), segMore) : null;
  const allSegs = () => [seg, segMore].filter(Boolean);
  const root = h("section", { class: "surface exhibit", id: "exhibit", tabindex: "-1", "aria-labelledby": "ex-h" },
    h("div", { class: "exhibit-head" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit"), title), tag),
    h("div", { class: "ex-views" }, h("span", { class: "ex-views-l", id: "ex-views-l" }, "View"), seg),
    moreBox,
    ask, body,
    rulingNote ? h("p", { class: "ex-foot" }, rulingNote) : null);

  function dispose() { token++; if (handle && handle.destroy) { try { handle.destroy(); } catch (e) { console.error(e); } } handle = null; body.replaceChildren(); }
  async function mountCurrent() {
    const my = ++token, v = views.find(x => x.key === cur), e = env();
    title.textContent = v.title; ask.textContent = v.ask; lastPlotW = e.plotW;
    if (handle && handle.destroy) { try { handle.destroy(); } catch (er) { console.error(er); } } handle = null; body.replaceChildren();
    body.append(h("p", { class: "loading muted", role: "status" }, "Loading this view."));
    let hnd = null;
    try { hnd = await v.mount(body, e); } catch (err) { console.error(err); body.replaceChildren(h("p", { class: "viz-fallback" }, "This view could not be drawn here. The regional record and the ruling above are unaffected. " + (err && err.message ? `(${err.message})` : ""))); return; }
    if (my !== token) { if (hnd && hnd.destroy) hnd.destroy(); return; }       // the person switched again while this view was loading
    body.querySelectorAll(":scope > .loading").forEach(n => n.remove());
    handle = hnd;
  }
  function select(key, opts = {}) {
    if (!views.some(v => v.key === key)) return;
    const changed = key !== cur; cur = key;
    allSegs().forEach(sg => sg.querySelectorAll("input").forEach(i => { i.checked = i.value === key; }));
    if (moreBox && moreViews.some(v => v.key === key)) moreBox.open = true;
    if (changed) { mountCurrent(); announce(`${views.find(v => v.key === key).title}. The ruling is unchanged.`); onView && onView(key); }
    if (opts.scroll) { root.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); root.focus({ preventScroll: true }); }
    if (opts.focus) { const i = root.querySelector(`.ex-views input[value="${key}"], .ex-more input[value="${key}"]`); if (i) i.focus(); }
  }
  // The frame depends on the width of the area: remount a map view when the width class or the plot width really changed.
  function watch() {
    if (!window.ResizeObserver) return;
    let timer = 0;
    ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => { const e = env(); if (Math.abs(e.plotW - lastPlotW) > 8 && views.find(v => v.key === cur).frame) mountCurrent(); else lastPlotW = e.plotW; }, 180); });
    ro.observe(body);
  }
  return { node: root, select, current: () => cur, start() { mountCurrent(); watch(); }, dispose() { if (ro) ro.disconnect(); dispose(); } };
}
