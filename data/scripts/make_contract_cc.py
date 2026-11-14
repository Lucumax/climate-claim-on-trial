"""C-C: convert the POWER parquet into the stats input contract (claim.json + monthly.npz). Drops POWER month code 13.
No trend or summary statistic of the values is computed here."""
import json, hashlib
from pathlib import Path
import numpy as np, pandas as pd
D = Path(__file__).resolve().parent.parent / "C-C"
df = pd.read_parquet(next(D.glob("*.parquet")))
df = df[df.month.between(1, 12)]
df = df.sort_values(["year", "month", "lat", "lon"])
lat = np.sort(df.lat.unique()); lon = np.sort(df.lon.unique())
ym = df[["year", "month"]].drop_duplicates().sort_values(["year", "month"]).to_numpy()
T = len(ym)
vals = np.full((T, len(lat), len(lon)), np.nan, dtype=np.float32)
ti = {(int(y), int(m)): i for i, (y, m) in enumerate(ym)}
yi = np.searchsorted(lat, df.lat.to_numpy()); xi = np.searchsorted(lon, df.lon.to_numpy())
tt = np.array([ti[(int(y), int(m))] for y, m in zip(df.year.to_numpy(), df.month.to_numpy())])
v = df.t2m_c.to_numpy().astype(np.float32); v[v == -999.0] = np.nan
vals[tt, yi, xi] = v
np.savez_compressed(D / "monthly.npz", values=vals, lat=lat, lon=lon, year=ym[:, 0].astype(np.int16), month=ym[:, 1].astype(np.int8))
claim = {"claim_id": "C-C", "claim_text": "Near-surface air temperature over interior and western Alaska has risen",
  "variable": "T2M (MERRA-2 2 m air temperature via NASA POWER)", "variable_plain": "yearly average air temperature about 2 m above the ground",
  "units": "degC", "direction": "increase", "season_months": list(range(1, 13)), "period": [1981, 2025],
  "region_name": "interior and western Alaska", "region_box": {"lat_min": 60, "lat_max": 70, "lon_min": -165, "lon_max": -140},
  "product": {"name": "NASA POWER Monthly API, MERRA-2 T2M (reanalysis model output)", "version": "POWER v2.10.0 (MERRA-2)", "doi": "10.5067/AP1B0BA5PD2K"},
  "is_model_data": True}
(D / "claim.json").write_text(json.dumps(claim, indent=1))
print(vals.shape, int(np.isnan(vals).sum()), "NaN")
