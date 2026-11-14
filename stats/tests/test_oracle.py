"""Oracle tests: shipped MK / Hamed-Rao / BH against pymannkendall and scipy.

Tolerances were recorded in event_record/STATS_LOG.md before this file was first run.
"""
import numpy as np
import pymannkendall as pmk
import pytest
from scipy import stats

from trendtrial.trend import benjamini_hochberg, mk_core


def make_series_set(seed=1234, count=300):
    rng = np.random.default_rng(seed)
    out = []
    for i in range(count):
        n = int(rng.integers(10, 61))
        kind = i % 5
        if kind == 0:
            x = rng.normal(size=n)
        elif kind == 1:
            e = rng.normal(size=n)
            x = np.empty(n)
            x[0] = e[0]
            for k in range(1, n):
                x[k] = 0.5 * x[k - 1] + e[k]
        elif kind == 2:
            x = 0.05 * np.arange(n) + rng.normal(size=n)
        elif kind == 3:
            x = np.round(rng.normal(size=n) * 2) / 2 + 0.02 * np.arange(n)  # ties
        else:
            x = rng.lognormal(size=n)
        out.append(x)
    return out


SERIES = make_series_set()


def test_mk_matches_pymannkendall():
    for x in SERIES:
        t = np.arange(len(x), dtype=float)
        r = mk_core(x[None, :], t, hr=False)
        o = pmk.original_test(x)
        assert r["s"][0] == o.s
        assert r["var_s"][0] == pytest.approx(o.var_s, rel=1e-12)
        assert r["z"][0] == pytest.approx(o.z, abs=1e-10)
        assert r["p"][0] == pytest.approx(o.p, abs=1e-10)
        assert r["slope"][0] == pytest.approx(o.slope, abs=1e-10)
        assert r["intercept"][0] == pytest.approx(o.intercept, abs=1e-9)


def has_near_ties(x):
    t = np.arange(len(x), dtype=float)
    slope = pmk.sens_slope(x).slope
    res = x - slope * t
    scale = np.abs(x).max() or 1.0
    return np.diff(np.sort(res)).min() < 1e-9 * scale


def test_hr_matches_pymannkendall():
    n_floored = 0
    n_skipped = 0
    for x in SERIES:
        if has_near_ties(x):
            n_skipped += 1
            continue
        t = np.arange(len(x), dtype=float)
        r = mk_core(x[None, :], t, hr=True)
        o = pmk.hamed_rao_modification_test(x)
        # unfloored factor: var0 * raw factor equals pymk's corrected variance
        assert r["var0"][0] * r["n_ns_raw"][0] == pytest.approx(o.var_s, rel=1e-9)
        pm_factor = o.var_s / pmk.original_test(x).var_s
        if pm_factor >= 1:
            assert r["z"][0] == pytest.approx(o.z, abs=1e-9)
            assert r["p"][0] == pytest.approx(o.p, abs=1e-9)
        else:
            n_floored += 1
            assert r["var_s"][0] == r["var0"][0]  # floor at 1 by design
    assert n_floored < len(SERIES) - n_skipped  # sanity: both branches exercised in the set
    assert n_floored > 0
    print(f"HR oracle: compared {len(SERIES) - n_skipped}, near-tie series skipped {n_skipped}, floored {n_floored}")


def reference_hr_tie_fixed(x):
    """pymannkendall's own HR code path (its private acf, S, Var(S) functions), with exact residual ties ranked as ties."""
    from scipy.stats import norm, rankdata
    d = pmk.pymannkendall.__dict__
    n = len(x)
    var_s = d["__variance_s"](x, n)
    slope = pmk.sens_slope(x).slope
    res = x - np.arange(1, n + 1) * slope
    scale = np.abs(x).max()
    I = rankdata(np.round(res / scale, 9))
    acf1 = d["__acf"](I, nlags=n - 1)
    bound = norm.ppf(0.975) / np.sqrt(n)
    sni = sum((n - i) * (n - i - 1) * (n - i - 2) * acf1[i] for i in range(1, n) if abs(acf1[i]) > bound)
    return var_s, var_s * (1 + 2 / (n * (n - 1) * (n - 2)) * sni)


