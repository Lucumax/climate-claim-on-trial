import { h } from "../util.js";
import { KIND } from "./common.js";

export function landing(b, cat) {
  const first = b.claims[0];
  const steps = [["Choose a clue", "Pick a NASA Earth measurement, such as air temperature or rainfall."], ["Choose a region", "A preset, a box you draw on the map, or the whole world."], ["Choose a period", "Start and end years, and optionally one season."], ["Look at the series", "A time series chart with the trend line on it."], ["Test the trend", "Is it significant? Then put it on trial with tougher tests."]];
  return { title: "Be a trend detective", node: h("div", {},
    h("section", { class: "hero" },
      h("p", { class: "eyebrow" }, "NASA Earth data · trend detective"),
      h("h1", { id: "page-title", tabindex: "-1" }, "Be a trend detective."),
      h("p", { class: "lede" }, "Someone says the climate has changed where you live. Is that true? Pick a NASA Earth measurement, a place and a time period, look at the time series, and test whether the trend is real. Then put the result on trial and see what each tougher test changes, even when it weakens or strengthens your answer."),
      h("div", { class: "cta" }, h("a", { class: "btn", href: "#/detective" }, "Start investigating"), h("a", { class: "btn-quiet", href: "#/cases" }, "Open the case files"))),
    h("section", { "aria-labelledby": "five-h" }, h("h2", { id: "five-h" }, "Five steps to a finding"),
      h("ol", { class: "grid g3 fivesteps" }, steps.map((s, i) => h("li", { class: "card" }, h("p", { class: "eyebrow" }, "Step " + (i + 1)), h("h3", {}, s[0]), h("p", { class: "muted", style: "margin:0" }, s[1]))))),
    h("section", { style: "margin-top:32px", "aria-labelledby": "modes-h" }, h("h2", { id: "modes-h" }, "Two ways to investigate"),
      h("div", { class: "grid g2" },
        h("div", { class: "card" }, h("h3", {}, "Detective mode"), h("p", { class: "muted" }, "Your own exploration. You choose the variable, region and period, and the page builds the series and tests the trend. Results are labelled as exploration, not pre-registered."), h("a", { class: "btn", href: "#/detective" }, "Go to Detective mode")),
        h("div", { class: "card" }, h("h3", {}, "Case files"), h("p", { class: "muted" }, "Claims we registered before looking at any data, tested on NASA satellite and model data with a four-rung ladder and a map of every grid cell. Includes a smoke-and-haze case over Wisconsin."), h("a", { class: "btn-quiet", href: "#/cases" }, "Browse the case files")))),
    h("section", { style: "margin-top:32px", "aria-labelledby": "clues-h" }, h("h2", { id: "clues-h" }, "Know your clues"), h("p", { class: "muted" }, "Plain definitions of the measurements you can investigate."),
      h("dl", { class: "defs grid g3" }, ...(cat.variables.map(v => h("div", { class: "card" }, h("dt", {}, v.name), h("dd", {}, v.one_line, h("span", { class: "small", style: "display:block;margin-top:8px" }, h("span", { class: "chip " + (v.kind === "model_reanalysis" ? "warn" : "neutral") }, v.kind === "model_reanalysis" ? "Model-based" : "Satellite observation"), " Unit: " + v.units + (v.live === false ? ". Case files only." : ""))))))),
      h("p", { class: "muted small", style: "margin-top:12px" }, "Model output (a reanalysis) blends many observations in a computer model. It is useful for trends but is not a direct measurement.")),
  ) };
}
