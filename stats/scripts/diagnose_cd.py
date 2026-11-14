"""Supplementary diagnostic for C-D (STATS_LOG R3-2). Not gating; published as found.

Question: C-D has 23 seasons, an estimated lag-1 of about -0.48 and skewness 1.42. Do the tests lose their size because of the
lopsidedness (skew), because of how persistence is estimated at n = 23, or because the variance grows over the record?

At n = 23 and true phi in {-0.5, -0.3, 0}, R = 4000 trendless synthetic series per cell, with noise:
  normal            symmetric
  exponential       skewness 2 (the skewed scenario of the gate)
  gamma2            gamma shape 2, skewness 1.41 (about C-D's 1.42)
  normal_growvar    normal, but the noise standard deviation grows linearly over the record (0.5 to 1.5 times the mean level, so
                    the last years swing three times as much as the first) with unit average variance
For each: size (share called significant at 5 percent) of raw Mann-Kendall (independent years) and Yue-Wang, with SE; and the
distribution of the estimated detrended lag-1 phi_hat and of the series skewness (mean, sd, share with |skew| > 0.8).

usage (from stats/):  python scripts/diagnose_cd.py [--out out/validation/r3_cd_diagnostic.json]
"""
import argparse
import datetime as dt
import json
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from trendtrial.trend import mk_core                       # noqa: E402
from trendtrial.validation_r2 import lag1_batch            # noqa: E402

N, R, SEED = 23, 4000, 20260514
PHIS = (-0.5, -0.3, 0.0)


def innovations(kind, R, total, rng):
    if kind in ("normal", "normal_growvar"):
        return rng.standard_normal((R, total))
    if kind == "exponential":
        return rng.exponential(1.0, (R, total)) - 1.0
    if kind == "gamma2":
        return (rng.gamma(2.0, 1.0, (R, total)) - 2.0) / np.sqrt(2.0)
    raise ValueError(kind)


def series(kind, phi, rng, burn=30):
    total = N + burn
    e = innovations(kind, R, total, rng)
    x = np.empty((R, total))
    x[:, 0] = e[:, 0]
    s = np.sqrt(1 - phi ** 2)
    for k in range(1, total):
        x[:, k] = phi * x[:, k - 1] + s * e[:, k]
    x = x[:, burn:]
    if kind == "normal_growvar":
        sd = np.linspace(0.5, 1.5, N)
        x = x * (sd / np.sqrt((sd ** 2).mean()))[None, :]
    return x


def prop(k, n):
    p = k / n
    return dict(value=float(p), se=float(np.sqrt(max(p * (1 - p), 1e-12) / n)), R=int(n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "out/validation/r3_cd_diagnostic.json"))
    a = ap.parse_args()
    t = np.arange(N, dtype=float)
    cells = {}
    for kind in ("normal", "exponential", "gamma2", "normal_growvar"):
        for j, phi in enumerate(PHIS):
            rng = np.random.default_rng(SEED + 10 * ("normal exponential gamma2 normal_growvar".split().index(kind)) + j)
            X = series(kind, phi, rng)
            row = {}
            for name, corr in (("mk_independent", "none"), ("yue_wang", "yw")):
                p = mk_core(X, t, corr=corr)["p"]
                row[name] = prop(int((p < 0.05).sum()), int(np.isfinite(p).sum()))
            ph, sk = lag1_batch(X), stats.skew(X, axis=1)
            row["phi_hat"] = dict(mean=float(ph.mean()), sd=float(ph.std()), p10=float(np.quantile(ph, 0.1)), p90=float(np.quantile(ph, 0.9)))
            row["skew"] = dict(mean=float(sk.mean()), sd=float(sk.std()), share_abs_gt_0_8=float((np.abs(sk) > 0.8).mean()),
                               share_gt_1_4=float((sk > 1.4).mean()))
            cells[f"{kind}|phi{phi}"] = row
            print(f"{kind:15s} phi {phi:5.1f}: raw MK {row['mk_independent']['value']:.3f}  Yue-Wang {row['yue_wang']['value']:.3f} (SE {row['yue_wang']['se']:.4f})"
                  f"  phi_hat {row['phi_hat']['mean']:+.2f} +/- {row['phi_hat']['sd']:.2f}  skew {row['skew']['mean']:+.2f}, share |skew|>0.8 {row['skew']['share_abs_gt_0_8']:.2f}", flush=True)
    out = dict(kind="cd_diagnostic_round3", generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"), n=N, replicates=R,
               seed=SEED, note="supplementary, not gating, published as found (STATS_LOG R3-2)", cells=cells)
    outp = Path(a.out)
    fd, tmp = tempfile.mkstemp(prefix=outp.name + ".", suffix=".tmp", dir=str(outp.parent))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(out, indent=1))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, outp)


if __name__ == "__main__":
    main()
