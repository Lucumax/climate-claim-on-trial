# Registration commit hash map

The public history was rewritten before release to remove the author's local file paths and account name from old commits. Every commit hash changed in the rewrite. Commit dates, author display names, messages (apart from those local-path tokens) and file contents did not change (the author's e-mail address was replaced by a GitHub noreply address, and the commits that existed only in the private working repository, such as logs and scratch files, are not in this history), so each commit below is the same work as its private original.

The text of this repository still cites the old (private) hashes, for example in README.md, METHODS.md, the event record and the site's method pages. Use this table to find the same commit here: look up the old hash and open the new one. The SHA-256 of the registration document, in `event_record/WP0_CLAIM_REGISTRATION.sha256`, is a hash of the file's contents and did not change.

| Old private hash | New public hash | Commit date (ET) | Subject |
|---|---|---|---|
| `839f802` | `a2bf9ab` | 2026-11-14 10:29:23 | WP0: register claim set before any data download |
| `36de9c7` | `3683771` | 2026-11-14 10:35:40 | WP0 addendum 1: register C-D (author's AOD example) and Detective mode, before any C-D download |
| `f08c4f0` | `ce4eb33` | 2026-11-14 10:41:37 | WP1/WP4: C-C POWER subset landed; CMR granule lists for C-A, C-B, C-D; credentialed fetch script; POWER live notes; data log |
| `29ca2ef` | `9ed580f` | 2026-11-14 10:43:31 | WP2: pipeline, aggregation, bootstrap, verdict templates, validation harness, schema and example bundles |
| `cb1798a` | `1fa8bc9` | 2026-11-14 11:08:11 | WP2: addendum 2 candidate tests, run-B harness and gate, wrap seasons, JS corrections and ladder steps (80 tests) |
| `2cb10e0` | `2ad10a7` | 2026-11-14 11:48:19 | Web: judge round 1 fixes (shipped test and interval everywhere, honest ladder and registration copy, scoped verdict, phone layout, demo cache) |
| `1e93307` | `692381a` | 2026-11-14 12:09:46 | Stats round 2: adaptive-procedure validation, real-shape cell checks, bundle fields, exploratory gate |
| `252c37a` | `912e3ec` | 2026-11-14 13:15:53 | WP0 addendum 3: register opposite-sign NO2 pair (C-E1, C-E2) before any NO2 download |
| `3152f39` | `ae4c38a` | 2026-11-14 14:51:22 | Stats round 3: negative-persistence buckets, matched skew scenarios, missing-year rule, display numbers, content-hash run ids; bundles C-A to C-D regenerated (C-D withheld -> not_supported) |
| `ca0dfc2` | `2d4c607` | 2026-11-14 14:52:16 | WP0 addendum 4: round-3 gate change disclosed as post-result; verdict effects C-B (stronger) and C-D (withheld -> not supported) |
| `a3f76ce` | `e085f17` | 2026-11-14 15:03:27 | Addendum 4: correction-note time is 15:01 ET (commit ccf126e) |
| `f00b79f` | `295e370` | 2026-11-14 16:39:40 | C-E1 and C-E2 inputs: OMI NO2 boxes at 0.25 degree, 2005-2025 monthly, coverage QC only |
| `913935c` | `a1403d5` | 2026-11-14 16:39:45 | DATA_LOG: correct granule count, disk summary for NASA library worker |
| `1b101af` | `059c88e` | 2026-11-14 16:43:46 | STATS_LOG: C-E1/C-E2 pre-run entry (aggregation, validity rules, n=21 validation plan, cell-family rule, verdict mapping), before any NO2 trend is computed |
| `4e6d168` | `d6db71b` | 2026-11-14 17:12:52 | C-E1/C-E2: n=21 validation, pipeline bundles (both withheld by the registered gate), results appended to STATS_LOG, tests |
| `39a9580` | `38e654c` | 2026-11-14 18:05:56 | Stats log: pre-computation entry for the round-3 post-result exploratory checks (recorded before any number is computed) |

Hashes listed are the ones cited somewhere in the tracked files of this repository. The registration commit is the first row dated 10:29 AM, "WP0: register claim set before any data download"; it is also the first commit of this repository.
