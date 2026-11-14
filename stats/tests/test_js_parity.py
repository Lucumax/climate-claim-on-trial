"""Parity: stats/js/trendtrial.js (series level) vs the Python source of truth.

Tolerances recorded in event_record/STATS_LOG.md before the first run:
S, n exact; var_s and HR factor relative 1e-10; z and MK p absolute 1e-9; Sen slope/intercept absolute 1e-9;
Sen CI absolute 1e-9; OLS slope/SE relative 1e-9, t relative 1e-8, p absolute 1e-9, CI absolute 1e-9;
seasonal series absolute 1e-9; verdict id and text identical.
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from trendtrial import verdict as V
from trendtrial.aggregate import build_cube, cell_season_series, climatology, is_wrap
from trendtrial.trend import mk_core, ols, sen_ci_analytic

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not available")


def make_cases(seed=2026):
    rng = np.random.default_rng(seed)
    cases = []
    for i in range(240):
        n = int(rng.integers(8, 61))
        kind = i % 6
        t = 1981.0 + np.arange(n)
        if kind == 0:
            y = rng.normal(size=n)
        elif kind == 1:
            e = rng.normal(size=n)
            y = np.empty(n)
            y[0] = e[0]
            for k in range(1, n):
                y[k] = 0.5 * y[k - 1] + e[k]
        elif kind == 2:
            y = 0.05 * np.arange(n) + rng.normal(size=n)
        elif kind == 3:
            y = np.round(rng.normal(size=n) * 2) / 2 + 0.02 * np.arange(n)
        elif kind == 4:
            y = rng.lognormal(size=n) * 1000
        else:  # gaps
            y = 0.03 * np.arange(n) + rng.normal(size=n)
            y = np.where(rng.random(n) < rng.uniform(0.05, 0.25), np.nan, y)
        cases.append((t, y))
    return cases


def run_node(payload, tmp_path):
    f = tmp_path / "cases.json"
    f.write_text(json.dumps(payload))
    r = subprocess.run([NODE, str(ROOT / "js" / "parity_runner.mjs"), str(f)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def clean(a):
    return [None if not np.isfinite(v) else float(v) for v in a]


def close(a, b, rel=0.0, abs_=0.0):
    if a is None or b is None or (isinstance(a, float) and np.isnan(a)):
        return (a is None or (isinstance(a, float) and np.isnan(a))) and (b is None or (isinstance(b, float) and np.isnan(b)))
    return abs(a - b) <= abs_ + rel * max(abs(a), abs(b))


@pytest.fixture(scope="module")
def js_results(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("parity")
    series = make_cases()
    # seasonal cases: monthly rows with random gaps
    rng = np.random.default_rng(99)
    seasonal = []
    for k in range(40):
        months = [[6, 7, 8], [6, 7, 8, 9], list(range(1, 13)), [12, 1, 2], [11, 12, 1, 2, 3]][k % 5]
        y0, y1 = 2001, int(rng.integers(2015, 2026))
        rows = []
        first = y0 - 1 if is_wrap(months) and k % 2 == 0 else y0   # half the wrap sets include the previous December
        for y in range(first, y1 + 1):
            for m in months:
                if rng.random() < 0.2:
                    continue
                rows.append(dict(year=y, month=m, value=float(10 + 5 * np.sin(m) + 0.05 * (y - y0) * (m % 3) + rng.normal())))
        seasonal.append(dict(rows=rows, opts=dict(months=months, y0=y0, y1=y1)))
    verdicts = []
    for p, s, n, u in [(0.2, 0.5, 20, "K"), (0.01, 0.5, 20, "K"), (0.01, -0.5, 20, "mm"), (0.0004, 12345.6, 30, "DU"),
                       (0.049, 1e-5, 30, "AOD"), (0.5, -3e-7, 25, "AOD"), (None, None, 4, "K"), (0.3, 1.0, 5, "K"),
                       (0.0499999, 100000.0, 40, "x"), (0.0501, -0.00123, 40, "x"), (1e-12, 0.0, 40, "x"), (0.04, 7.0, 8, "K")]:
        verdicts.append(dict(p=p, slope=s, n=n, units=u))
    payload = dict(series=[dict(t=t.tolist(), y=[None if np.isnan(v) else float(v) for v in y]) for t, y in series],
                   seasonal=seasonal, verdict=verdicts)
    res = run_node(payload, tmp)
    return series, seasonal, verdicts, res


def test_series_parity(js_results):
    series, _, _, res = js_results
    n_mk = 0
    for (t, y), r in zip(series, res["series"]):
        mk = mk_core(y[None, :], t, hr=True)
        mk0 = mk_core(y[None, :], t, hr=False)
        js = r["mk"]
        assert js["n"] == int(mk["n"][0])
        assert js["s"] == mk["s"][0]
        assert close(js["varS0"], mk["var0"][0], rel=1e-10)
        assert close(js["hrFactorRaw"], mk["n_ns_raw"][0], rel=1e-10)
        assert close(js["hrFactor"], mk["n_ns"][0], rel=1e-10)
        assert close(js["varS"], mk["var_s"][0], rel=1e-10)
        assert close(js["z"], mk["z"][0], abs_=1e-9)
        assert close(js["p"], mk["p"][0], abs_=1e-9)
        assert close(r["mk0"]["p"], mk0["p"][0], abs_=1e-9)
        assert close(js["slope"], mk["slope"][0], abs_=1e-9, rel=1e-10)
        assert close(js["intercept"], mk["intercept"][0], abs_=1e-9)
        lo, hi = sen_ci_analytic(y, t, float(mk["var_s"][0]))
        assert close(r["ci"][0], lo, abs_=1e-9) and close(r["ci"][1], hi, abs_=1e-9)
        o = ols(y, t)
        jo = r["ols"]
        assert jo["n"] == o["n"]
        assert close(jo["slope"], o["slope"], rel=1e-9)
        assert close(jo["se"], o["se"], rel=1e-9)
        assert close(jo["t"], o["t"], rel=1e-8)
        assert close(jo["p"], o["p"], abs_=1e-9)
        assert close(jo["ciLow"], o["ci_low"], abs_=1e-9) and close(jo["ciHigh"], o["ci_high"], abs_=1e-9)
        n_mk += 1
    assert n_mk >= 200


def python_seasonal(c):
    months, y0, y1 = c["opts"]["months"], c["opts"]["y0"], c["opts"]["y1"]
    years = list(range(y0, y1 + 1))
    vals = np.array([r["value"] for r in c["rows"]], float)[:, None, None]
    cube = build_cube(vals, [r["year"] for r in c["rows"]], [r["month"] for r in c["rows"]], years, months)
    clim = climatology(cube, 0.6)
    raw, an = cell_season_series(cube, clim, 2 / 3)
    return years, raw[:, 0, 0], an[:, 0, 0]


def test_seasonal_parity(js_results):
    _, seasonal, _, res = js_results
    n_wrap = 0
    for c, r in zip(seasonal, res["seasonal"]):
        years, raw, an = python_seasonal(c)
        for a, b in ((raw, r["raw"]), (an, r["anomaly"])):
            for x, y in zip(a, b):
                assert close(None if np.isnan(x) else float(x), y, abs_=1e-9)
        assert r["years"] == years
        n_wrap += bool(r["wrap"])
    assert n_wrap >= 16


def test_wrap_season_semantics():
    """DJF: December comes from the previous year, the season is labelled by the Jan-Feb year, first season dropped
    when its December is missing."""
    rows = []
    for y in range(2000, 2006):
        for m in (12, 1, 2):
            rows.append(dict(year=y, month=m, value=float(100 * (y if m == 12 else y) + m)))
    # data start in Jan 2000: December 1999 absent, so season 2000 has no previous-year month and is dropped
    opts = dict(months=[12, 1, 2], y0=2000, y1=2005)
    years, raw, an = python_seasonal(dict(rows=rows, opts=opts))
    assert np.isnan(raw[0])                         # first incomplete season dropped
    # season 2001 = Dec 2000 + Jan 2001 + Feb 2001
    assert raw[1] == pytest.approx((100 * 2000 + 12 + 100 * 2001 + 1 + 100 * 2001 + 2) / 3)


def test_verdict_parity(js_results):
    _, _, verdicts, res = js_results
    for v, r in zip(verdicts, res["verdict"]):
        pid, text = V.detective_decide(v["p"], v["slope"], v["n"], v["units"])
        assert r["id"] == pid
        assert r["text"] == text, (r["text"], text)


def test_correction_options_parity(js_results):
    series, _, _, res = js_results
    names = {"hr_all": "hr_all", "yw": "yw", "tfpw": "tfpw"}
    for (t, y), r in zip(series, res["series"]):
        for k in names:
            mk = mk_core(y[None, :], t, corr=k)
            js = r["alt"][k]
            assert js["s"] is None or js["s"] == mk["s"][0] or k == "tfpw"
            assert close(js["varS"], mk["var_s"][0], rel=1e-10)
            assert close(js["z"], mk["z"][0], abs_=1e-9)
            assert close(js["p"], mk["p"][0], abs_=1e-9)
            assert js["correctionId"] == k and js["correctionName"] and js["correctionNote"]


def test_ladder_steps_export(js_results):
    _, _, _, res = js_results
    assert [s["id"] for s in res["ladder"]] == ["raw", "anomaly", "autocorr"]
    assert all(s["name"] and s["note"] for s in res["ladder"])
    assert set(res["corrections"]) == {"none", "hr", "hr_all", "yw", "tfpw"}


def test_new_corrections_properties():
    rng = np.random.default_rng(3)
    t = np.arange(30, dtype=float)
    from trendtrial.synth import ar1_series
    iid = ar1_series(300, 30, 0.0, rng)
    ar = ar1_series(300, 30, 0.6, rng)
    f_iid = np.median(mk_core(iid, t, corr="yw")["n_ns"])
    f_ar = np.median(mk_core(ar, t, corr="yw")["n_ns"])
    assert f_iid < 1.3 and f_ar > 1.5
    X = ar[:20].copy()
    X[rng.random(X.shape) < 0.1] = np.nan
    for k in ("hr_all", "yw", "tfpw"):
        big = mk_core(X, t, corr=k)
        for i in range(0, 20, 5):
            one = mk_core(X[i:i + 1], t, corr=k)
            for key in big:
                assert np.allclose(big[key][i], one[key][0], equal_nan=True)
