# Notice: third-party components, data and pre-existing templates

Climate Claim on Trial is MIT licensed (see `LICENSE`, Copyright (c) 2026 Walter Guevara). This file lists everything in or used by the project that is not our own work, with its version and licence. It is not endorsed by NASA.

## 1. Shipped in the site (`web/`)

| Component | Version | Licence | Where | Notes |
|---|---|---|---|---|
| globe.gl | 2.46.2 | MIT, Copyright (c) Vasco Asturiano | `web/vendor/globe.gl.min.js` | Unmodified UMD bundle from https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js, vendored so the page never loads from a CDN. Loaded only for the globe view of the False-Alarm Planet page and the hidden lab page. |
| three.js (inside globe.gl) | r185 (the bundle's own REVISION constant) | MIT, Copyright (c) three.js authors | same file | |
| three-globe (inside globe.gl) | bundled | MIT, Copyright (c) Vasco Asturiano | same file | |
| h3-js (inside globe.gl, through three-globe) | bundled | Apache-2.0, Copyright Uber Technologies, Inc. | same file | The bundle carries Uber's copyright line. |
| Helvetiker font data (inside globe.gl, from three.js) | bundled | Font licence of MAGENTA Ltd, Copyright (c) 2004 (permission notice is embedded in the bundle) | same file | Not used by our pages. |
| Other small packages inside the globe.gl bundle | bundled | MIT, ISC or BSD (permissive) | same file | The full dependency list is the one published with globe.gl 2.46.2. |
| world-atlas | 2.0.2 | ISC, Copyright (c) Mike Bostock | `web/vendor/countries-110m.json`, `countries-50m.json` | Built from Natural Earth. https://github.com/topojson/world-atlas |
| Natural Earth (data inside world-atlas) | as in world-atlas 2.0.2 | Public domain | same files | https://www.naturalearthdata.com |
| us-atlas | 3.0.1 | ISC, Copyright (c) Mike Bostock | `web/vendor/us-states-10m.json` | Built from US Census Bureau cartographic boundary files (US government work). https://github.com/topojson/us-atlas |
| Blue Marble: Next Generation texture | 4096 x 2048, re-encoded to WebP quality 66 | NASA imagery, public domain; credit NASA Earth Observatory | `web/vendor/blue-marble-4096.webp` | Taken from the three-globe example images. Used only by the hidden lab page (`web/lab.html`), desaturated and darkened in the browser. No endorsement by NASA is implied. https://visibleearth.nasa.gov/collection/1484/blue-marble |

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

All case-file data come from NASA services and are used under NASA's open data policy. Each product, version and DOI is on the Data and provenance page and in the README.

- MERRA-2 (Global Modeling and Assimilation Office, NASA GSFC) through the NASA POWER API v2.10.0. Reanalysis model output, not a direct observation.
- GPM IMERG Final Run V07, MODIS/Terra MOD11C3 V061, MODIS/Aqua MYD08_M3 V6.1, through NASA Earthdata (GES DISC, LP DAAC and LAADS DAAC).
- Subsets of these data are kept in `data/` with their provenance files (granule lists, QC counts and checksums). The raw NASA files are not in the repository.

## 4. Pre-existing generic templates (written before the event)

On Nov 12, 2026, before this challenge began, Walter Guevara wrote a set of generic hackathon templates under the MIT licence. They contain nothing about this project. These files were copied into this project and then changed during the event:

- the light and dark theme switch, `web/js/theme.js` (template: `theme/theme.js`);
- the colour-contrast checker, `web/tools/check_contrast.py` (template: `theme/check_contrast.py`);
- the structure of the colour tokens in `web/css/tokens.css` (template: `theme/theme.css`). The courtroom palette and every colour value were chosen during the event.

The scan rules used to prepare this public copy (secret patterns, local paths, personal emails) were adapted from another template of that set, `export/public_export.py`. That preparation script is not part of this repository.

Everything else in this repository was written during the event under Walter Guevara's direction, with LLM assistance (see the README, "Use of SI (AI)"). The event record in `event_record/` has the times.

## 5. Methods implemented (papers and books)

Mann (1945), Kendall (1975), Sen (1968), Gilbert (1987), Hamed and Rao (1998), Yue, Pilon, Phinney and Cavadias (2002), Yue and Wang (2004), Benjamini and Hochberg (1995), Benjamini and Yekutieli (2001), Wilks (2016, Bulletin of the American Meteorological Society 97, 2263 to 2273), and Gelaro et al. (2017, MERRA-2, Journal of Climate 30, 5419 to 5454). These are methods we re-implemented from the published descriptions; no code from the papers' authors is included.
