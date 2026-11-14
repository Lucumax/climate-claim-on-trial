"""Trend statistics, batched over many series.

All functions take X with shape (C, N): C series, N time slots, NaN = missing, and
T with shape (N,): the calendar time (years) of each slot.  Missing values are
handled by compacting each series to its valid observations (order kept):

* MK S and Var(S) use only valid observations (ties corrected).
* Sen slopes use the real calendar time difference between the two observations.
* Hamed-Rao: the Sen-detrended residuals are ranked over valid observations and the
  rank autocorrelation lags are counted in valid-observation order (as pymannkendall
  does when it skips NaNs).  After a gap, observations are treated as adjacent for
  the autocorrelation.  This is an approximation and is stated as such in the bundle.
* Hamed-Rao factor is floored at 1 (pymannkendall does not floor it; tests compare
  the unfloored factor and the floor separately).
"""
from __future__ import annotations

import numpy as np
from scipy import stats
from scipy.stats import rankdata

Z975 = float(stats.norm.ppf(0.975))


def _compact(X, T):
    """Move valid values to the left. Returns Xc, Tc, n (valid count), valid mask."""
    X = np.asarray(X, dtype=float)
    C, N = X.shape
    bad = np.isnan(X)
    order = np.argsort(bad, axis=1, kind="stable")
    Xc = np.take_along_axis(X, order, axis=1)
    Tc = np.asarray(T, dtype=float)[order]
    n = (~bad).sum(axis=1)
    valid = np.arange(N)[None, :] < n[:, None]
    return Xc, Tc, n, valid


