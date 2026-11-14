"""Pipeline: claim folder -> out/<claim>/bundle.json.

Claim folder layout (written by the data worker):
  <claim_dir>/claim.json   claim metadata (see SCHEMA.md "claim.json")
  <claim_dir>/monthly.npz  values (T, ny, nx) float, NaN = missing; lat (ny,), lon (nx,);
                           year (T,), month (T,) int; optional support (ny, nx) bool
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import platform
import sys
import time
from pathlib import Path

import numpy as np
import scipy

from . import __version__
from .aggregate import (build_cube, cell_season_series, climatology, cos_weights, regional_monthly,
                        season_mean)
from .bootstrap import residual_block_bootstrap
from .trend import benjamini_hochberg, mk_core, ols, sen_ci_analytic
from . import verdict as V

SCHEMA_VERSION = "1.0"
MONTH_ABBR = "JFMAMJJASOND"

DEFAULT_PARAMS = dict(
    alpha=0.05, bh_q=0.10, cov_threshold=0.80, min_season_month_frac=2 / 3, min_clim_frac=0.6,
    min_valid_years_frac=0.8, min_valid_years_abs=10,
    boot_reps=2000, boot_block_len=3, boot_level=0.95, seed=20261114,
    sens_cov_thresholds=(0.7, 0.8, 0.9), sens_block_lens=(1, 3, 5),
    breadth_min=V.BREADTH_MIN, local_min=V.LOCAL_MIN,
)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clean(o, sig=6):
    """Make JSON safe: numpy -> python, NaN/inf -> None, floats to sig significant digits."""
    if isinstance(o, dict):
        return {str(k): clean(v, sig) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v, sig) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist(), sig)
    if isinstance(o, (np.bool_, bool)):
        return bool(o)
    if isinstance(o, (np.integer, int)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        x = float(o)
        if not math.isfinite(x):
            return None
        return float(f"{x:.{sig}g}")
    return o


def season_label(months):
    months = sorted(months)
    if months == list(range(1, 13)):
        return "annual mean"
    if months == [6, 7, 8]:
        return "summer (June to August)"
    if months == [6, 7, 8, 9]:
        return "wet season (June to September)"
    return "months " + "".join(MONTH_ABBR[m - 1] for m in months)


def _sign(direction):
    return 1.0 if direction == "increase" else -1.0


def regional_analysis(cube, clim, weights, support, lat, years, months, params, cov_threshold=None,
                      block_len=None, with_band=True, reps=None):
    """Regional anomaly series, tests, bootstrap. Returns dict (arrays inside)."""
    cov_threshold = params["cov_threshold"] if cov_threshold is None else cov_threshold
    block_len = params["boot_block_len"] if block_len is None else block_len
    reps = params["boot_reps"] if reps is None else reps
    anom = cube - clim[None]
    denom = support[None, :, :] & np.isfinite(clim)  # (M, ny, nx)
    reg_m, frac, farea = regional_monthly(anom, weights, denom, cov_threshold)
    series, nvm = season_mean(reg_m, params["min_season_month_frac"])
    t = np.asarray(years, float)
    mk = mk_core(series[None, :], t, hr=True)
    mk0 = mk_core(series[None, :], t, hr=False)
    n = int(np.isfinite(series).sum())
    out = dict(series=series, nvm=nvm, frac=frac, farea=farea, reg_m=reg_m, t=t, n=n, mk=mk, mk0=mk0)
    if n >= 5:
        out["ols"] = ols(series, t)
        out["boot"] = residual_block_bootstrap(series, t, grid_t=t if with_band else None,
                                               block_len=block_len, reps=reps,
                                               level=params["boot_level"], seed=params["seed"])
        out["sen_ci_hr"] = sen_ci_analytic(series, t, float(mk["var_s"][0]))
    return out


def run_claim(claim_dir, out_dir=None, params=None, validation_path=None, quiet=False):
    t0 = time.time()
    claim_dir = Path(claim_dir)
    P = dict(DEFAULT_PARAMS)
    if params:
        P.update(params)
    cj = claim_dir / "claim.json"
    nz = claim_dir / "monthly.npz"
    claim = json.loads(cj.read_text(encoding="utf-8"))
    z = np.load(nz)
    values = z["values"].astype(np.float64)
    lat = z["lat"].astype(float)
    lon = z["lon"].astype(float)
    year, month = z["year"], z["month"]
    ny, nx = len(lat), len(lon)
    support = z["support"].astype(bool) if "support" in z.files else np.ones((ny, nx), bool)

    months = sorted(claim["season_months"])
    y0, y1 = claim["period"]
    years = list(range(int(y0), int(y1) + 1))
    direction = claim["direction"]
    sgn = _sign(direction)
    cube = build_cube(values, year, month, years, months)
    clim = climatology(cube, P["min_clim_frac"])
    weights = cos_weights(lat, nx)

    # ---------- regional ----------
    R = regional_analysis(cube, clim, weights, support, lat, years, months, P)
    series, t = R["series"], R["t"]
    mk, mk0 = R["mk"], R["mk0"]
    mk1 = lambda d, k: float(d[k][0])
    n_valid_years = R["n"]
    dec = 10.0

    # baseline: area-weighted mean of the cell seasonal climatology (for absolute display)
    cl_season = np.nanmean(clim, axis=0)
    okc = support & np.isfinite(cl_season)
    baseline = float((weights[okc] * cl_season[okc]).sum() / weights[okc].sum()) if okc.any() else None

    # ---------- coverage ----------
    frac = R["frac"]
    monthly_cov = [{"year": years[iy], "month": months[im], "valid_cell_frac": frac[iy, im],
                    "area_weighted_frac": R["farea"][iy, im], "region_month_valid": bool(np.isfinite(R["reg_m"][iy, im]))}
                   for iy in range(len(years)) for im in range(len(months))]
    denom = support[None] & np.isfinite(clim)
    n_support = int(denom.any(axis=0).sum())
    years_dropped = [years[i] for i in range(len(years)) if not np.isfinite(series[i])]
    coverage = dict(
        n_cells_grid=int(ny * nx), n_support_cells=int(support.sum()), n_cells_with_climatology=n_support,
        cov_threshold=P["cov_threshold"], months_total=int(len(years) * len(months)),
        months_dropped=int(sum(1 for m in monthly_cov if not m["region_month_valid"])),
        years_total=len(years), years_valid=n_valid_years, years_dropped=years_dropped,
        mean_valid_cell_frac=float(frac.mean()), min_valid_cell_frac=float(frac.min()),
        monthly=monthly_cov,
    )

    # ---------- regional tests ----------
    reg = {"years": years, "anomaly": series, "valid_months": R["nvm"], "units": claim.get("units"),
           "season_months": months, "baseline_mean": baseline,
           "weights": "cos(latitude) area weights on cell anomalies"}
    tests = {}
    if n_valid_years >= 5:
        b = R["boot"]
        ols_r = R["ols"]
        tests = {
            "mk_hr": dict(n=int(mk1(mk, "n")), s=mk1(mk, "s"), tau=mk1(mk, "tau"), var_s_independent=mk1(mk, "var0"),
                          hr_factor_raw=mk1(mk, "n_ns_raw"), hr_factor=mk1(mk, "n_ns"), var_s=mk1(mk, "var_s"),
                          z=mk1(mk, "z"), p=mk1(mk, "p"),
                          significant=bool(mk1(mk, "p") < P["alpha"]), alpha=P["alpha"]),
            "mk_independent": dict(z=mk1(mk0, "z"), p=mk1(mk0, "p"), significant=bool(mk1(mk0, "p") < P["alpha"])),
            "sen": dict(slope_per_decade=mk1(mk, "slope") * dec, intercept=mk1(mk, "intercept"),
                        ci_bootstrap_per_decade=[b["slope_ci"][0] * dec, b["slope_ci"][1] * dec],
                        ci_analytic_hr_per_decade=[R["sen_ci_hr"][0] * dec, R["sen_ci_hr"][1] * dec],
                        interval_method="residual moving-block bootstrap around the Sen line, percentile 95%"),
            "ols": dict(slope_per_decade=ols_r["slope"] * dec, se_per_decade=ols_r["se"] * dec,
                        t=ols_r["t"], df=ols_r["df"], p=ols_r["p"],
                        ci_per_decade=[ols_r["ci_low"] * dec, ols_r["ci_high"] * dec], n=ols_r["n"],
                        note="familiar baseline (least squares, t-test); context, not the verdict"),
        }
        band = dict(years=years, center=b["band_center"], lo=b["band_lo"], hi=b["band_hi"], level=P["boot_level"],
                    meaning=("pointwise 95% band for the Sen trend line (not for individual years), from the same "
                             "residual block bootstrap as the slope interval"),
                    reps=b["reps"], block_len=b["block_len"], n=b["n"])
        sen_line_centre = b["band_center"]
    else:
        band = None
        sen_line_centre = None
    reg["sen_line"] = sen_line_centre
    reg["tests"] = tests
    reg["band"] = band

    # ---------- sensitivity ----------
    sens = {"coverage": [], "block_len": []}
    if n_valid_years >= 5:
        for ct in P["sens_cov_thresholds"]:
            Rs = regional_analysis(cube, clim, weights, support, lat, years, months, P, cov_threshold=ct,
                                   with_band=False, reps=min(500, P["boot_reps"]))
            if Rs["n"] >= 5:
                p_ = float(Rs["mk"]["p"][0]); s_ = float(Rs["mk"]["slope"][0]) * dec
                sens["coverage"].append(dict(cov_threshold=ct, years_valid=Rs["n"], p=p_, slope_per_decade=s_,
                                             significant_in_direction=bool(p_ < P["alpha"] and s_ * sgn > 0)))
            else:
                sens["coverage"].append(dict(cov_threshold=ct, years_valid=Rs["n"], p=None, slope_per_decade=None,
                                             significant_in_direction=False))
        for bl in P["sens_block_lens"]:
            rb = residual_block_bootstrap(series, t, None, block_len=bl, reps=P["boot_reps"],
                                          level=P["boot_level"], seed=P["seed"])
            lo, hi = rb["slope_ci"][0] * dec, rb["slope_ci"][1] * dec
            sens["block_len"].append(dict(block_len=bl, ci_per_decade=[lo, hi], excludes_zero_in_direction=bool(lo * sgn > 0 and hi * sgn > 0)))
        sig_flags = [c["significant_in_direction"] for c in sens["coverage"]]
        ci_flags = [c["excludes_zero_in_direction"] for c in sens["block_len"]]
        sens["stable"] = bool(len(set(sig_flags)) == 1 and len(set(ci_flags)) == 1)
    else:
        sens["stable"] = None
    sens["definition"] = ("stable = regional significance-in-direction status identical across coverage thresholds "
                          "0.7/0.8/0.9 and interval-excludes-zero status identical across block lengths 1/3/5; "
                          "this is a sensitivity check, not independent validation")

    # ---------- cells (ladder) ----------
    raw, an = cell_season_series(cube, clim, P["min_season_month_frac"])  # (Y, ny, nx)
    Xraw = raw.reshape(len(years), -1).T
    Xan = an.reshape(len(years), -1).T
    nvy = np.isfinite(Xan).sum(axis=1)
    min_years = max(P["min_valid_years_abs"], math.ceil(P["min_valid_years_frac"] * len(years)))
    cell_ok = support.reshape(-1) & (nvy >= min_years)
    idx = np.where(cell_ok)[0]
    m1 = mk_core(Xraw[idx], t, hr=False)
    m2 = mk_core(Xan[idx], t, hr=False)
    m3 = mk_core(Xan[idx], t, hr=True)
    ncell = ny * nx

    def full(v):
        a = np.full(ncell, np.nan)
        a[idx] = v
        return a

    p1, p2, p3 = full(m1["p"]), full(m2["p"]), full(m3["p"])
    s_raw, s_an = full(m1["slope"]) * dec, full(m3["slope"]) * dec
    rej4, adj4 = benjamini_hochberg(p3, P["bh_q"])
    flags = {1: p1 < P["alpha"], 2: p2 < P["alpha"], 3: p3 < P["alpha"], 4: rej4}
    slopes_for = {1: s_raw, 2: s_an, 3: s_an, 4: s_an}
    w = weights.reshape(-1)
    wv = w[cell_ok].sum()
    names = {1: ("Raw Mann-Kendall", "raw seasonal means, assuming independent years"),
             2: ("Seasonal anomalies", "anomalies against each cell's own same-month climatology"),
             3: ("Autocorrelation correction", "Hamed-Rao variance correction"),
             4: ("False-discovery control", f"Benjamini-Hochberg at q = {P['bh_q']}, declared before results")}
    rungs = []
    prev = None
    for r in (1, 2, 3, 4):
        f = flags[r] & cell_ok
        fd = f & (slopes_for[r] * sgn > 0)
        rungs.append(dict(
            rung=r, name=names[r][0], what_changes=names[r][1],
            flagged_cells=int(f.sum()), flagged_area_frac=float(w[f].sum() / wv) if wv else None,
            flagged_in_direction_cells=int(fd.sum()),
            flagged_in_direction_area_frac=float(w[fd].sum() / wv) if wv else None,
            cells_changed_vs_previous=None if prev is None else int((f != prev).sum()),
        ))
        prev = f
    rung2_p_changed = int(np.sum(np.isfinite(p1) & (np.abs(p1 - p2) > 1e-12)))
    hr_factor = full(m3["n_ns"])
    cells = dict(
        grid=dict(ny=ny, nx=nx, lat=lat, lon=lon, order="row-major: index = iy * nx + ix"),
        n_valid_cells=int(cell_ok.sum()), n_excluded_cells=int(support.sum() - cell_ok.sum()),
        min_valid_years=int(min_years),
        fields=dict(
            valid=cell_ok.astype(int),
            slope_raw_per_decade=s_raw, slope_per_decade=s_an,
            p_rung1=p1, p_rung2=p2, p_rung3=p3, bh_adjusted_p=adj4, hr_factor=hr_factor,
            flag_rung1=(flags[1] & cell_ok).astype(int), flag_rung2=(flags[2] & cell_ok).astype(int),
            flag_rung3=(flags[3] & cell_ok).astype(int), flag_rung4=(flags[4] & cell_ok).astype(int),
        ),
        rungs=rungs, rung2_cells_with_changed_p=rung2_p_changed,
        rung2_note=("With complete months, anomalies only shift each cell's series by a constant, which "
                    "Mann-Kendall and Sen ignore; rung 2 changes a cell only where months are missing."),
        flagged_in_direction_def="flag at the rung AND the cell's Sen slope has the claimed sign",
        area_weights="cos(latitude); fractions are of valid cells' weight; descriptive, never an error rate",
    )

    # ---------- validation gate ----------
    validation = {"status": "not_run", "gate": {"regional_verdict_enabled": False, "interval_enabled": False,
                                               "cells_enabled": False, "reasons": ["validation results not attached"]}}
    if validation_path and Path(validation_path).exists():
        from .validation import gate_for_claim
        vres = json.loads(Path(validation_path).read_text(encoding="utf-8"))
        phi_hat = _lag1(series)
        validation = gate_for_claim(vres, n_years=len(years), phi_hat=phi_hat,
                                    has_gaps=bool(years_dropped), q=P["bh_q"])
        validation["claim_phi_hat"] = phi_hat
        validation["source_sha256"] = sha256_file(validation_path)

    # ---------- verdict ----------
    reasons = list(validation["gate"].get("reasons_blocking_verdict", [])) if validation["status"] != "not_run" else \
        ["validation results not attached"]
    if n_valid_years < max(10, math.ceil(0.6 * len(years))):
        reasons.append(f"only {n_valid_years} of {len(years)} seasons have enough coverage (G-Cov)")
    gate = validation["gate"]
    sen = tests.get("sen", {})
    hr = tests.get("mk_hr", {})
    inp = dict(
        withheld_reasons=reasons, p=hr.get("p"), slope=sen.get("slope_per_decade"),
        ci=tuple(sen["ci_bootstrap_per_decade"]) if sen and gate.get("interval_enabled") else None,
        direction=direction, interval_enabled=bool(gate.get("interval_enabled")),
        breadth_in_dir=rungs[3]["flagged_in_direction_area_frac"],
        breadth_available=bool(gate.get("cells_enabled")) and cells["n_valid_cells"] > 0,
    )
    vclaim = dict(region_name=claim.get("region_name", "the region"), season_label=season_label(months),
                  period_label=f"{y0} to {y1}", variable=claim.get("variable_plain", claim.get("variable", "value")),
                  units=claim.get("units", ""), direction=direction)
    if inp["ci"] is None and sen:
        # interval disabled or unavailable: show the analytic Hamed-Rao interval only if the gate allows none
        inp["ci"] = None
    vid, branch, trace = V.decide(inp)
    if branch == "withheld" or tests:
        slots = V.build_slots(vclaim, inp if inp["slope"] is not None else {**inp, "slope": None, "ci": None, "p": None})
        text = V.render(branch, slots)
    else:
        text = V.render("withheld", V.build_slots(vclaim, {**inp, "withheld_reasons": reasons}))
    verdict = dict(id=vid, branch=branch, text=text, precedence_trace=trace,
                   withheld_reasons=reasons if branch == "withheld" else [],
                   inputs=dict(p=inp["p"], slope_per_decade=inp["slope"], direction=direction,
                               interval_used=inp["ci"], breadth_in_direction_area_frac=inp["breadth_in_dir"],
                               breadth_available=inp["breadth_available"], breadth_min=P["breadth_min"],
                               local_min=P["local_min"]),
                   branches=["withheld", "contradicted", "supported", "partly_supported", "not_supported"])

    # ---------- run identity ----------
    h_claim, h_npz = sha256_file(cj), sha256_file(nz)
    canon = json.dumps(dict(code=__version__, claim=h_claim, data=h_npz,
                            params={k: (list(v) if isinstance(v, tuple) else v) for k, v in P.items()},
                            validation=validation.get("source_sha256")), sort_keys=True)
    run_id = "run-" + hashlib.sha256(canon.encode()).hexdigest()[:12]
    bundle = dict(
        schema_version=SCHEMA_VERSION,
        run=dict(run_id=run_id, generated_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                 code_version=__version__, seed=P["seed"], elapsed_seconds=round(time.time() - t0, 2),
                 input_sha256=dict(claim_json=h_claim, monthly_npz=h_npz),
                 software=dict(python=platform.python_version(), numpy=np.__version__, scipy=scipy.__version__)),
        claim=claim, params={k: (list(v) if isinstance(v, tuple) else v) for k, v in P.items()},
        coverage=coverage, regional=reg, sensitivity=sens, cells=cells, validation=validation, verdict=verdict,
        method_notes=METHOD_NOTES,
    )
    out_dir = Path(out_dir) if out_dir else Path("out") / claim["claim_id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    # cell arrays use 5 significant digits to keep the bundle small
    cells_c = clean(bundle.pop("cells"), 5)
    b = clean(bundle, 6)
    b["cells"] = cells_c
    path = out_dir / "bundle.json"
    path.write_text(json.dumps(b, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    if not quiet:
        print(f"wrote {path} ({path.stat().st_size / 1e6:.2f} MB) run_id={run_id} elapsed={time.time() - t0:.1f}s")
    return b


def _lag1(x):
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    if len(x) < 5:
        return 0.0
    # detrend by OLS first so a trend does not masquerade as persistence
    tt = np.arange(len(x))
    r = x - np.polyval(np.polyfit(tt, x, 1), tt)
    r = r - r.mean()
    d = (r * r).sum()
    return float((r[:-1] * r[1:]).sum() / d) if d > 0 else 0.0


METHOD_NOTES = [
    "Python is the source of truth; the browser replays these numbers.",
    "Anomalies are computed per cell against its own per-calendar-month climatology over the claim period before any averaging.",
    "Regional series: cos(latitude) weighted mean of anomalies; a region-month needs the coverage threshold of valid cells; a season needs at least two thirds of its months.",
    "Mann-Kendall S and tie-corrected Var(S); Hamed-Rao (1998) correction from Sen-detrended rank autocorrelations with significance-screened lags, factor floored at 1. The correction is less reliable for short series.",
    "Missing years: Mann-Kendall and Sen use valid years only (Sen uses calendar-year differences); Hamed-Rao counts lags in valid-observation order, which treats observations after a gap as adjacent (approximation).",
    "Slope interval and chart band: residual moving-block bootstrap around the Sen line; same draws for both; raw trending values are never resampled.",
    "Benjamini-Hochberg controls the expected share of false discoveries among flagged cells under independence or positive dependence (Benjamini and Yekutieli 2001); spatial correlation alone does not establish that; the rate was measured on correlated synthetic fields. It does not control the share of area that is wrong and does not validate any single hotspot. Flagged-area fractions are descriptive.",
    "Field significance is out of scope. Hotspot-mean intervals, if shown, are pointwise and not adjusted for selection.",
    "Synthetic calibration does not establish that BH is valid for every real field.",
]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("claim_dir")
    ap.add_argument("--out", default=None)
    ap.add_argument("--validation", default=None)
    ap.add_argument("--reps", type=int, default=None)
    a = ap.parse_args(argv)
    params = {}
    if a.reps:
        params["boot_reps"] = a.reps
    run_claim(a.claim_dir, a.out, params, a.validation)


if __name__ == "__main__":
    main()
