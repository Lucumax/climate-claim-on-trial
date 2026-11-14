# web

The whole site. It is static files that run in the browser: no server code, no build step, no account. Any static host works.

Run it locally from the repository root:

```
python web/tools/serve.py 8765
```

- `index.html` loads `js/main.js`, a hash router. `js/views/` holds the pages, `js/viz/` the visual modules, `js/vendor/trendtrial.js` the browser statistics (a copy of `stats/js/trendtrial.js`).
- `data/`: case bundles (`bundle_*.json`, listed in `index.json`), the satellite library tiles, comparison-record files and `exploratory.json`.
- `css/`, `vendor/` (basemaps and globe), `tools/` (server, contrast and syntax checks, data makers).
- `lab.html` is a test page for the visual modules.

Module structure and checks: [../ARCHITECTURE.md](../ARCHITECTURE.md). Rebuild commands: [../REPRODUCE.md](../REPRODUCE.md).