def _median_sorted_masked(vals, m):
    """Median of the first m entries of each (already NaN-last sorted) row."""
    C = vals.shape[0]
    out = np.full(C, np.nan)
    ok = m > 0
    lo = np.where(ok, (m - 1) // 2, 0)
    hi = np.where(ok, m // 2, 0)
    r = np.arange(C)
    out[ok] = 0.5 * (vals[r, lo][ok] + vals[r, hi][ok])
    return out


_KEYS = ("n", "s", "var0", "n_ns_raw", "n_ns", "var_s", "z", "p", "slope", "intercept", "tau")


def mk_core(X, T, hr=True, min_n=3, chunk=1000):
    """Mann-Kendall (+ optional Hamed-Rao) for each row of X.

    Returns dict of arrays: n, s, var0, n_ns_raw, n_ns, var_s, z, p, slope, intercept, tau.
    p is two-sided normal with continuity correction.  If hr is False, var_s == var0
    and n_ns == 1.  Rows with fewer than min_n valid values return NaN (n is kept).
    """
    X = np.asarray(X, dtype=float)
    if X.ndim == 1:
        X = X[None, :]
    C, N = X.shape
    outs = {k: np.full(C, np.nan) for k in _KEYS}
    iu0, iu1 = np.triu_indices(N, 1)
    for a in range(0, C, chunk):
        b = min(C, a + chunk)
        Xc, Tc, n, valid = _compact(X[a:b], T)
        nf = n.astype(float)
        vp = valid[:, iu0] & valid[:, iu1]
        dx = Xc[:, iu1] - Xc[:, iu0]
        dt = Tc[:, iu1] - Tc[:, iu0]
        S = np.where(vp, np.sign(dx), 0.0).sum(axis=1)
        # ties in x (over valid obs): sum over tie groups of t(t-1)(2t+5)
        eq = (Xc[:, :, None] == Xc[:, None, :]) & valid[:, None, :] & valid[:, :, None]
        t_i = eq.sum(axis=2).astype(float)
        tie_term = np.where(valid, (t_i - 1) * (2 * t_i + 5), 0.0).sum(axis=1)  # each of t members adds (t-1)(2t+5)
        var0 = (nf * (nf - 1) * (2 * nf + 5) - tie_term) / 18.0
        # Sen slope
        with np.errstate(divide="ignore", invalid="ignore"):
            sl = np.where(vp, dx / np.where(dt != 0, dt, np.nan), np.nan)
        sl.sort(axis=1)
        m = (~np.isnan(sl)).sum(axis=1)
        slope = _median_sorted_masked(sl, m)
        resid = np.where(valid, Xc - slope[:, None] * Tc, np.nan)
        # Kendall-Theil intercept as in pymannkendall: median(x) - slope * median(t)
        med_x = _median_sorted_masked(np.sort(np.where(valid, Xc, np.nan), axis=1), n)
        med_t = _median_sorted_masked(np.sort(np.where(valid, Tc, np.nan), axis=1), n)
        intercept = med_x - slope * med_t
        n_ns_raw = np.ones(b - a)
        if hr:
            # The median-slope pair has a residual tie in exact arithmetic when the pair count is odd;
            # float rounding must not decide it, so residuals are rounded to 1e-9 of the series scale.
            scale = np.nanmax(np.abs(np.where(valid, Xc, np.nan)), axis=1)
            scale = np.where(np.isfinite(scale) & (scale > 0), scale, 1.0)
            rr = np.round(resid / scale[:, None], 9)
            I = rankdata(np.where(valid, rr, np.inf), axis=1, method="average")
            mean = np.where(n > 0, np.where(valid, I, 0.0).sum(axis=1) / np.where(n > 0, nf, 1), 0.0)
            y = np.where(valid, I - mean[:, None], 0.0)
            denom = (y * y).sum(axis=1)
            bound = Z975 / np.sqrt(np.where(nf > 0, nf, 1))
            sni = np.zeros(b - a)
            for k in range(1, N):
                num = (y[:, :N - k] * y[:, k:]).sum(axis=1)
                with np.errstate(divide="ignore", invalid="ignore"):
                    r_k = np.where(denom > 0, num / denom, 0.0)
                w = (nf - k) * (nf - k - 1) * (nf - k - 2)
                sig = (np.abs(r_k) > bound) & (k < nf)
                sni += np.where(sig, w * r_k, 0.0)
            with np.errstate(divide="ignore", invalid="ignore"):
                n_ns_raw = 1.0 + 2.0 / (nf * (nf - 1) * (nf - 2)) * sni
        n_ns = np.maximum(n_ns_raw, 1.0) if hr else np.ones(b - a)
        var_s = var0 * n_ns
        with np.errstate(divide="ignore", invalid="ignore"):
            sd = np.sqrt(var_s)
            z = np.where(S > 0, (S - 1) / sd, np.where(S < 0, (S + 1) / sd, 0.0))
        p = 2 * (1 - stats.norm.cdf(np.abs(z)))
        tau = S / (0.5 * nf * (nf - 1))
        bad = n < min_n
        for k, v in (("n", nf), ("s", S), ("var0", var0), ("n_ns_raw", n_ns_raw), ("n_ns", n_ns),
                     ("var_s", var_s), ("z", z), ("p", p), ("slope", slope), ("intercept", intercept),
                     ("tau", tau)):
            v = np.array(v, dtype=float)
            if k != "n":
                v[bad] = np.nan
            outs[k][a:b] = v
    return outs


def sen_slopes_all(x, t):
    """All pairwise slopes of one series (NaN removed), sorted."""
    x = np.asarray(x, float)
    t = np.asarray(t, float)
    ok = ~np.isnan(x)
    x, t = x[ok], t[ok]
    i, j = np.triu_indices(len(x), 1)
    s = (x[j] - x[i]) / (t[j] - t[i])
    return np.sort(s[np.isfinite(s)])


def sen_ci_analytic(x, t, var_s, alpha=0.05):
    """Gilbert (1987) Sen slope CI using the supplied Var(S) (use the Hamed-Rao one)."""
    d = sen_slopes_all(x, t)
    N = len(d)
    C = stats.norm.ppf(1 - alpha / 2) * np.sqrt(var_s)
    m1 = (N - C) / 2.0          # 1-indexed ranks
    m2 = (N + C) / 2.0 + 1.0

    def interp(rank):
        pos = np.clip(rank - 1.0, 0, N - 1)
        return float(np.interp(pos, np.arange(N), d))
    return interp(m1), interp(m2)


def ols(x, t, alpha=0.05):
    """OLS slope, SE, t, p, CI for one series with NaNs dropped."""
    x = np.asarray(x, float)
    t = np.asarray(t, float)
    ok = ~np.isnan(x)
    x, t = x[ok], t[ok]
    n = len(x)
    if n < 3:
        return dict(n=int(n), slope=np.nan, se=np.nan, t=np.nan, p=np.nan,
                    ci_low=np.nan, ci_high=np.nan, df=int(n) - 2)
    tm, xm = t.mean(), x.mean()
    sxx = ((t - tm) ** 2).sum()
    b = ((t - tm) * (x - xm)).sum() / sxx
    a = xm - b * tm
    res = x - a - b * t
    s2 = (res ** 2).sum() / (n - 2)
    se = np.sqrt(s2 / sxx)
    tt = b / se if se > 0 else np.inf * np.sign(b)
    p = 2 * (1 - stats.t.cdf(abs(tt), n - 2))
    q = stats.t.ppf(1 - alpha / 2, n - 2)
    return dict(n=int(n), slope=float(b), se=float(se), t=float(tt), p=float(p),
                ci_low=float(b - q * se), ci_high=float(b + q * se), df=int(n - 2))


def benjamini_hochberg(p, q=0.10):
    """BH step-up. NaN p-values are ignored. Returns (reject bool array, adjusted p array).

    Adjusted p equals scipy.stats.false_discovery_control(method='bh') on the non-NaN set.
    """
    p = np.asarray(p, float)
    out_rej = np.zeros(p.shape, bool)
    out_adj = np.full(p.shape, np.nan)
    ok = ~np.isnan(p)
    pv = p[ok]
    m = len(pv)
    if m == 0:
        return out_rej, out_adj
    order = np.argsort(pv, kind="stable")
    ps = pv[order]
    adj_sorted = np.minimum.accumulate((ps * m / np.arange(1, m + 1))[::-1])[::-1]
    adj_sorted = np.minimum(adj_sorted, 1.0)
    adj = np.empty(m)
    adj[order] = adj_sorted
    out_adj[ok] = adj
    out_rej[ok] = adj <= q
    return out_rej, out_adj
