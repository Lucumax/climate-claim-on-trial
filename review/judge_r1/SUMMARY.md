# Judge round 1 summary (Codex panel, 2026-11-14)

Scope: screenshots of the app as it stood (Detective captured as the pre-run form; a redesign was in progress; live POWER data not exercised). Full report: CODEX_JUDGE_R1.md.

## Scores (panel, 1-5)
| Criterion | Score | One line |
|---|---|---|
| Impact | 3 | Useful education potential, but one completed real case, no learning outcome shown |
| Creativity | 4 | Auditing a trend with a tougher-test ladder beats Giovanni plus p-value; courtroom styling is decoration |
| Validity | 2 | Alaska reproduces, but the page shows a rejected interval and the wrong test for the ruling |
| Relevance | 4 | NASA data (MERRA-2 via POWER) is genuinely core; advertised examples (AOD, world) not available |
| Presentation | 2 | Phone clipping, contradictory explanations, submission artifact still an outline |
| Total | 15/25 | Nominee: NO, about 20% |

## Top 10 changes (by gain per hour)
1. Make every case display use the SELECTED test, interval and gates (1-2 h; Validity, Presentation).
2. Remove or fix unsupported promises: Wisconsin AOD advertised but absent, whole-world offered but rejected (0.5-1 h; Relevance).
3. Separate cell count from area share (750/861 = 87.1% vs 85.2% area-weighted); explain why BH adds flags (0.5-1 h; Validity).
4. Publish the method-amendment history next to the registration claim; drop "run once, as registered" (0.5-1 h; Validity).
5. Finish the public evidence chain: repo link, rerun steps, source URLs, citations, real licence (1-2 h; Validity, Relevance).
6. Turn the outline into a finished 7-slide deck or captioned 30 s video (1-2 h; Presentation).
7. Fix phone overflow; put the time series early; repair the oversized cases thumbnail (2-3 h; Presentation).
8. Two reliable guided demos (Wisconsin, Sahel) with a labelled cached fallback (2-4 h; Impact).
9. Ship the registered Wisconsin MODIS AOD case C-D (4-8 h; Relevance, Impact, Creativity).
10. Validate the whole adaptive procedure (estimate persistence, choose method, test) and gate exploratory verdicts (6-12+ h; Validity).
Acceptance tests for each are in CODEX_JUDGE_R1.md section 4.

## Statistical red flags
- A. data.js reads ci_bootstrap_per_decade (0.22 to 0.68) although the gate rejected the bootstrap and selected the analytic interval (0.19 to 0.628); the finding names the analytic method for bootstrap numbers.
- B. Regional stats panel shows registered Hamed-Rao (p = 0.00085, factor 1.00), not the shipped Yue-Wang (p = 0.00147, factor 1.10); Method page also says HR is rung 3.
- C. "85.2% of tested cells" is an area-weighted share; cell share is 87.1%.
- D. BH adds flags (710 to 750) because it uses q = 0.10 vs unadjusted 0.05: legitimate, but the ladder calls it "tougher".
- E. "Supported by this data" is OK only as scoped to MERRA-2 in the box and period; verdict thresholds (25%/5%) are conventions; map and series are not independent evidence.
- F. Registration disclosure incomplete in the UI: methods were amended before results, and the cell rule was corrected after the first C-C result; the UI says "run once, as registered".
- G/H. Gate calibrates on fixed true persistence, not the full adaptive procedure; cell sims use 25 y/20x20 not 45 y/861 cells; 207 cells have persistence above 0.1.
- I. "95%" interval floor is 90% measured coverage; chart band is a slope-range pivoted at the median year; adapter crashes if band is null.
- J. Detective lacks the p-value calibration caveat; "unlikely to be chance alone" invites inverse-probability reading.
- Other: C-C region is an unmasked box (includes water); footer says all numbers precomputed but Detective computes live; no project MIT licence file found; no repo link on Evidence page.
- Independent check: Codex reproduced the Alaska series from the archived CSV (Sen +0.44285, Yue-Wang p 0.00147).
