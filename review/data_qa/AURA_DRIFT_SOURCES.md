# Aura / OMI drift, row anomaly and mission end: sources

Research date: 2026-11-14. Plain-English notes only. Each bullet has its source URL and source date. Anything I could not confirm is marked **NOT CONFIRMED**.

## 1. Aura leaving the A-Train and orbit drift

- **Last drag make-up maneuvers: January 2023.** NASA says the spacecraft is losing altitude slowly, by only a few km by mission end.
  Source: https://science.nasa.gov/?p=420515 (NASA "Potential Evolution of the Aura Mission", updated 8 Sep 2026)
- **Last inclination adjustment maneuvers: April 2023.** NASA says these were done to save remaining fuel.
  Source: https://science.nasa.gov/?p=420515 (updated 8 Sep 2026); same text at https://science.nasa.gov/missions/potential-evolution-of-the-aura-mission (updated 8 Sep 2026)
- **Drift amounts (NASA's stated values, mean local time of the equator crossing):**
  - Under 15 minutes through late 2024.
  - About 30 minutes by mid-2025.
  - About 1 hour by mid-2026.
  - Projected about 105 minutes by September 2027 and about 150 minutes by August 2028.
  - The design crossing time is 13:45 local time, plus or minus 15 minutes.
  Source: https://science.nasa.gov/?p=420515 (updated 8 Sep 2026). Design time: OMNO2 v4.0 README, opening overview (before section 2.2) (https://aura.gesdisc.eosdis.nasa.gov/data/Aura_OMI_Level2/OMNO2.003/doc/README.OMNO2.pdf, release Dec 2019, document version 9.0).
- **Caveat on the numbers:** these are NASA projections and stated values. I did not find observed, year-by-year crossing-time measurements to check them against.
- **A-Train departure date: NOT CONFIRMED.** NASA says keeping Aura in the A-Train used to need fuel-burning maneuvers. It does not give a formal date for leaving the constellation. Source: https://science.nasa.gov/missions/potential-evolution-of-the-aura-mission (8 Sep 2026).
- **Drift is described as "slow" and "minor" for data quality.** Source: same NASA pages, 8 Sep 2026.

## 2. Official statements on the later overpass and NO2

- **NASA says the drift is minor for data quality.** Quote: "this amount of drift is minor from the perspective of data quality for all MLS and OMI data products." The OMI and MLS teams say they account for it in their retrieval algorithms.
  Source: https://science.nasa.gov/?p=420515 (8 Sep 2026)
- **NASA says the OMI team accounts for solar beta angle changes in its retrieval algorithms.** Source: same, 8 Sep 2026.
- **NOT CONFIRMED: an official NASA or OMI-team statement on how the later overpass affects tropospheric NO2 (diurnal cycle).** I did not find one.
- **NOT CONFIRMED: an official NASA flag or date after which trends should be treated with caution because of overpass drift.** I did not find one.
- **Generic trend caution (not about drift):** the OMNO2 v4.0 README says: "Caution required in the use of the data (e.g., trend analyses) when some of the data are heavily flagged or filled..." It suggests sampling only unflagged cross-track positions in the non-affected periods. The same README says to include all valid measurements, including negative values, when averaging.
  Source: https://aura.gesdisc.eosdis.nasa.gov/data/Aura_OMI_Level2/OMNO2.003/doc/README.OMNO2.pdf (v4.0 release Dec 2019; document version 9.0)
- **Diurnal-cycle context (literature, from search results, not fully read):**
  - OMI misses higher NO2 values that occur before or after its overpass time, per a 2019 Pandora comparison.
    Source: https://amt.copernicus.org/articles/12/5593/2019/ (AMT, 2019)
  - A 2025 ACP paper samples the UKCA model at OMI's 13:45 LT overpass for 2005-2015 over South and East Asia. Source: https://acp.copernicus.org/articles/25/4785/2025/ (ACP, 2025)
  - I did not find a paper that quantifies the trend bias from Aura's later drift.

## 3. OMI row anomaly

- **Start date: June 25, 2007** (first onset). The README says "Starting June 25, 2007 (presumably, even earlier [Schenkeveld et al., 2017])". Second event: May 11, 2008, cross-track positions 37-42.
  Sources: OMNO2 v4.0 README, section 2.4 (Dec 2019 release): https://aura.gesdisc.eosdis.nasa.gov/data/Aura_OMI_Level2/OMNO2.003/doc/README.OMNO2.pdf ; TEMIS: https://www.temis.nl/tropomi/no2scd/omi_rowanomaly.php ("since June 2007").
- **Effect on NO2 retrieval (v4.0):** the NO2 column fields are set to fill values where the row anomaly is identified. The README says the data quality is too poor to retrieve NO2 there.
  Source: OMNO2 v4.0 README, section 2.4.
- **Flags:** `XTrackAnomalyFlags` in the OMNO2 product. The OMNO2 README says this field includes extra flagging, so it is not identical to the field of the same name in other products.
  Source: OMNO2 v4.0 README, section 2.4.
- **TEMIS screening recommendation** (preliminary Collection 4 notes): fields `xtrack_quality` and `xtrack_quality_dynamic`. Rows flagged by both the L1B and AAI flags are treated as "really bad" and dropped. Rows flagged by L1B only get a reduced quality value. The numeric weights are marked TBD on the page.
  Source: https://www.temis.nl/tropomi/no2scd/omi_rowanomaly.php (the fetch reported a "last modified" date of 4 Nov 2026; I did not verify this date by hand)
- **OMNO2d (gridded product):** the OMNO2d README points users to "data quality flags in L2 data files" for screening. It does not describe its own row-anomaly handling. Source: https://acdisc.gesdisc.eosdis.nasa.gov/data//Aura_OMI_Level3/OMNO2d.003/doc/README.OMNO2.pdf (same v4.0 text, Dec 2019). **Implication:** to screen OMNO2d, you must go back to the L2 flags, or use an averaging method that handles flagged data.
- **Coverage effect: NOT CONFIRMED from a primary source.** TEMIS gives no percentage. A 2015 AGU poster snippet (https://agu.confex.com/agu/fm15/webprogram/Paper81893.html) is reported in search results as saying the row anomaly removes about 20-30% of useful data since 2010. I could not open that page to check it, so do not use the number without confirming it.
- **Sampling caution:** the README says the non-affected rows should be used for trend analysis, so that the same cross-track positions are sampled across the whole period (see section 2).

## 4. Planned end of the Aura mission and OMI data

- **Older projection (2023 Senior Review): end of Aura's natural life in late FY2025.** This is outdated. Source: https://science.nasa.gov/wp-content/uploads/2024/02/response-to-2023-earth-science-senior-review-and-2022-2023-out-of-cycle-senior-reviews-final.pdf (Feb 2024). Not fully read.
- **Current NASA projection: solar array power is the limiting factor by mid-2028.** NASA says: "Insufficient power generation by the solar array is conservatively predicted to be the life-limiting factor for the Aura satellite and instruments by mid-2028." A daily "pointing for power" maneuver could allow operation "beyond 2028."
  Source: https://science.nasa.gov/?p=420515 (8 Sep 2026)
- **OMI solar calibration:** the OMI solar aperture no longer faces the Sun. Daily yaw maneuvers began in July 2026, and NASA says they keep the original solar view "until August 2027."
  Source: https://science.nasa.gov/?p=420515 (8 Sep 2026)
- **NOT CONFIRMED: a formal end date for OMI science data.** I found no official end date. A Science News article (cited in search results, not read) said mid-2026 for power, which NASA's newer page supersedes.

## Unresolved items

- OMNO2 v4.0 README (Dec 2019): fetched as text via pdftotext. The document version is 9.0, and no separate document date was printed.
- The DISC OMI data-user guide (README.OMI_DUG.pdf) could not be read; WebFetch returned unreadable PDF text.
- The NASA page https://aura.gsfc.nasa.gov/Potential_Evolution_of_Aura.html redirects to https://science.nasa.gov/mission/aura/. I did not fetch the redirect target.
