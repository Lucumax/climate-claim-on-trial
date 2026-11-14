# Notice: third-party components, data and pre-existing templates

Climate Claim on Trial is MIT licensed (see `LICENSE`, Copyright (c) 2026 Walter Guevara). This file lists everything in or used by the project that is not our own work, with its version and licence. It is not endorsed by NASA.

## 1. Shipped in the site (`web/`)

| Component | Version | Licence | Where | Notes |
|---|---|---|---|---|
| globe.gl | 2.46.2 | MIT, Copyright (c) Vasco Asturiano | `web/vendor/globe.gl.min.js` | Unmodified UMD bundle from https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js, vendored so the page never loads from a CDN. Loaded on demand, only when a globe is shown: the "Where the trials are held" globe on the Home page (`web/js/viz/globe-trials.js`), the globe view of the False-Alarm Planet page (`web/js/views/falsealarm.js`) and the hidden lab page (`web/js/viz/globe-case.js`). Without WebGL the Home page shows two still images instead. |
| three.js (inside globe.gl) | r185 (the bundle's own REVISION constant) | MIT, Copyright (c) three.js authors | same file | |
| three-globe (inside globe.gl) | bundled | MIT, Copyright (c) Vasco Asturiano | same file | |
| h3-js (inside globe.gl, through three-globe) | bundled | Apache-2.0, Copyright Uber Technologies, Inc. | same file | The bundle carries Uber's copyright line. |
| Helvetiker font data (inside globe.gl, from three.js) | bundled | Font licence of MAGENTA Ltd, Copyright (c) 2004 (permission notice is embedded in the bundle) | same file | Not used by our pages. |
| Other small packages inside the globe.gl bundle | bundled | MIT, ISC or BSD (permissive) | same file | The full dependency list is the one published with globe.gl 2.46.2. |
| world-atlas | 2.0.2 | ISC, Copyright (c) Mike Bostock | `web/vendor/countries-110m.json`, `countries-50m.json` | Built from Natural Earth. https://github.com/topojson/world-atlas |
| Natural Earth (data inside world-atlas) | as in world-atlas 2.0.2 | Public domain | same files | https://www.naturalearthdata.com |
| us-atlas | 3.0.1 | ISC, Copyright (c) Mike Bostock | `web/vendor/us-states-10m.json` | Built from US Census Bureau cartographic boundary files (US government work). https://github.com/topojson/us-atlas |
| Blue Marble: Next Generation texture | 4096 x 2048, re-encoded to WebP quality 66 | NASA imagery, public domain; credit NASA Earth Observatory | `web/vendor/blue-marble-4096.webp` | Taken from the three-globe example images. Used as the muted Earth backdrop of the Home page globe (`web/js/viz/globe-trials.js`) and of the hidden lab page globe (`web/js/viz/globe-case.js`), desaturated and darkened in the browser. The two Home still images `web/img/globe-trials-light.jpg` and `globe-trials-dark.jpg` are screenshots of the Home globe, so they contain it too. The case-file pages and the False-Alarm Planet do not use it. No endorsement by NASA is implied. https://visibleearth.nasa.gov/collection/1484/blue-marble |
| viridis colour map | stops typed by us | CC0, Stefan van der Walt and Nathaniel Smith | `web/js/viz/tornado.js`, `web/css/viz-tornado.css` | The year colour ramp of the tornado view on the hidden lab page, re-typed as ten colour stops (see `web/vendor/LICENSES.md`). Not copied from a file. |

`web/vendor/LICENSES.md` repeats the map-data and globe entries next to the files. The ISC licence text: permission to use, copy, modify, and/or distribute the software for any purpose with or without fee is granted, provided the copyright notice and this permission notice appear in all copies; the software is provided "as is" without warranty of any kind.

No font files are shipped. Pages ask the visitor's computer for Georgia and Arial. Icons and the favicon are drawn by us. There are no runtime npm packages, no frameworks and no build step.

## 2. Python libraries (listed in `data/requirements.txt` and `stats/requirements.txt`; not copied into this repository)

Data tools (`data/`, Python 3.12.8):

| Library | Version | Licence |
|---|---|---|
| earthaccess | 0.19.0 | MIT |
| netCDF4 | 1.7.5.1.post1 | MIT |
| numpy | 2.5.4 | BSD-3-Clause (with 0BSD, MIT, Zlib and CC0-1.0 parts) |
| pandas | 3.1.1 | BSD-3-Clause |
| pyarrow | 26.0.1 | Apache-2.0 |
| requests | 2.34.2 | Apache-2.0 |
| xarray | 2026.9.0 | Apache-2.0 |
| pyhdf | 0.11.7 | MIT |

Their own dependencies, installed automatically, are permissive: Apache-2.0, MIT, BSD, PSF-2.0, and MPL-2.0 (certifi and tqdm, unmodified).

Statistics and tests (`stats/`):

| Library | Version | Licence | Role |
|---|---|---|---|
| numpy | 2.5.4 | BSD-3-Clause | computing |
| SciPy | 1.18.1 | BSD-3-Clause | computing, and the check for our Benjamini-Hochberg code |
| pandas | 3.1.1 | BSD-3-Clause | computing |
| pymannkendall | 1.4.3 | MIT | test oracle only: used to check our own Mann-Kendall and Hamed-Rao code, never imported by the shipped code |
| pytest | 9.2.0 | MIT | tests |
| iniconfig, pluggy | 2.3.1, 1.7.0 | MIT | pytest helpers |
| packaging | 26.3 | Apache-2.0 or BSD-2-Clause | pytest helper |
| Pygments | 2.21.0 | BSD-2-Clause | pytest helper |
| python-dateutil | 4.0.0 | BSD-3-Clause | pandas dependency |
| tzdata | 2026.6 | Apache-2.0 | pandas dependency |
| colorama | 0.4.6 | BSD-3-Clause | pytest helper |

Used outside this repository: the narration of the 30-second demo video is made with the Kokoro text-to-speech model, voice af_heart (Apache-2.0), run locally. It is not part of the site or the code.

Development checks, not shipped: axe-core 4.10.2 (MPL-2.0) was run from a local copy for accessibility checks and is **not** in this repository. Node 24 runs the Python versus JavaScript parity test and the static smoke test.

## 3. Data

NASA's open data policy lets anyone use NASA Earth science data without restriction, and we credit NASA and the data centre that serves each product below. Climate Claim on Trial is an independent entry. It is **not endorsed by NASA** (or by ESA, KNMI or any other data provider named here), and it uses no NASA logos or mission identifiers.

The raw files are not in the repository. What is in it are our own subsets and derived files, each with a provenance file (granule lists, QC counts, checksums). Each product, version and DOI is also on the Data and provenance page of the site.

### 3.1 NASA products used for the four case files (`data/C-*/`)

| Product | Version | DOI | Data centre | Used for |
|---|---|---|---|---|
| MERRA-2 M2TMNXSLV, read through NASA POWER API v2.10.0 (reanalysis model output, not a direct observation; POWER has no DOI of its own) | 5.12.4 | 10.5067/AP1B0BA5PD2K | NASA GMAO, NASA POWER | C-C Alaska air temperature; the live measurements in Investigate |
| GPM IMERG Final Run monthly, GPM_3IMERGM | V07 | 10.5067/GPM/IMERG/3B-MONTH/07 | NASA GES DISC | C-B Sahel rainfall |
| MODIS/Terra Land Surface Temperature monthly 0.05 degree, MOD11C3 | V061 | 10.5067/MODIS/MOD11C3.061 | NASA LP DAAC | C-A Southeastern US |
| MODIS/Aqua Atmosphere monthly, MYD08_M3 | V6.1 | 10.5067/MODIS/MYD08_M3.061 | NASA LAADS DAAC | C-D Wisconsin aerosol |

### 3.2 NASA satellite and model library (`data/library/`, `web/data/library/`)

Investigate reads these ten measurements from precomputed one-degree monthly files that we built from NASA granules (scripts in `data/library/scripts/`, provenance and QC in `data/library/<id>/`, file format in `web/data/library/manifest.json`). The DOIs and versions below are the ones in that manifest.

| Library id | Product | Version | DOI | Data centre | Kind | Months in the library |
|---|---|---|---|---|---|---|
| `precip_imerg` | GPM IMERG Final monthly, GPM_3IMERGM | 07 | 10.5067/GPM/IMERG/3B-MONTH/07 | NASA GES DISC | satellite observation | 2001-01 to 2025-09 |
| `tws_grace` | GRACE and GRACE-FO JPL mascons, TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4 (water storage anomaly) | RL06.3Mv04 | 10.5067/TEMSC-3JC634 | NASA PO.DAAC | satellite observation (gravity) | 2002-04 to 2026-09 |
| `lst_day_myd11` | MODIS/Aqua land surface temperature, MYD11C3 (daytime) | 061 | 10.5067/MODIS/MYD11C3.061 | NASA LP DAAC | satellite observation | 2003-01 to 2026-10 |
| `snow_mod10cm` | MODIS/Terra snow cover, MOD10CM | 61 | 10.5067/MODIS/MOD10CM.061 | NASA NSIDC DAAC | satellite observation | 2001-01 to 2026-10 |
| `airs_tair` | AIRS/Aqua L3 monthly, AIRS3STM (surface air temperature, mean of day and night) | 7.0 | 10.5067/UBENJB9D3T2H | NASA GES DISC | satellite retrieval | 2003-01 to 2026-10 |
| `airs_h2o` | AIRS/Aqua L3 monthly, AIRS3STM (total water vapour column) | 7.0 | 10.5067/UBENJB9D3T2H | NASA GES DISC | satellite retrieval | 2003-01 to 2026-10 |
| `aod_myd08` | MODIS/Aqua atmosphere monthly, MYD08_M3 (aerosol optical depth, haze) | 6.1 | 10.5067/MODIS/MYD08_M3.061 | NASA LAADS DAAC | satellite retrieval | 2003-01 to 2026-10 |
| `no2_omi` | OMI/Aura OMNO2d (tropospheric NO2 column, cloud-screened; we average the daily grids to months) | 004 | 10.5067/AURA/OMI/DATA3407 | NASA GES DISC | satellite retrieval | 2005-01 to 2026-10 |
| `soil_gldas` | GLDAS Noah land surface model monthly, GLDAS_NOAH10_M (soil moisture, top 10 cm) | 2.1 | 10.5067/LWTYSMP3VM5Z | NASA GES DISC | **model output**, not an observation | 2001-01 to 2026-07 |
| `et_gldas` | GLDAS Noah land surface model monthly, GLDAS_NOAH10_M (evapotranspiration) | 2.1 | 10.5067/LWTYSMP3VM5Z | NASA GES DISC | **model output**, not an observation | 2001-01 to 2026-07 |

Investigate and the Data and provenance page label each of these as satellite or model. Our files are regridded to one degree and stored as 16-bit integers; they are derivatives, not NASA's own files, and small rounding differences from the originals are possible (the stored error is in each `qc.json`).

### 3.3 Space agency partner data: ESA

- **ESA Land Surface Temperature Climate Change Initiative (LST_cci)**, multi-sensor infrared climate data record (IRCDR), Level 3S, monthly daytime, 0.01 degree, version 3.00. DOI 10.5285/b8be3f3993e54d309fddf61ea5d3674f. Catalogue: https://catalogue.ceda.ac.uk/uuid/e67b02b814bf4a78b9ec90b4259f0741/ (served by CEDA). Credit: ESA LST_cci project.
- Used as a second, independent check on the Southeastern US case (C-A): June to August 2001 to 2024, as anonymous OPeNDAP subsets read on Nov 14, 2026. Fetch script `data/scripts/fetch_esa_lst.py`, witness script `data/witness_esa/make_esa_witness.py`, result `web/data/witness/C-A_esa.json`, notes `review/data_qa/ESA_LST_WITNESS.md`. It is exploratory and changes no ruling.
- Licence: the CEDA catalogue record states that use is covered by the ESA CCI LST terms and conditions (https://artefacts.ceda.ac.uk/licences/specific_licences/esacci_lst_terms_and_conditions.pdf, read on Nov 14, 2026). We do not copy the terms here; read them there. The raw ESA files are not in this repository.
- Product user guide: ESA LST_cci PUG, LST-CCI-D4.3-PUG v3.1, 15 Jan 2024.

### 3.4 Other data (not NASA, not a space agency)

- **KNMI Climate Explorer** (Royal Netherlands Meteorological Institute, https://climexp.knmi.nl), serving **CRU TS 4.10** from the University of East Anglia Climatic Research Unit. Citation: Harris, I., Osborn, T. J., Jones, P. and Lister, D. (2020), Version 4 of the CRU TS monthly high-resolution gridded multivariate climate dataset, Scientific Data 7, 109, https://doi.org/10.1038/s41597-020-0453-3. Station-based, 0.5 degree, land points only. We read it as saved text copies from Climate Explorer's "Make average" over each case box: mean temperature for Alaska (C-C), mean temperature and mean daily maximum temperature for the Southeastern US (C-A) and precipitation for the Sahel (C-B). The copies are in `data/witness_knmi/`; the scripts are `make_knmi_witness.py` (C-B and C-C) and `make_knmi_ca_witness.py` (C-A); results are `web/data/witness/C-A_knmi.json`, `C-B_knmi.json` and `C-C_knmi.json`; notes in `review/data_qa/WITNESS_ROUND2.md`. Exploratory cross-checks only; they change no ruling.
- Licence of CRU TS: CEDA publishes CRU TS under the UK Open Government Licence v3 (stated on the CEDA catalogue record of CRU TS 4.04, read on Nov 14, 2026). We did not check the record of version 4.10 itself and we obtained the numbers through KNMI Climate Explorer, so check the CRU and KNMI terms before reusing the saved copies.
- **Berkeley Earth**, Global Temperature Report for 2025, https://berkeleyearth.org/global-temperature-report-for-2025/. Read only, to check that the 2025 dip in the Aqua land surface temperature library series is not real cooling (`review/data_qa/LST_2025_DIP.md`). No data copied.

## 4. Pre-existing generic templates (written before the event)

On Nov 12, 2026, before this challenge began, Walter Guevara wrote a set of generic hackathon templates under the MIT licence. They contain nothing about this project. These files were copied into this project and then changed during the event:

- the light and dark theme switch, `web/js/theme.js` (template: `theme/theme.js`);
- the colour-contrast checker, `web/tools/check_contrast.py` (template: `theme/check_contrast.py`);
- the structure of the colour tokens in `web/css/tokens.css` (template: `theme/theme.css`). The courtroom palette and every colour value were chosen during the event.

The scan rules used to prepare this public copy (secret patterns, local paths, personal emails) were adapted from another template of that set, `export/public_export.py`. That preparation script is not part of this repository.

Five concept mockups of the site were drawn by Codex (OpenAI) at the start of the event from our written prompts (`mockups/prompts/`, `mockups/INDEX.md`). They are AI-generated design sketches with made-up numbers, not part of the site or the data. The PNG screenshots of them are not in the public repository.

Everything else in this repository was written during the event under Walter Guevara's direction, with LLM assistance (see the README, "Use of SI (AI)"). The event record in `event_record/` has the times.

## 5. Methods implemented (papers and books)

Mann (1945), Kendall (1975), Sen (1968), Gilbert (1987), Hamed and Rao (1998), Yue, Pilon, Phinney and Cavadias (2002), Yue and Wang (2004), Benjamini and Hochberg (1995), Benjamini and Yekutieli (2001), Wilks (2016, Bulletin of the American Meteorological Society 97, 2263 to 2273), and Gelaro et al. (2017, MERRA-2, Journal of Climate 30, 5419 to 5454). These are methods we re-implemented from the published descriptions; no code from the papers' authors is included.
