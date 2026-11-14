import { h } from "../util.js";
import { KIND } from "./common.js";

export function landing(b, cat) {
  const hasCase = id => b.claims.some(c => c.id === id);
  const steps = [["Choose a clue", "Pick a NASA Earth measurement, such as air temperature or rainfall."], ["Choose a region", "A preset region or a box you draw on the map. Live runs are limited to regional boxes."], ["Choose a period", "Start and end years, and optionally one season."], ["Look at the series", "A time series chart with the trend line on it."], ["Test the trend", "Is it significant? Then put it on trial: three extra checks, each changing one thing."]];
  return { title: "Be a trend detective", node: h("div", {},
    h("section", { class: "hero" },
      h("p", { class: "eyebrow" }, "NASA Earth data · trend detective"),
      h("h1", { id: "page-title", tabindex: "-1" }, "Be a trend detective."),
      h("p", { class: "lede" }, "Someone says the climate has changed where you live. Is that true? Pick a NASA Earth measurement, a place and a time period, look at the time series, and test whether the trend stands out from chance. Then put the result on trial and see what each extra check changes, whether it weakens or strengthens your answer."),
      h("div", { class: "cta" }, h("a", { class: "btn", href: "#/detective" }, "Start investigating"), h("a", { class: "btn-quiet", href: "#/cases" }, "Open the case files"))),
    h("section", { class: "card", style: "margin-bottom:28px;border-top:4px solid var(--accent)", "aria-labelledby": "ex0-h" }, h("p", { class: "eyebrow brass" }, "Exhibit 0 · the first exhibit"), h("h2", { id: "ex0-h" }, "Before we judge real claims, meet a planet with no trend at all."), h("p", { class: "muted", style: "max-width:46rem" }, "We built a planet where nothing changes anywhere, then asked a standard trend test to find trends on it. Watch how many places it flags, and how many survive the tougher tests."), h("a", { class: "btn", href: "#/false-alarm" }, "Meet Planet Null")),
    h("section", { "aria-labelledby": "five-h" }, h("h2", { id: "five-h" }, "Five steps to a finding"),
      h("ol", { class: "grid g3 fivesteps" }, steps.map((s, i) => h("li", { class: "card" }, h("p", { class: "eyebrow" }, "Step " + (i + 1)), h("h3", {}, s[0]), h("p", { class: "muted", style: "margin:0" }, s[1]))))),
    h("section", { style: "margin-top:32px", "aria-labelledby": "modes-h" }, h("h2", { id: "modes-h" }, "Two ways to investigate"),
      h("div", { class: "grid g2" },
        h("div", { class: "card" }, h("h3", {}, "Detective mode"), h("p", { class: "muted" }, "Your own exploration. You choose the variable, region and period, and the page builds the series and tests the trend. Results are labelled as exploration, not pre-registered."), h("a", { class: "btn", href: "#/detective" }, "Go to Detective mode")),
        h("div", { class: "card" }, h("h3", {}, "Case files"), h("p", { class: "muted" }, "Claims we registered before looking at any data, tested on NASA data with a four-rung ladder and a map of every grid cell." + (hasCase("C-D") ? " Includes a smoke-and-haze case over Wisconsin." : " More cases are being processed.")), h("a", { class: "btn-quiet", href: "#/cases" }, "Browse the case files")))),
    h("section", { style: "margin-top:32px", "aria-labelledby": "clues-h" }, h("h2", { id: "clues-h" }, "Know your clues"), h("p", { class: "muted" }, "Plain definitions of the measurements you can investigate."),
      h("dl", { class: "defs grid g3" }, ...(cat.variables.map(v => h("div", { class: "card" }, h("dt", {}, v.name), h("dd", {}, v.one_line, h("span", { class: "small", style: "display:block;margin-top:8px" }, h("span", { class: "chip " + (v.kind === "model_reanalysis" ? "warn" : "neutral") }, v.kind === "model_reanalysis" ? "Model-based" : "Satellite observation"), " Unit: " + v.units + (v.live === false ? (v.case_id && hasCase(v.case_id) ? ". Case files only." : ". Case pending: data being processed.") : ""))))))),
      h("p", { class: "muted small", style: "margin-top:12px" }, "Model output (a reanalysis) blends many observations in a computer model. It is useful for trends but is not a direct measurement.")),
  ) };
}
