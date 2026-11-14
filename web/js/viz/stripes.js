// Regional stripes (idea: Ed Hawkins' warming stripes, CC BY 4.0 design credit): one stripe per year, color = the regional average
// difference from baseline, symmetric diverging scale printed under the band. Slim by design: a header strip for a case page.
// Question it answers: what does the regional average look like, year after year?
// render(container, data, options) -> {destroy, el}. Options: height (default 72).
import { el, sv, tok, onTheme, makeScale, signed, plain, unitText, regionalDetails, sizeObserver, clamp, nextId } from "./common.js";

const NICE = [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5];

export async function render(container, data, options = {}) {
  const U = unitText(data), yrs = data.regional.years, vals = data.regional.anomaly, n = yrs.length;
  const maxAbs = Math.max(...vals.filter((v) => v != null).map(Math.abs));
  const RM = NICE.find((v) => v >= maxAbs) || Math.ceil(maxAbs);
  const dataR = { ...data, scale: { max: RM } };
  let scale = makeScale(dataR), destroyed = false, W = 0;
  const summaryId = nextId("viz-sum"), BH = options.height || 72;
  const svg = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;max-width:100%" });
  const readout = el("p", { class: "viz-readout viz-num" }, "Point at a stripe to read its year.");
  const have = vals.filter((v) => v != null);
  const summary = el("p", { class: "viz-summary", id: summaryId }, `Regional ${data.measure.toLowerCase()} over ${data.region_name}, ${yrs[0]}–${yrs[n - 1]}: one stripe per year, from ${signed(Math.min(...have), 2)} to ${signed(Math.max(...have), 2)} ${U} against the ${data.baseline.years[0]}–${data.baseline.years[1]} average. Color range ±${RM} ${U}.`);
  const root = el("figure", { class: "viz viz-stripes" }, svg, readout, summary, regionalDetails(data, "Regional values by year (table)", "stripes"),
    el("p", { class: "viz-note" }, "Stripes design: Ed Hawkins, ShowYourStripes (CC BY 4.0). Regional values are area-weighted averages on the case grid."));
  container.append(root);

  function draw() {
    W = clamp(Math.round(root.clientWidth || 640), 280, 1200);
    const narrow = W < 520, ML = 0, MT = 4, sw = (W - ML) / n, y1 = MT + BH;
    svg.replaceChildren(); svg.setAttribute("width", W); svg.setAttribute("height", y1 + 84); svg.setAttribute("viewBox", `0 0 ${W} ${y1 + 84}`);
    const ink = tok("ink", "#192D40"), surface = tok("surface", "#FFFDF7"), line = tok("line", "#C9C3B5");
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      svg.append(sv("rect", { x: (ML + i * sw).toFixed(2), y: MT, width: (sw + 0.6).toFixed(2), height: BH, fill: v == null ? "none" : scale.css(v), "data-i": i }));
    }
    svg.append(sv("rect", { x: 0.5, y: MT + 0.5, width: W - 1, height: BH - 1, fill: "none", stroke: line }));
    // year ticks
    const every = n > 30 ? 10 : 5;
    for (let i = 0; i < n; i++) if (yrs[i] % every === 0 || i === 0 || i === n - 1) {
      if ((i === 0 || i === n - 1) && n > 1 && (yrs[i] % every !== 0)) { /* end labels always */ }
      const x = ML + (i + 0.5) * sw, edge = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      if (!narrow || i === 0 || i === n - 1 || yrs[i] % 10 === 0) svg.append(sv("line", { x1: x, x2: x, y1: y1, y2: y1 + 4, stroke: tok("edge", "#7D7868") }), sv("text", { x: i === 0 ? Math.max(x - sw / 2, 0) : i === n - 1 ? Math.min(x + sw / 2, W) : x, y: y1 + 18, "text-anchor": edge, "font-size": 12, class: "t-muted num" }, String(yrs[i])));
    }
    // color key: 5 labeled ticks under the band, left aligned
    const kw = Math.min(260, W - 2), kx = 0, ky = y1 + 32;
    const defs = sv("defs"), gid = "stripe-grad-" + nextId("g");
    const grad = sv("linearGradient", { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 });
    for (let k = 0; k <= 20; k++) grad.append(sv("stop", { offset: k / 20, "stop-color": scale.css(-RM + (2 * RM * k) / 20) }));
    defs.append(grad); svg.append(defs);
    svg.append(sv("rect", { x: kx, y: ky, width: kw, height: 8, fill: `url(#${gid})`, stroke: line }));
    [[-RM, "start"], [0, "middle"], [RM, "end"]].forEach(([v, a]) => svg.append(sv("text", { x: kx + ((v + RM) / (2 * RM)) * kw, y: ky + 24, "text-anchor": a, "font-size": 12, class: "t-muted num" }, v === 0 ? "0 = baseline" : signed(v, RM < 1 ? 2 : 1))));
    if (W > kw + 200) svg.append(sv("text", { x: kx + kw + 12, y: ky + 8, "font-size": 12, class: "t-muted" }, `${U}, ${data.baseline.years[0]}–${data.baseline.years[1]} average`));
    else svg.append(sv("text", { x: 0, y: ky + 42, "font-size": 12, class: "t-muted" }, `${U}, against the ${data.baseline.years[0]}–${data.baseline.years[1]} average`));
    void ink; void surface;
  }
  function readAt(cx) {
    const r = svg.getBoundingClientRect(), i = clamp(Math.floor(((cx - r.left) / r.width) * n), 0, n - 1);
    readout.textContent = `${yrs[i]}: ${vals[i] == null ? "no regional value" : signed(vals[i], 2) + " " + U + " from the baseline"}.`;
  }
  svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") readAt(e.clientX); });
  svg.addEventListener("pointerdown", (e) => readAt(e.clientX));
  draw();
  const offSize = sizeObserver(root, () => { if (!destroyed && Math.abs(clamp(Math.round(root.clientWidth || 640), 280, 1200) - W) > 1) draw(); });
  const offTheme = onTheme(() => { scale = makeScale(dataR); draw(); });
  void plain;
  return { el: root, destroy() { destroyed = true; offSize(); offTheme(); root.remove(); } };
}
