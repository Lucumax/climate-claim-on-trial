// Regional anomaly chart: points, uncertainty band, Sen trend, and the ordinary least squares baseline. Hand SVG.
import { h, s, signed, fmtPx, minus, fmtNum, U } from "./util.js";

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

// Charts are built for the current width class (phone or wider) and rebuilt when the window crosses it, so text stays readable and SVGs never clip.
function responsive(build) {
  // The chart is drawn at its real pixel width (so 12px text stays 12px) and redrawn when the container changes width.
  const box = h("div", { class: "chart-box" });
  let last = 0;
  const draw = () => { const w = Math.max(300, Math.min(980, Math.round(box.clientWidth || 560))); last = w; box.replaceChildren(build(w)); };
  draw();
  if (window.ResizeObserver) new ResizeObserver(() => { const w = Math.round(box.clientWidth); if (w >= 200 && Math.abs(w - last) > 24) requestAnimationFrame(draw); }).observe(box);
  return box;
}

// Regional record for a case. By default: observations, the Sen trend and the slope-range band. opts.ols adds the least squares baseline.
export function seriesChart(claim, opts = {}) {
  const r = claim.regional, fit = seriesFits(claim), iv = r.interval, t = r.test, band = r.band_lo && r.band_hi ? { lo: r.band_lo, hi: r.band_hi } : null, u = U(r.units);
  const ivWord = iv ? `${iv.label} ${signed(iv.lo)} to ${signed(iv.hi)}` : "interval not shown: failed its coverage check";
  const tWord = t ? ` Regional test: ${t.title}, p = ${fmtPx(t.p)}, variance factor ${t.factor != null ? t.factor.toFixed(2) : "n/a"}.` : " Regional test not shown: it did not pass its calibration check.";
  const lines = [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: fit.sen }];
  if (opts.ols) lines.push({ label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: fit.ols });
  return trendChart({
    x: r.years, y: r.anomaly, units: u, band, fmtX: v => String(v), ptR: 3.6, xTickStep: r.years.length > 30 ? 10 : 5, lines,
    describe: `Regional anomaly series for ${claim.region.name}, ${r.years[0]} to ${r.years[r.years.length - 1]}. Sen trend ${signed(r.sen.slope_per_decade)} ${u} per decade; ${ivWord}.${tWord}${opts.ols ? ` Least squares baseline ${signed(r.ols.slope_per_decade)} per decade.` : ""}${band ? " The shaded band is the slope range of the interval, pivoted at the middle year." : ""}`,
    yLabel: `Anomaly (${u})`, pointWord: "anomaly",
    keyItems: [["k-pt", "Yearly regional anomaly"], ...(band ? [["k-band", "Slope-range band (95% slope interval)"]] : []), ["k-sen", claim.verdict && claim.verdict.branch === "withheld" ? "Sen trend (descriptive only)" : "Sen trend (the ruling's estimate)"], ...(opts.ols ? [["k-ols", "Least squares (baseline fit)"]] : [])],
  });
}

const ticksText = v => minus(String(+v.toPrecision(4)));

