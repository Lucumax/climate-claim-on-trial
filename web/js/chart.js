// Regional anomaly chart: points, uncertainty band, Sen trend, and the ordinary least squares baseline. Hand SVG.
import { h, s, signed, fmtPx } from "./util.js";

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= raw);
  const t = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10));
  return { ticks: t, step };
}
const median = a => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

export function seriesFits(claim) {
  const r = claim.regional, yrs = r.years, y = r.anomaly, n = yrs.length;
  const t = yrs.map(v => v - yrs[0]);
  const senB = r.sen.slope_per_decade / 10;
  const senA = r.sen.intercept != null ? r.sen.intercept : median(y.map((v, i) => v - senB * t[i]));
  const my = y.reduce((a, b) => a + b, 0) / n, mt = t.reduce((a, b) => a + b, 0) / n;
  const olsB = r.ols.slope_per_decade / 10, olsA = r.ols.intercept != null ? r.ols.intercept : my - olsB * mt;
  return { t, sen: r.sen_line || t.map(v => senA + senB * v), ols: t.map(v => olsA + olsB * v) };
}

export function seriesChart(claim) {
  const r = claim.regional, fit = seriesFits(claim), iv = r.interval, t = r.test, band = r.band_lo && r.band_hi ? { lo: r.band_lo, hi: r.band_hi } : null;
  const ivWord = iv ? `${iv.label} ${signed(iv.lo)} to ${signed(iv.hi)}` : "interval not shown: failed its coverage check";
  const tWord = t ? ` Regional test: ${t.title}, p = ${fmtPx(t.p)}, variance factor ${t.factor != null ? t.factor.toFixed(2) : "n/a"}.` : " Regional test not shown: it did not pass its calibration check.";
  return trendChart({
    x: r.years, y: r.anomaly, units: r.units, band, fmtX: v => String(v), ptR: 3.6, xTickStep: r.years.length > 30 ? 10 : 5,
    lines: [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: fit.sen }, { label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: fit.ols }],
    describe: `Regional anomaly series for ${claim.region.name}, ${r.years[0]} to ${r.years[r.years.length - 1]}. Sen trend ${signed(r.sen.slope_per_decade)} ${r.units} per decade; ${ivWord}.${tWord} Least squares baseline ${signed(r.ols.slope_per_decade)} per decade.${band ? " The shaded band is the slope range of the interval, pivoted at the middle year." : ""}`,
    yLabel: `Anomaly (${r.units})`, pointWord: "anomaly",
    keyItems: [["k-pt", "Yearly regional anomaly"], ...(band ? [["k-band", "Slope-range band (95% slope interval)"]] : []), ["k-sen", "Sen trend (the verdict's estimate)"], ["k-ols", "Ordinary least squares (familiar baseline)"]],
  });
}

