"""Run the NO2 pair (C-E1, C-E2) and publish the bundles (STATS_LOG "C-E1 / C-E2 PRE-RUN ENTRY").

usage (from stats/):
  python scripts/run_no2.py probe C-E1       # prints ONLY n valid years, detrended lag-1 phi_hat, skewness and the governing buckets
  python scripts/run_no2.py run C-E1 --validation out/validation/validation_results_n21.json

Unlike scripts/run_case.py this does NOT touch web/data/index.json (the web worker integrates the bundles later) and does not
read validation_results.json (the C-A to C-D table is left as it is).
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
from trendtrial.aggregate import build_cube, climatology, cos_weights, regional_monthly, season_mean  # noqa: E402
from trendtrial.pipeline import DEFAULT_PARAMS, _lag1, run_claim  # noqa: E402
from trendtrial.validation import PHIS, governing_buckets  # noqa: E402


def probe(cid):
    """The three numbers that choose the cell-scenario buckets, by the pipeline's own functions. Prints nothing else about the series."""
    P = dict(DEFAULT_PARAMS)
    claim = json.loads((REPO / "data" / cid / "claim.json").read_text(encoding="utf-8"))
    z = np.load(REPO / "data" / cid / "monthly.npz")
    values, lat, lon = z["values"].astype(float), z["lat"].astype(float), z["lon"].astype(float)
    support = z["support"].astype(bool) if "support" in z.files else np.ones((len(lat), len(lon)), bool)
    y0, y1 = claim["period"]
    years, months = list(range(int(y0), int(y1) + 1)), sorted(claim["season_months"])
    cube = build_cube(values, z["year"], z["month"], years, months)
    clim = climatology(cube, P["min_clim_frac"])
    w = cos_weights(lat, len(lon))
    denom = support[None] & np.isfinite(clim)
    reg_m, _, _ = regional_monthly(cube - clim[None], w, denom, P["cov_threshold"])
    series, _ = season_mean(reg_m, P["min_season_month_frac"])
    sv = series[np.isfinite(series)]
    phi_hat = _lag1(series)
    skew = float(stats.skew(sv)) if len(sv) > 3 and sv.std() > 0 else 0.0
    grid = [-0.7, -0.5, -0.3] + list(PHIS)
    out = dict(claim=cid, n_valid_years=int(len(sv)), n_years=len(years), phi_hat=round(float(phi_hat), 4), skewness=round(skew, 3),
               governing_buckets=governing_buckets(grid, phi_hat), cells=int(support.sum()))
    print(json.dumps(out))
    return out


def run(cid, validation):
    from trendtrial.pipeline import run_claim as rc
    b = rc(REPO / "data" / cid, ROOT / "out" / cid, validation_path=Path(validation))
    web = REPO / "web" / "data"
    shutil.copyfile(ROOT / "out" / cid / "bundle.json", web / f"bundle_{cid}.json")
    print(b["verdict"]["id"], "|", b["verdict"]["text"])
    print("gate:", json.dumps(b["validation"]["gate"])[:600])
    return b


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["probe", "run"])
    ap.add_argument("cid")
    ap.add_argument("--validation", default=str(ROOT / "out" / "validation" / "validation_results_n21.json"))
    a = ap.parse_args()
    probe(a.cid) if a.mode == "probe" else run(a.cid, a.validation)
