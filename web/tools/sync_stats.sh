#!/bin/sh
# One source of truth: stats/js/trendtrial.js. Copy it into web/js/vendor/ so the web/ folder deploys on its own.
# Run after every change to stats/js/trendtrial.js (and before a release freeze).
cd "$(dirname "$0")/../.." && cp stats/js/trendtrial.js web/js/vendor/trendtrial.js && echo "copied trendtrial.js $(grep -m1 'export const VERSION' web/js/vendor/trendtrial.js)"
