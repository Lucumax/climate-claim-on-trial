// Home: a small, non-modal offer to take the 3-minute guided route, shown once to first-time visitors.
// It never blocks the page and never takes focus. "Show me" presses the same button as the hero (#gd-start); "No thanks" and Escape dismiss it.
// It stays away for automated captures and the demo video: ?t=, ?tour=0 or navigator.webdriver. ?tour=1 shows it regardless (for review and tests).
import { h, announce } from "../util.js";

const KEY = "cct_tour_seen";
let shownThisLoad = false;   // when storage is blocked, "first visit" still means once per page load
const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set() { try { localStorage.setItem(KEY, "1"); } catch (e) { /* blocked: the module flag covers it */ } } };

export function tourNudge(hookRoot) {
  const params = new URLSearchParams(location.search), hp = new URLSearchParams((location.hash.split("?")[1]) || "");
  const p = k => params.get(k) != null ? params.get(k) : hp.get(k);
  const forced = p("tour") === "1";
  const startBtn = hookRoot.querySelector("#gd-start"), slot = hookRoot.querySelector("#hk-cta"), panel = () => hookRoot.querySelector("#gd-panel");
  if (!startBtn || !slot) return null;
  const blocked = p("tour") === "0" || p("t") != null || (navigator.webdriver && !forced);
  if (blocked || (!forced && (shownThisLoad || store.get()))) return null;

  let timer = 0, poll = 0, shown = false, off = false;
  const node = h("div", { class: "tour-nudge", id: "tour-nudge", role: "region", "aria-label": "Tour offer", hidden: true },
    h("p", { class: "tn-t" }, h("b", {}, "New here?"), " Take the 3-minute tour."),
    h("div", { class: "tn-b" },
      h("button", { class: "btn", type: "button", id: "tn-yes", onclick: () => { dismiss(false); startBtn.click(); } }, "Show me"),
      h("button", { class: "btn-quiet", type: "button", id: "tn-no", onclick: () => dismiss(true) }, "No thanks")));
  slot.append(node);

  function dismiss(refocus) {
    if (off) return; off = true; clearTimeout(timer); clearInterval(poll);
    document.removeEventListener("keydown", onKey, true); startBtn.removeEventListener("click", onStart);
    const had = node.contains(document.activeElement);
    store.set(); node.hidden = true;
    if (had && refocus) startBtn.focus();   // only when focus was inside the card, so it is not lost
  }
  const onKey = e => { if (e.key === "Escape" && shown && !off) dismiss(true); };
  const onStart = () => dismiss(false);
  function show() {
    if (off || shown) return;
    const g = panel();
    if (g && !g.hidden) { dismiss(false); return; }   // the guided route is already open
    shown = true; shownThisLoad = true; store.set(); node.hidden = false;
    document.addEventListener("keydown", onKey, true); startBtn.addEventListener("click", onStart);
    announce("New here? A 3-minute guided tour is available, just after the start button.");
  }
  function arm() { timer = setTimeout(show, 1500); }
  if (document.documentElement.dataset.hookReady === "1") arm();
  else { let n = 0; poll = setInterval(() => { if (document.documentElement.dataset.hookReady === "1") { clearInterval(poll); arm(); } else if (++n > 150) clearInterval(poll); }, 200); }
  return { node, dispose() { clearTimeout(timer); clearInterval(poll); document.removeEventListener("keydown", onKey, true); startBtn.removeEventListener("click", onStart); node.remove(); } };
}
