# Vendored map data

| File | Source | Licence |
|---|---|---|
| countries-110m.json, countries-50m.json | world-atlas 2.0.2 (https://github.com/topojson/world-atlas), built from Natural Earth (https://www.naturalearthdata.com), public domain | ISC (package), public domain (data) |
| us-states-10m.json | us-atlas 3.0.1 (https://github.com/topojson/us-atlas), built from US Census Bureau cartographic boundary files | ISC (package), US government work (data) |

ISC licence: Copyright (c) Mike Bostock. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.

## globe.gl (Exhibit 0)

File: globe.gl.min.js. Version 2.46.2, https://github.com/vasturiano/globe.gl, vendored UMD bundle copied from https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js. Published to npm 2026-08-22 (more than 2 weeks before use). The bundle includes three.js, three-globe and their dependencies, all MIT licensed. It is loaded only on the Exhibit 0 page (#/false-alarm), and only when the globe view is used. Licence: MIT, Copyright (c) Vasco Asturiano (three.js: Copyright (c) three.js authors).

## Blue Marble texture (visual modules, lab page)

File: blue-marble-4096.webp (4096 x 2048, WebP quality 66, re-encoded from the 4096 x 2048 JPEG distributed in the three-globe example images, https://github.com/vasturiano/three-globe/tree/master/example/img). Credit: NASA Earth Observatory / Blue Marble: Next Generation (https://visibleearth.nasa.gov/collection/1484/blue-marble). NASA imagery is in the public domain (https://www.nasa.gov/nasa-brand-center/images-and-media/); no endorsement by NASA is implied. It is desaturated and darkened in the browser so that data colours stand out. Used only by web/js/viz/globe-case.js (lab page).

## Climate tornado (visual modules, lab page): design idea credit

File: web/js/viz/tornado.js (with web/css/viz-tornado.css). Design idea: Ed Hawkins' climate spiral (2016), the stacked "tornado" version of the climate spiral, https://www.climate-lab-book.ac.uk/spirals/. Inspiration only: our own Canvas 2D drawing code and 3D projection, our own data (web/data/viz/<case>.json); no code, image or data from the original was copied or downloaded. The year colour ramp is the viridis map (CC0, Stefan van der Walt and Nathaniel Smith), re-typed as ten colour stops. The caption on the view carries the credit "Design idea: Ed Hawkins' climate spiral (2016)".
