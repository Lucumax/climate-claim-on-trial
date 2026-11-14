# WEB_LOG: front-end worker (Sonnet C), Climate Claim on Trial

Times are the local machine clock (ET). Folder: web/. Generic pre-event starter used and disclosed as pre-existing MIT: hackathon-templates/theme (theme.js toggle, check_contrast.py, token structure). Everything else in web/ written during the event.

- 10:43 Read WP0, spec v3 (1, 3.8, 4, 8), challenge page read, guides read. Built shell: hash-routed static site, plain ES modules, hand SVG charts and maps, no bundler, no runtime network except local JSON.
- 10:43 Scope change from orchestrator (five steps from the challenge author video): added Detective mode (variable, region incl. whole world, period/season, time series, OLS t-test + CI, Mann-Kendall + Sen, put-it-on-trial ladder: seasonal cycle, Hamed-Rao). Case files kept as second mode, C-D (Wisconsin AOD) added to the placeholder bundle.
- Stubs in place: js/stats.js (preview statistics, replace with stats/js/trendtrial.js), js/live.js (synthetic series, replace with NASA POWER browser calls), data/placeholder_bundle.json (PLACEHOLDER synthetic, generator tools/make_placeholder_bundle.mjs). Real stats bundle not yet present at stats/fixtures.
- Vendored land outline: world-atlas land-110m (Natural Earth public domain, ISC) in web/vendor.
- 10:46 stats/fixtures/example_bundle.json (and _withheld) landed; wrote adapter in web/js/data.js mapping the real single-claim bundle to the view shape; copied fixtures into web/data/. Real fixture renders in both themes; withheld bundle shows "No verdict given" with reasons and hides maps. Finding-card fields not in the bundle yet (not_supported, selection_disclosure, scope_text, ledger_ref) show "Not in this bundle yet".
- 10:46 Checks: contrast script PASS (66 pairs, both themes); no horizontal overflow at 375 px on 9 routes; own a11y smoke (names, ids, heading order, svg roles) clean; zero console errors. axe-core could not be loaded (CDN injection blocked by the permission classifier); not run.
