// Home: "Try a 3-minute investigation". A short guided route that reuses what is already on the page, with no new data:
//   1 predict (Alaska warming or cooling?)  2 move the years window and watch the headline flip  3 see the whole record
//   4 see the False-Alarm Planet (why tests get checked)  then an exit question with the answer revealed, and a clear finish.
// It drives the hook through its own controls (the preset buttons and the region button) and reads its headline back from the page,
// so every number shown here is the one the hook computed. Skippable at any point; every control is a real button or radio.
import { h, announce } from "../util.js";

const WORD = { warming: "warming", cooling: "cooling", unsure: "not sure" };
const STEPS = ["Predict", "Move the years", "See the whole record", "Why tests get checked"];

export function guided(hookRoot, { showPlanet } = {}) {
  const q = sel => hookRoot.querySelector(sel);
  const S = { step: -1, guess: null, tones: new Set(), checked: false, shownFull: false };   // step: -1 closed, 0..3 steps, 4 exit question, 5 finish
  let mo = null;

  const root = h("section", { class: "guided", "aria-labelledby": "gd-h" });
  const body = h("div", { class: "gd-body", hidden: true });
  const startBtn = h("button", { class: "btn", type: "button", id: "gd-start" }, "Start the 3-minute investigation");
  const head = h("div", { class: "gd-head" },
    h("div", {}, h("h2", { id: "gd-h" }, "Try a 3-minute investigation"),
      h("p", { class: "gd-lede" }, "Make a guess, move the years yourself, check the whole record, then see why tests get checked. Four short steps, and you can leave at any time.")),
    startBtn);
  root.append(head, body);

  // ------------------------------------------------------------ helpers that read the hook
  const readHeadline = () => {
    const lead = (q("#hk-lead") || {}).textContent || "", num = (q("#hk-num") || {}).textContent || "", win = (q(".win-label") || {}).textContent || "";
    return { text: `${lead.trim()} ${num.replace(/\s+/g, " ").trim()}`.trim(), win: win.trim(), mode: (q("#page-title") || {}).dataset ? q("#page-title").dataset.mode : "none" };
  };
  const press = pick => { const b = q(`.hk-chip[data-pick="${pick}"]`); if (b) b.click(); };
  const ensureAlaska = () => { const b = q('.hk-regions button[data-case="C-C"]'); if (b && b.getAttribute("aria-pressed") !== "true") b.click(); };
  const resolveWord = () => { const m = /says ([a-z ]+?) \(/i.exec((q("#hk-resolve") || {}).textContent || ""); return m ? m[1].trim() : null; };

  function watch() {
    stopWatch();
    const fig = q("#hk-fig"); if (!fig) return;
    mo = new MutationObserver(() => {
      const hd = readHeadline();
      if (hd.mode === "win") S.tones.add(fig.dataset.tone);
      const out = body.querySelector("#gd-readout");
      if (out) out.textContent = `${hd.win ? hd.win + ": " : ""}${hd.text}`;
      if (S.step === 1 && S.tones.has("down") && S.tones.has("up")) setFeedback("You saw the headline flip from cooling to warming without changing a single data point. Only the years changed.", true);
    });
    mo.observe(fig, { attributes: true, attributeFilter: ["data-tone"] });
    const t = q("#hk-lead"); if (t) mo.observe(t, { childList: true, characterData: true, subtree: true });
    const n = q("#hk-num"); if (n) mo.observe(n, { childList: true, characterData: true, subtree: true });
  }
  function stopWatch() { if (mo) { mo.disconnect(); mo = null; } }

  // ------------------------------------------------------------ rendering
  let fb = null;
  function setFeedback(t, polite) { if (!fb) return; fb.textContent = t; if (polite) announce(t); }
  const progress = () => h("ol", { class: "gd-steps", "aria-label": "Steps" }, STEPS.map((n, i) => h("li", { class: i < S.step || S.step > 3 ? "done" : i === S.step ? "now" : "", "aria-current": i === S.step ? "step" : null }, h("span", { class: "gd-dot", "aria-hidden": "true" }, String(i + 1)), h("span", { class: "gd-sn" }, n))));
  const nav = (...btns) => h("div", { class: "actions gd-actions" }, ...btns);
  const next = (label = "Next", to = S.step + 1) => h("button", { class: "btn", type: "button", id: "gd-next", onclick: () => go(to) }, label);
  const back = () => S.step > 0 ? h("button", { class: "btn-quiet", type: "button", onclick: () => go(S.step - 1) }, "Back") : null;
  const skip = () => h("button", { class: "btn-text", type: "button", id: "gd-skip", onclick: close }, "Skip the tour");

  function stepTitle(n, t) { return h("h3", { id: "gd-step-h", tabindex: "-1" }, `Step ${n} of 4 · ${t}`); }

  function view() {
    fb = h("p", { class: "gd-feedback", id: "gd-feedback", role: "status" });
    const st = S.step;
    if (st === 0) {
      const mk = (k, label) => h("button", { class: "btn-quiet gd-choice", type: "button", "aria-pressed": String(S.guess === k), onclick: e => {
        S.guess = k; for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        setFeedback(k === "unsure" ? "No problem: that is a fair answer. Watch what the record does next." : `You guessed ${WORD[k]}. Keep that in mind: we will check it against the whole record in step 3.`, true); } }, label);
      return [stepTitle(1, "Predict"), h("p", { class: "gd-q" }, "Is Alaska warming or cooling? Make a guess."), h("p", { class: "muted small" }, "Guess from what you already know, before you test it."),
        h("div", { class: "gd-choices", role: "group", "aria-label": "Your guess" }, mk("warming", "Warming"), mk("cooling", "Cooling"), mk("unsure", "Not sure")), fb, nav(next("Next: move the years"), skip())];
    }
    if (st === 1) {
      const hd = readHeadline();
      return [stepTitle(2, "Move the years"),
        h("p", { class: "gd-q" }, "Slide the shaded window along the Alaska record above, and watch the headline flip."),
        h("p", { class: "muted small" }, "Drag the window, or focus it and use the arrow keys, or press a preset. It is the same record and the same method each time; only the years change."),
        h("div", { class: "gd-choices" }, h("button", { class: "btn-quiet", type: "button", onclick: () => { press("a"); } }, "Show the first window"), h("button", { class: "btn-quiet", type: "button", onclick: () => { press("b"); } }, "Show the second window"),
          h("button", { class: "btn-quiet", type: "button", onclick: () => { const g = q("#hk-fig .win-g"); if (g) g.focus(); } }, "Focus the window to use the arrow keys")),
        h("p", { class: "gd-readout", id: "gd-readout", "aria-live": "off" }, `${hd.win ? hd.win + ": " : ""}${hd.text}`), fb, nav(next("Next: the whole record"), back(), skip())];
    }
    if (st === 2) {
      return [stepTitle(3, "See the whole record"),
        h("p", { class: "gd-q" }, "Now zoom out: what does the full record say?"),
        h("div", { class: "gd-choices" }, h("button", { class: "btn", type: "button", id: "gd-full", onclick: () => {
          press("full"); S.shownFull = true;
          const w = resolveWord(), g = S.guess && S.guess !== "unsure" ? WORD[S.guess] : null;
          const t = `${(q("#hk-resolve") || {}).textContent || ""}`.trim();
          setFeedback(`${g && w ? (g === w ? `You guessed ${g}, and the whole record agrees. ` : `You guessed ${g}; the whole record says ${w}. `) : ""}${t}`, true);
          const lk = body.querySelector("#gd-case"); if (lk) lk.hidden = false; } }, "Show the whole record")),
        fb,
        h("p", { class: "gd-case", id: "gd-case", hidden: true }, h("a", { href: "#/case/C-C" }, "Open the registered Alaska case"), " to see its ruling and scope. It uses a different estimate (Sen), which is why its number differs slightly from the demo."),
        nav(next("Next: why tests get checked"), back(), skip())];
    }
    if (st === 3) {
      return [stepTitle(4, "Why tests get checked"),
        h("p", { class: "gd-q" }, "A test can also be fooled. So we test the tests."),
        h("p", {}, "On the False-Alarm Planet there is no real trend anywhere, yet a plain test still flags about 1 cell in 5 as a change. Each flag there is a false alarm."),
        h("div", { class: "gd-choices" }, h("button", { class: "btn", type: "button", id: "gd-planet", onclick: () => { if (showPlanet) showPlanet(); setFeedback("The planet is on this page, just below. Try the different tests on it; the real trend is zero everywhere.", true); } }, "Show me the planet on this page"),
          h("a", { class: "btn-quiet", href: "#/false-alarm" }, "Open False-Alarm Planet")), fb,
        nav(next("Next: the exit question"), back(), skip())];
    }
    if (st === 4) {
      const opts = [
        ["a", "The NASA data were different in each window.", "Not quite. It is one record; only the years changed."],
        ["b", "Each window covers only part of a record that rises and falls from year to year, so a short window can slope differently from the whole.", "Yes."],
        ["c", "One of the two windows must contain a mistake.", "Not quite. Both are correct fits for their own years."]];
      let pick = null;
      const reveal = h("div", { class: "gd-reveal", id: "gd-reveal", hidden: true }, h("p", {}, h("b", {}, "Answer: the second option. "), "A yearly record wobbles. A short stretch can tilt the other way from the long-term change, and the shorter the stretch, the more the result depends on where it starts and ends. That is why a trend claim should name its years, and why a test is checked on worlds where the true answer is known."));
      const group = h("fieldset", { class: "gd-opts" }, h("legend", {}, "Choose one answer"), opts.map(([k, t]) => h("label", { class: "gd-opt" }, h("input", { type: "radio", name: "gd-exit", value: k, onchange: () => { pick = k; setFeedback("", false); } }), h("span", {}, t))));
      const check = h("button", { class: "btn", type: "button", id: "gd-check", onclick: () => {
        const o = opts.find(x => x[0] === pick); if (!o) { setFeedback("Choose an answer first, or press Show me the answer.", true); return; }
        setFeedback(o[2], true); reveal.hidden = false; S.checked = true; fin.hidden = false; } }, "Check my answer");
      const show = h("button", { class: "btn-quiet", type: "button", onclick: () => { reveal.hidden = false; S.checked = true; fin.hidden = false; setFeedback("Here is the answer.", true); } }, "Show me the answer");
      const fin = h("button", { class: "btn", type: "button", id: "gd-finish", hidden: true, onclick: () => go(5) }, "Finish");
      return [h("h3", { id: "gd-step-h", tabindex: "-1" }, "Exit question"), h("p", { class: "gd-q" }, "Why can two windows of the same record disagree?"), group, nav(check, show), fb, reveal, nav(fin, back(), skip())];
    }
    return [h("h3", { id: "gd-step-h", tabindex: "-1" }, "You've finished"),
      h("p", { class: "gd-q" }, "You've finished: try your own claim in Investigate."),
      h("p", { class: "muted" }, "Pick a NASA measurement, a place and a period, and see how the answer changes when you change one thing at a time."),
      nav(h("a", { class: "btn", href: "#/investigate", id: "gd-go" }, "Try your own claim in Investigate"), h("button", { class: "btn-quiet", type: "button", onclick: () => { S.guess = null; S.tones.clear(); go(0); } }, "Start over"), h("button", { class: "btn-text", type: "button", onclick: close }, "Close"))];
  }

  function go(n) {
    S.step = n; startBtn.hidden = true;
    if (n === 0) { ensureAlaska(); }
    if (n === 1) { S.tones.clear(); watch(); setTimeout(() => press("a"), 0); }
    if (n !== 1) { if (n >= 2) stopWatch(); }
    body.hidden = false; root.classList.add("is-open");
    body.replaceChildren(...[S.step <= 3 ? progress() : null, ...view()].filter(Boolean));
    const hh = body.querySelector("#gd-step-h"); if (hh) hh.focus({ preventScroll: false });
    announce(S.step === 5 ? "You've finished." : S.step === 4 ? "Exit question." : `Step ${n + 1} of 4: ${STEPS[n]}.`);
  }
  function close() {
    stopWatch(); S.step = -1; body.hidden = true; body.replaceChildren(); root.classList.remove("is-open"); startBtn.hidden = false; startBtn.focus();
  }
  startBtn.addEventListener("click", () => go(0));
  // On a phone the card sits two screens below the headline, so the hook also carries a compact entry to the same route (hidden on wide screens, where the card is already in view).
  const row = q("#hk-pick");
  if (row) {
    const jump = h("button", { class: "hk-guided-cta", type: "button", id: "gd-jump", onclick: () => { go(0); root.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } }, "Try a 3-minute investigation");
    row.append(jump);
  }
  return { node: root, dispose() { stopWatch(); const j = q("#gd-jump"); if (j) j.remove(); } };
}