// Generic trend chart. opts: x (numbers), y, units, band {lo,hi}|null, lines [{label,cls,lbl,y}], fmtX, ptR, xTickStep, describe, yLabel, keyItems
export function trendChart(o) {
  const narrow = window.innerWidth < 640, yrs = o.x, y = o.y, n = yrs.length, W = narrow ? 380 : 760, H = narrow ? 360 : 380, m = { l: 46, r: narrow ? 100 : 118, t: 16, b: 40 };
  const all = [...y, ...(o.band ? [...o.band.lo, ...o.band.hi] : []), ...o.lines.flatMap(l => l.y)];
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const xs = v => m.l + (v - yrs[0]) / (yrs[n - 1] - yrs[0]) * (W - m.l - m.r);
  const ys = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
  const { ticks } = niceTicks(lo, hi, 5);
  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
  for (const t of ticks) svg.append(s("line", { class: "grid", x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t) }), s("text", { x: m.l - 8, y: ys(t) + 4, "text-anchor": "end" }, String(+t.toPrecision(4))));
  const x0 = Math.ceil(yrs[0]), x1 = Math.floor(yrs[n - 1]), step = o.xTickStep || (x1 - x0 > 30 ? 10 : x1 - x0 > 12 ? 5 : 2);
  for (let yr = x0; yr <= x1; yr++) if (yr % step === 0 || (yr === x0 && (step - (x0 % step)) >= step / 2)) svg.append(s("text", { x: xs(yr), y: H - m.b + 20, "text-anchor": "middle" }, String(yr)), s("line", { class: "axis", x1: xs(yr), x2: xs(yr), y1: H - m.b, y2: H - m.b + 4 }));
  svg.append(s("line", { class: "axis", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
  if (lo < 0 && hi > 0) svg.append(s("line", { class: "zero", x1: m.l, x2: W - m.r, y1: ys(0), y2: ys(0) }));
  svg.append(s("text", { x: 14, y: (m.t + H - m.b) / 2, transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})`, "text-anchor": "middle" }, o.yLabel));
  const P = (v, i, arr) => `${xs(v).toFixed(1)},${ys(arr[i]).toFixed(1)}`;
  if (o.band) svg.append(s("polygon", { class: "band", points: yrs.map((v, i) => P(v, i, o.band.hi)).concat(yrs.map((v, i) => P(v, i, o.band.lo)).reverse()).join(" ") }));
  svg.append(s("polyline", { class: "ser", points: yrs.map((v, i) => P(v, i, y)).join(" ") }));
  for (const l of [...o.lines].reverse()) svg.append(s("polyline", { class: l.cls, points: yrs.map((v, i) => P(v, i, l.y)).join(" ") }));
  const pts = yrs.map((v, i) => s("circle", { class: "pt", cx: xs(v), cy: ys(y[i]), r: o.ptR || 3.6 }));
  svg.append(...pts);
  const labs = o.lines.map(l => ({ l, y: ys(l.y[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 16) labs[i].y = labs[i - 1].y + 16;
  for (const q of labs) svg.append(s("text", { class: q.l.lbl, x: W - m.r + 8, y: q.y + 4 }, q.l.label));
  const guide = s("line", { class: "guide", y1: m.t, y2: H - m.b, visibility: "hidden" }); svg.append(guide);
  const readout = h("div", { class: "readout", "aria-live": "polite" }, "Hover or focus the chart and use the left and right arrow keys to read values.");
  let sel = -1;
  const fx = o.fmtX || (v => v.toFixed(2));
  function pick(i) {
    if (sel >= 0) pts[sel].classList.remove("sel"); sel = i; pts[i].classList.add("sel");
    guide.setAttribute("x1", xs(yrs[i])); guide.setAttribute("x2", xs(yrs[i])); guide.setAttribute("visibility", "visible");
    readout.textContent = `${fx(yrs[i])}: ${o.pointWord || "value"} ${signed(y[i], 3)} ${o.units}.` + (o.band ? ` Band ${signed(o.band.lo[i])} to ${signed(o.band.hi[i])}.` : "") + o.lines.map(l => ` ${l.label} ${signed(l.y[i], 3)}.`).join("");
  }
  svg.addEventListener("pointermove", ev => { const b = svg.getBoundingClientRect(); const x = (ev.clientX - b.left) / b.width * W; let best = 0, bd = 1e9; yrs.forEach((v, i) => { const d = Math.abs(xs(v) - x); if (d < bd) { bd = d; best = i; } }); pick(best); });
  const wrap = h("div", { class: "mapfocus", tabindex: "0", role: "group", "aria-label": o.describe + " Left and right arrow keys read each point." }, svg);
  wrap.addEventListener("keydown", ev => {
    const big = ev.shiftKey ? 12 : 1;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { ev.preventDefault(); pick(sel < 0 ? (ev.key === "ArrowLeft" ? n - 1 : 0) : Math.max(0, Math.min(n - 1, sel + (ev.key === "ArrowRight" ? big : -big)))); }
    if (ev.key === "Home") { ev.preventDefault(); pick(0); } if (ev.key === "End") { ev.preventDefault(); pick(n - 1); }
  });
  const key = h("div", { class: "chartkey", "aria-hidden": "true" }, o.keyItems.map(([c, t]) => h("span", { class: c }, t)));
  const table = h("details", { class: "card" }, h("summary", {}, "Show the numbers as a table"),
    h("div", { class: "scroll" }, h("table", { class: "data" },
      h("thead", {}, h("tr", {}, ["Time", `Value (${o.units})`, ...(o.band ? ["Band low", "Band high"] : []), ...o.lines.map(l => l.label)].map(t => h("th", { scope: "col" }, t)))),
      h("tbody", {}, yrs.map((yr, i) => h("tr", {}, h("td", {}, fx(yr)), [y[i], ...(o.band ? [o.band.lo[i], o.band.hi[i]] : []), ...o.lines.map(l => l.y[i])].map(v => h("td", {}, v.toFixed(3)))))))));
  return { node: h("div", {}, wrap, readout, key, h("div", { style: "margin-top:12px" }, table)), summary: o.describe };
}

// Horizontal bars: flagged share by rung (claimed direction or any direction)
export function rungBars(claim, mode) {
  const narrow = window.innerWidth < 640;
  const L = claim.ladder, W = narrow ? 400 : 760, rowH = narrow ? 70 : 62, H = L.length * rowH + 20, left = narrow ? 0 : 230, right = narrow ? 56 : 70;
  const val = r => (mode === "any" ? r.flagged_fraction_any : r.flagged_fraction_claimed);
  const svg = s("svg", { class: "bars", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Flagged share of the mapped area on each rung: " + L.map(r => `rung ${r.rung} ${r.label} ${(val(r) * 100).toFixed(1)} percent`).join("; ") });
  const maxV = Math.max(0.05, ...L.map(val));
  const x = v => left + v / maxV * (W - left - right);
  L.forEach((r, i) => {
    const y = 8 + i * rowH, v = val(r), by = narrow ? y + 26 : y + 4;
    svg.append(s("text", { x: 0, y: y + 14, "font-weight": 700 }, `${r.rung}. ${r.label}` + (narrow ? ` (${mode === "any" ? r.n_flagged_any : r.n_flagged_claimed} of ${r.n_cells} cells)` : "")));
    if (!narrow) svg.append(s("text", { class: "sub", x: 0, y: y + 32 }, `${mode === "any" ? r.n_flagged_any : r.n_flagged_claimed} of ${r.n_cells} cells`));
    svg.append(s("rect", { class: "track", x: left, y: by, width: W - left - right, height: 28, rx: 4 }),
      s("rect", { class: mode === "any" ? "b-any" : "b-up", x: left, y: by, width: Math.max(v > 0 ? 2 : 0, x(v) - left), height: 28, rx: 4 }),
      s("text", { x: W - right + 8, y: by + 20, "font-weight": 700 }, (v * 100).toFixed(1) + "%"));
  });
  return svg;
}