// Generic trend chart. opts: x (numbers), y, units, band {lo,hi}|null, lines [{label,cls,lbl,y}], fmtX, ptR, xTickStep, describe, yLabel, keyItems
export function trendChart(o) {
  const yrs = o.x, y = o.y, n = yrs.length, fx = o.fmtX || (v => v.toFixed(2));
  let pickFn = () => {}, selIdx = -1;
  const readout = h("div", { class: "readout", "aria-live": "polite" }, "Hover, tap or focus the chart and use the left and right arrow keys to read values.");
  const build = W => {
    const H = Math.round(Math.max(260, Math.min(420, W * 0.52))), m = { l: 48, r: W < 480 ? 92 : 112, t: 16, b: 40 };
    const all = [...y, ...(o.band ? [...o.band.lo, ...o.band.hi] : []), ...o.lines.flatMap(l => l.y)];
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    const xs = v => m.l + (v - yrs[0]) / (yrs[n - 1] - yrs[0]) * (W - m.l - m.r);
    const ys = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const { ticks } = niceTicks(lo, hi, 5);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
    for (const t of ticks) svg.append(s("line", { class: "grid", x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t) }), s("text", { x: m.l - 8, y: ys(t) + 4, "text-anchor": "end" }, ticksText(t)));
    const x0 = Math.ceil(yrs[0]), x1 = Math.floor(yrs[n - 1]), step = o.xTickStep || (x1 - x0 > 30 ? 10 : x1 - x0 > 12 ? 5 : 2);
    for (let yr = x0; yr <= x1; yr++) if (yr % step === 0 || (yr === x0 && xs(Math.ceil(x0 / step) * step) - xs(x0) >= 44)) svg.append(s("text", { x: xs(yr), y: H - m.b + 20, "text-anchor": "middle" }, String(yr)), s("line", { class: "axis", x1: xs(yr), x2: xs(yr), y1: H - m.b, y2: H - m.b + 4 }));
    svg.append(s("line", { class: "axis", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
    if (lo < 0 && hi > 0) svg.append(s("line", { class: "zero", x1: m.l, x2: W - m.r, y1: ys(0), y2: ys(0) }));
    svg.append(s("text", { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, "text-anchor": "middle" }, o.yLabel));
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
    let sel = -1;
    pickFn = i => {
      if (sel >= 0 && pts[sel]) pts[sel].classList.remove("sel"); sel = i; selIdx = i; pts[i].classList.add("sel");
      guide.setAttribute("x1", xs(yrs[i])); guide.setAttribute("x2", xs(yrs[i])); guide.setAttribute("visibility", "visible");
      readout.textContent = `${fx(yrs[i])}: ${o.pointWord || "value"} ${signed(y[i], 3)} ${o.units}.` + (o.band ? ` Band ${signed(o.band.lo[i])} to ${signed(o.band.hi[i])}.` : "") + o.lines.map(l => ` ${l.label} ${signed(l.y[i], 3)}.`).join("");
    };
    const near = ev => { const b = svg.getBoundingClientRect(); const x = (ev.clientX - b.left) / b.width * W; let best = 0, bd = 1e9; yrs.forEach((v, i) => { const d = Math.abs(xs(v) - x); if (d < bd) { bd = d; best = i; } }); pickFn(best); };
    svg.addEventListener("pointermove", near); svg.addEventListener("pointerdown", near);
    if (selIdx >= 0 && selIdx < n) pickFn(selIdx);
    return svg;
  };
  const box = responsive(build);
  const wrap = h("div", { class: "mapfocus", tabindex: "0", role: "group", "aria-label": o.describe + " Left and right arrow keys read each point." }, box);
  wrap.addEventListener("keydown", ev => {
    const big = ev.shiftKey ? 12 : 1;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") { ev.preventDefault(); pickFn(selIdx < 0 ? (ev.key === "ArrowLeft" ? n - 1 : 0) : Math.max(0, Math.min(n - 1, selIdx + (ev.key === "ArrowRight" ? big : -big)))); }
    if (ev.key === "Home") { ev.preventDefault(); pickFn(0); } if (ev.key === "End") { ev.preventDefault(); pickFn(n - 1); }
  });
  const key = h("div", { class: "chartkey", "aria-hidden": "true" }, o.keyItems.map(([c, t]) => h("span", { class: c }, t)));
  const f3 = v => fmtNum(v, 3);
  const table = h("details", { class: "disc" }, h("summary", {}, "Show the numbers as a table"),
    h("div", { class: "scroll disc-body", tabindex: "0", role: "region", "aria-label": "Chart values as a table (scrolls)" }, h("table", { class: "data" },
      h("thead", {}, h("tr", {}, ["Time", `Value (${o.units})`, ...(o.band ? ["Band low", "Band high"] : []), ...o.lines.map(l => l.label)].map(t => h("th", { scope: "col" }, t)))),
      h("tbody", {}, yrs.map((yr, i) => h("tr", {}, h("td", {}, fx(yr)), [y[i], ...(o.band ? [o.band.lo[i], o.band.hi[i]] : []), ...o.lines.map(l => l.y[i])].map(v => h("td", {}, f3(v)))))))));
  return { node: h("div", {}, wrap, readout, key, table), summary: o.describe };
}

// Home example: the same record with two selected windows, each with its own least squares line, then the full-record line.
// opts: x, y, units, windows [{a, b, label, slope, cls: "a"|"b"}], full {slope, intercept (value at x[0]), label}, describe
export function windowsChart(o) {
  const yrs = o.x, n = yrs.length, y = o.y;
  const build = W => {
    const narrow = W < 480, H = o.compact ? (narrow ? 200 : 260) : Math.round(Math.max(260, Math.min(380, W * 0.5))), m = { l: 48, r: 16, t: o.compact ? 40 : 28, b: 40 };
    const t0 = yrs.map(v => v - yrs[0]);
    const fitLine = w => {
      const idx = yrs.map((v, i) => i).filter(i => yrs[i] >= w.a && yrs[i] <= w.b);
      const my = idx.reduce((s_, i) => s_ + y[i], 0) / idx.length, mt = idx.reduce((s_, i) => s_ + t0[i], 0) / idx.length, b = w.slope / 10, a = my - b * mt;
      return { x1: w.a, x2: w.b, y1: a + b * (w.a - yrs[0]), y2: a + b * (w.b - yrs[0]) };
    };
    const fl = o.windows.map(fitLine), fullY = v => o.full.intercept + o.full.slope / 10 * (v - yrs[0]);
    const all = [...y, ...fl.flatMap(f => [f.y1, f.y2]), fullY(yrs[0]), fullY(yrs[n - 1])];
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const xs = v => m.l + (v - yrs[0]) / (yrs[n - 1] - yrs[0]) * (W - m.l - m.r), ys = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.describe });
    const { ticks } = niceTicks(lo, hi, 5);
    for (const t of ticks) svg.append(s("line", { class: "grid", x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t) }), s("text", { x: m.l - 8, y: ys(t) + 4, "text-anchor": "end" }, ticksText(t)));
    const firstOk = xs(Math.ceil((yrs[0] + 1) / 10) * 10 - 5 > yrs[0] ? Math.ceil((yrs[0] + 1) / 10) * 10 - 5 : yrs[0] + 10) - xs(yrs[0]) >= 44;
    for (const yr of yrs) if (yr % 10 === 5 || (yr === yrs[0] && firstOk) || yr === yrs[n - 1]) svg.append(s("text", { x: xs(yr), y: H - m.b + 20, "text-anchor": "middle" }, String(yr)), s("line", { class: "axis", x1: xs(yr), x2: xs(yr), y1: H - m.b, y2: H - m.b + 4 }));
    svg.append(s("line", { class: "axis", x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }));
    if (lo < 0 && hi > 0) svg.append(s("line", { class: "zero", x1: m.l, x2: W - m.r, y1: ys(0), y2: ys(0) }));
    svg.append(s("text", { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, "text-anchor": "middle" }, `Anomaly (${o.units})`));
    o.windows.forEach(w => svg.append(s("rect", { class: "win-" + w.cls, x: xs(w.a), y: m.t, width: xs(w.b) - xs(w.a), height: H - m.t - m.b })));
    svg.append(s("polyline", { class: "ser", points: yrs.map((v, i) => `${xs(v).toFixed(1)},${ys(y[i]).toFixed(1)}`).join(" ") }));
    svg.append(s("line", { class: "full-line", x1: xs(yrs[0]), x2: xs(yrs[n - 1]), y1: ys(fullY(yrs[0])), y2: ys(fullY(yrs[n - 1])) }));
    fl.forEach((f, i) => svg.append(s("line", { class: "win-line-" + o.windows[i].cls, x1: xs(f.x1), x2: xs(f.x2), y1: ys(f.y1), y2: ys(f.y2) })));
    for (let i = 0; i < n; i++) svg.append(s("circle", { class: "pt", cx: xs(yrs[i]), cy: ys(y[i]), r: narrow ? 3 : 3.4 }));
    const cx = o.windows.map(w => (xs(w.a) + xs(w.b)) / 2), stagger = o.compact && cx.length > 1 && Math.abs(cx[0] - cx[1]) < 120;
    o.windows.forEach((w, i) => svg.append(s("text", { class: "lbl-" + w.cls, x: cx[i], y: m.t - 10 - (stagger && i === 1 ? 16 : 0), "text-anchor": "middle" }, w.label)));
    return svg;
  };
  const key = h("div", { class: "chartkey", "aria-hidden": "true" }, [["k-pt", "Yearly regional anomaly"], ["k-ols", o.full.label]].map(([c, t]) => h("span", { class: c }, t)));
  // activeWindow ("a", "b" or none) emphasises one selected window and dims the other; the full record always stays visible. setActive() changes it at once.
  const node = h("div", { class: "wchart" }, responsive(build), key);
  node.setActive = cls => { if (cls) node.dataset.active = cls; else delete node.dataset.active; };
  node.setActive(o.activeWindow);
  return node;
}
