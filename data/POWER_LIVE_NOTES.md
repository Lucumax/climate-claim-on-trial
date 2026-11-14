# NASA POWER for Detective mode (probed live Sat Nov 14 2026, about 10:45 AM ET, from this machine; no key used)

## Endpoints (API v2.10.0, community=RE, no key, no login)
- Point, monthly: `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,PRECTOTCORR&community=RE&latitude=45&longitude=-90&start=1981&end=2025&format=JSON`
  Accepts many parameters in one call (20 tested at once, all returned). Returns one GeoJSON Feature, `properties.parameter.<NAME>.<YYYYMM>` = value. Month code `YYYY13` is POWER's own annual value (mean for most parameters; check per parameter, do not assume for sums or counts such as FROST_DAYS).
- Regional, monthly: `.../monthly/regional?parameters=T2M&community=RE&latitude-min=..&latitude-max=..&longitude-min=..&longitude-max=..&start=1981&end=2025&format=JSON`
  Returns a FeatureCollection with one Point per native grid cell. Tested limits (the error text is returned with HTTP 422):
  - at most 10 degrees range in latitude AND at most 10 in longitude per request ("Please provide a maximum of 10 degree range");
  - at least 2 degrees range in each ("otherwise use the point endpoint");
  - ONE parameter per regional request ("A maximum of 1 parameters are can currently be requested in one submission").
  - A global or large box must be tiled client side in 10 x 10 degree tiles (edge cells repeat across tiles; de-duplicate on lat/lon).
- Native grid for MERRA-2 sourced parameters: 0.5 deg latitude x 0.625 deg longitude (361 x 576 = 207,936 cells globally). Some parameters (CERES SYN1deg sources, e.g. cloud and solar) may be 1 x 1 deg; the point API snaps to the containing cell.
- Parameter dictionary (JSON, no key): `https://power.larc.nasa.gov/api/system/manager/parameters?community=RE&temporal=monthly` (names, units, definitions, source flag).

## CORS and limits
- `access-control-allow-origin: *` is returned on point and regional responses, on success and on 422 errors. Browser fetch from our page works without a proxy. A CORS preflight (OPTIONS) to the point path returned 404 from the website router; simple GET requests with no custom headers need no preflight, so do not add custom request headers.
- Rate limits: no rate-limit headers are sent. 12 regional requests in a row (10x10 deg, 45 years, about 3.1 MB each, about 2.0 s each, sequential) all returned 200. Concurrency was NOT stress tested; no limit is documented in what was probed, so limit the browser to about 4 parallel requests and retry once on 429 or 5xx.
- Size: a 10x10 deg tile at 45 years is about 3.1 MB JSON (about 21 x 17 cells x 585 values). A 1-degree-wide request is a few hundred KB.

## Shortlist of 12 monthly parameters (names, units, source and definitions from POWER's own dictionary)
Source column: MERRA-2 = reanalysis model output (not a direct observation); POWER flag "SOURCE" = taken straight from the underlying source, "POWER" = derived by POWER. Label the model-based ones as model data in the UI.

| POWER name | Units | Source | Plain definition for students |
|---|---|---|---|
| T2M | degC | MERRA-2 | Average air temperature about 2 m above the ground, the "weather station" temperature |
| T2M_MAX | degC | MERRA-2, derived by POWER | The hottest hour of the month at 2 m (monthly mean of daily maxima) |
| T2M_MIN | degC | MERRA-2, derived by POWER | The coldest hour of the month at 2 m |
| PRECTOTCORR | mm/day | MERRA-2 bias-corrected (uses precipitation observations) | Average rain plus snow water that reaches the ground, per day |
| ALLSKY_SFC_SW_DWN | kW-hr/m^2/day | CERES SYN1deg / MERRA-2 | Sunlight energy hitting a flat patch of ground, including through clouds |
| CLOUD_AMT | % | CERES SYN1deg / MERRA-2 | Share of the sky covered by cloud, on average |
| RH2M | % | MERRA-2, derived by POWER | How close the air is to being full of water vapour (relative humidity) |
| WS10M | m/s | MERRA-2 | Average wind speed about 10 m above the ground |
| GWETROOT | 1 (0 dry to 1 wet) | MERRA-2 | How wet the soil is in the plant root zone, top metre |
| GWETTOP | 1 (0 to 1) | MERRA-2 | How wet the top 5 cm of soil is |
| FROST_DAYS | days | MERRA-2, derived by POWER | Days in the month when the air at 2 m reached frost (dew point and temperature both below 0 degC) |
| SNODP | cm | MERRA-2 | How deep the snow lies on the ground |

Also verified to return values at a point (could be added): TS (skin temperature, degC), T2MDEW (dew point, degC), QV2M (specific humidity, g/kg), PS (surface pressure, kPa), WS50M (wind at 50 m, m/s), ALLSKY_SFC_LW_DWN, CLRSKY_SFC_SW_DWN, TOA_SW_DWN (kW-hr/m^2/day).
Checked at a Wisconsin point for 2020: FROST_DAYS and SNODP return real values; zeros in summer are real, not fill. Fill value is -999.0 (none present in the Alaska pull, but treat as missing in Detective mode).
Caveat to show users: POWER's precipitation, soil wetness, cloud and radiation series are model/reanalysis blends; MERRA-2 has known inhomogeneities, so a "trend" in them can reflect changes in the observing system as well as the climate. Label every POWER series as model-based.

## How a "whole world" or very large region could be served
1. Live from the browser: tile the box in 10x10 degree tiles, one parameter at a time. A whole-world request is 18 x 36 = 648 tiles x about 2 s = about 20 minutes sequentially per parameter and ~2 GB of JSON. Not usable live. A continent (about 4 x 6 tiles) is 24 requests, about 50 s sequentially, about 12 s at 4 parallel. Usable with a progress bar.
2. Precomputed and shipped (recommended for world and big regions), built by us with the same tiler as `scripts/fetch_power_cc.py`:
   - Global mean series per parameter (area weighted, cos latitude), plus 10-degree latitude bands and a few named regions (continents, oceans excluded as POWER is land-focused but returns ocean cells too): a few KB per parameter. Serves "the entire world" in the author's five steps.
   - Coarsened global grid files for map and arbitrary-box averaging: 2 x 2.5 deg grid = 90 x 144 = 12,960 cells x 540 months x int16 (0.01 scale) = 14 MB raw per parameter, about 5-8 MB gzip. Twelve parameters about 70-100 MB. 5 x 5 deg: 2,592 cells, about 2.8 MB raw per parameter, about 1-2 MB gzip, 12 parameters about 15-25 MB. The browser averages whichever cells fall in the user's box.
   - Native 0.5 x 0.625 deg global: 207,936 cells x 585 values x int16 = 243 MB raw per parameter. Too big to ship; use live tiles for native-resolution boxes up to a few tiles.
   - Build cost: 648 tiles per parameter at about 2 s = about 22 min per parameter (sequential), about 4.5 h for twelve, or about 1-1.5 h at 4 parallel. For the 5 x 5 deg product one could instead sample the point endpoint on a 5-degree lattice (2,592 calls, but 20 parameters per call, so 2,592 calls cover all parameters; about 1 s each, about 45 min sequential). A lattice sample is a point estimate, not a box average; label it so.
3. Disk budget: our hard cap for data is 1.5 GB total; the 5 deg product for 12 parameters fits easily, the 2 x 2.5 deg product fits but is above the 20 MB per-file commit limit if bundled, so keep one file per parameter.
