"""Claim C-C: NASA POWER monthly MERRA-2 T2M, 1981-2025, 60-70N 165-140W. No key needed.
Tiles the box in longitude (POWER regional limit: 10 deg range) and de-duplicates shared edge cells."""
import json, hashlib, datetime as dt, sys
from pathlib import Path
import requests, pandas as pd, numpy as np

OUT = Path(__file__).resolve().parent.parent / "C-C"
TILES = [(-165, -155), (-155, -145), (-145, -140)]
BASE = "https://power.larc.nasa.gov/api/temporal/monthly/regional"
rows, urls, hdrs = [], [], []
t0 = dt.datetime.now(dt.timezone.utc)
for lo, hi in TILES:
    p = dict(parameters="T2M", community="RE", **{"latitude-min": 60, "latitude-max": 70,
             "longitude-min": lo, "longitude-max": hi}, start=1981, end=2025, format="JSON")
    r = requests.get(BASE, params=p, timeout=300)
    r.raise_for_status()
    urls.append(r.url)
    j = r.json()
    hdrs.append(j["header"])
    for f in j["features"]:
        lon, lat, elev = f["geometry"]["coordinates"]
        for k, v in f["properties"]["parameter"]["T2M"].items():
            rows.append((lat, lon, elev, int(k[:4]), int(k[4:]), v))
df = pd.DataFrame(rows, columns=["lat", "lon", "elev_m", "year", "month", "t2m_c"])
n_raw = len(df)
df = df.drop_duplicates(["lat", "lon", "year", "month"]).sort_values(["lat", "lon", "year", "month"]).reset_index(drop=True)
fill = df["t2m_c"] == -999.0
qc = {
  "claim": "C-C", "variable": "T2M", "units": "degC (POWER header: C)", "fill_value": -999.0,
  "rows_raw": n_raw, "rows_after_dedupe": len(df), "n_fill_values": int(fill.sum()),
  "cells": int(df[["lat","lon"]].drop_duplicates().shape[0]),
  "n_lat": int(df.lat.nunique()), "n_lon": int(df.lon.nunique()),
  "lat_range": [float(df.lat.min()), float(df.lat.max())], "lon_range": [float(df.lon.min()), float(df.lon.max())],
  "lat_step": sorted(set(np.round(np.diff(np.sort(df.lat.unique())), 4)))[:5],
  "lon_step": sorted(set(np.round(np.diff(np.sort(df.lon.unique())), 4)))[:5],
  "year_range": [int(df.year.min()), int(df.year.max())],
  "months_present": sorted(int(m) for m in df.month.unique()),
  "note_month13": "POWER month code 13 = POWER's own annual mean (ANN), kept as month=13; stats worker should recompute annual mean from months 1-12 per registered method and may cross-check against 13",
  "rows_per_cell_expected": 45 * 13,
  "cells_with_expected_rows": int((df.groupby(["lat","lon"]).size() == 45*13).sum()),
  "t2m_min": float(df.loc[~fill,"t2m_c"].min()), "t2m_max": float(df.loc[~fill,"t2m_c"].max()),
  "n_nan": int(df.t2m_c.isna().sum()),
  "per_year_month_cell_counts_unique": sorted(int(x) for x in df.groupby(["year","month"]).size().unique()),
  "api_versions": sorted({h["api"]["version"] for h in hdrs}), "sources": hdrs[0]["sources"],
  "key_required": False,
}
df.loc[fill, "t2m_c"] = np.nan
df.to_parquet(OUT / "C-C_power_merra2_T2M_monthly_60-70N_165-140W_1981-2025.parquet", index=False)
df.to_csv(OUT / "C-C_power_merra2_T2M_monthly_60-70N_165-140W_1981-2025.csv.gz", index=False)
(OUT / "C-C_qc.json").write_text(json.dumps(qc, indent=2))
prov = {
  "claim": "C-C", "product": "NASA POWER Monthly and Annual API v2.10.0, source MERRA-2 (reanalysis model output, not observation)",
  "short_name": "MERRA-2 T2M via POWER", "version": hdrs[0]["api"]["version"],
  "doi": "10.5067/AP1B0BA5PD2K (CMR UMM DOI of GES_DISC M2TMNXSLV v5.12.4, the MERRA-2 monthly single-level collection POWER draws T2M from; fetched from CMR 2026-11-14; POWER response itself carries no DOI)",
  "access_route": "POWER regional REST endpoint, no key, 3 longitude tiles (10-degree range limit), lat 60-70, start=1981 end=2025",
  "request_urls": urls, "retrieved_utc": t0.isoformat(),
  "files": {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(OUT.glob("C-C_power*"))},
}
(OUT / "C-C_provenance.json").write_text(json.dumps(prov, indent=2))
print(json.dumps(qc, indent=2))