def test_hr_near_tie_series_match_tie_fixed_reference():
    """Series skipped by the exact oracle comparison (rounding-dependent residual ties) are checked against
    pymannkendall's own code path with the ties resolved mathematically (average ranks)."""
    k = 0
    for x in SERIES:
        if not has_near_ties(x):
            continue
        k += 1
        t = np.arange(len(x), dtype=float)
        r = mk_core(x[None, :], t)
        _, ref = reference_hr_tie_fixed(x)
        assert r["var0"][0] * r["n_ns_raw"][0] == pytest.approx(ref, rel=1e-9)
    assert k > 100


def test_hr_tie_robust():
    """Shifting a series by a constant keeps all ties; the factor must not change (float rounding must not decide ties)."""
    for x in SERIES[0::5] + SERIES[1::5] + SERIES[2::5] + SERIES[4::5]:  # continuous kinds (rounded data excluded)
        if not has_near_ties(x):
            continue
        t = np.arange(len(x), dtype=float)
        a = mk_core(x[None, :], t)
        b = mk_core((x + 12345.678)[None, :], t)
        assert a["n_ns"][0] == pytest.approx(b["n_ns"][0], rel=1e-9)


def test_batch_equals_single():
    """Batched call must equal one-series-at-a-time calls (guards the compaction logic)."""
    rng = np.random.default_rng(5)
    X = rng.normal(size=(40, 25)).cumsum(axis=1) * 0.3
    X[rng.random(X.shape) < 0.1] = np.nan
    t = np.arange(25, dtype=float) + 2001
    big = mk_core(X, t)
    for i in range(X.shape[0]):
        one = mk_core(X[i:i + 1], t)
        for k in big:
            assert np.allclose(big[k][i], one[k][0], equal_nan=True)


def test_gap_series_equals_compacted_when_times_regular():
    """With NaNs dropped and regular times replaced by calendar years, S and Var(S) equal the
    compacted series; Sen slope uses calendar differences."""
    rng = np.random.default_rng(9)
    x = rng.normal(size=30)
    t = np.arange(30, dtype=float)
    keep = np.ones(30, bool)
    keep[[3, 4, 17]] = False
    xg = np.where(keep, x, np.nan)
    r = mk_core(xg[None, :], t)
    o = pmk.original_test(x[keep])
    assert r["s"][0] == o.s
    assert r["var0"][0] == pytest.approx(o.var_s, rel=1e-12)
    # Sen: calendar-time slopes median, computed independently
    xs, ts = x[keep], t[keep]
    sl = [(xs[j] - xs[i]) / (ts[j] - ts[i]) for i in range(len(xs)) for j in range(i + 1, len(xs))]
    assert r["slope"][0] == pytest.approx(np.median(sl), abs=1e-12)


@pytest.mark.parametrize("seed", range(50))
def test_bh_matches_scipy(seed):
    rng = np.random.default_rng(seed)
    m = int(rng.integers(5, 5000))
    p = np.where(rng.random(m) < 0.3, rng.random(m) ** 4, rng.random(m))
    rej, adj = benjamini_hochberg(p, 0.10)
    ref = stats.false_discovery_control(p, method="bh")
    assert np.allclose(adj, ref, atol=1e-12, rtol=0)
    assert np.array_equal(rej, ref <= 0.10)


def test_bh_ignores_nan():
    p = np.array([0.001, np.nan, 0.02, 0.5, np.nan])
    rej, adj = benjamini_hochberg(p, 0.10)
    ref = stats.false_discovery_control(p[~np.isnan(p)], method="bh")
    assert np.allclose(adj[~np.isnan(p)], ref)
    assert not rej[1] and not rej[4]
