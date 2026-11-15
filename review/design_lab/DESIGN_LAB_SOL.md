**Ship a hierarchy of questions, not a gallery of charts.** The lab’s strongest assets are real geography, comparable years, and scientific restraint. Preserve the courtroom typography; give each visual a specific job.

**1. Module verdicts**

**Globe — ship after fixes.** An excellent invitation; an inefficient analytical map.

- Pull the camera back until Earth’s curvature reads. Alaska currently resembles a rectangular overlay on satellite wallpaper.
- Quiet Blue Marble further, especially its bright Arctic whites; give the sampled region a fine boundary.
- Use one compact legend immediately beneath the image: measurement, units, baseline, endpoints. Keep geography outside the sampled region visually neutral.
- Start paused; retain deliberate Play, year scrubbing, and reset. Use a static labelled poster on phones and without WebGL.

**MECE:** Geographic orientation is distinct; its year playback duplicates the anomaly map. Give the globe ownership of orientation on Home.

**Anomaly map — ship after fixes.** The strongest analytical addition.

- Keep the fixed range; place its legend directly beneath the plot, before playback controls.
- Replace “2025” dominance with a balanced header: place/measurement first, year second, regional anomaly third.
- Strengthen coastlines selectively; reduce graticules. Wisconsin needs recognisable geographic context.
- Clearly label spatial smoothing and temporal blending. Preserve missing cells; paused inspection must report actual cell/year values.
- Print semantic endpoints: cooler/warmer, drier/wetter, lower/higher aerosol. Replace `+0.10 1 (unitless)` with `+0.10 AOD (unitless)`.

Borrow the stable temporal framing of [SVS 5603](https://svs.gsfc.nasa.gov/5603/), while retaining each case’s own product and baseline.

**MECE:** Distinct from hearings: **what changed when**, versus **where tests flag evidence**.

**Spiral — ship after fixes, initially for complete twelve-month records.**

- Make the current loop clearly visible in both themes; fade historical loops into a restrained trail.
- Strengthen the zero ring and directly label radial units. Move the annual summary outside the centre.
- Animate a continuous monthly leading point; retain year scrubbing and explicit pause.
- Keep actual calendar positions. The seasonal cases currently stretch three or four months around an entire circle; exclude them from production until missing months appear as gaps.

**MECE:** Monthly departures reveal seasonal structure absent from the yearly docket record. Distinct, provided monthly data exist.

**Distribution — ship after fixes.** The present reveal animation is not yet a convincing “jellyfish.”

- Use one foreground density curve moving between periods, with the first period retained as a reference outline; keep intermediate outlines faint.
- Anchor motion to a fixed zero line, horizontal domain, and density scale. Never resize each curve to equal height.
- Replace the tiny floating annotation with one readable line: mean shift and spread change.
- Show complete period dates and sample counts, including partial periods. Label the population **“pooled cell-year anomalies, unweighted”**; its mean differs from the area-weighted regional record.
- Include tails in the domain or disclose excluded mass. State that correlated cell-years are descriptive, not independent observations.

[SVS 5613](https://svs.gsfc.nasa.gov/5613/) makes changing shape legible through movement; this version should earn that movement from its own densities.

**MECE:** Distinct: distribution shape and spread, beyond the regional mean. Do not promise that every distribution shifts or broadens.

**Stripes — lab only.**

- Reduce the band’s height and remove decorative framing.
- Directly label baseline, units, and endpoint years.
- Use a fixed, disclosed range; distinguish missing years.
- Retain keyboard inspection and a numerical alternative.

**MECE:** Fails as another docket exhibit. It repeats the regional record with less quantitative precision. Reconsider only as a replacement for a future compact preview.

**2. Integration map**

| Location | Visual and replacement |
|---|---|
| **Home hero, right half at 1280** | One Alaska globe, captioned “Interior and western Alaska · yearly air-temperature anomalies · 1981–2025.” Occupies the empty composition; links to C-C. No case selector or verdict dashboard. |
| **Home, 375** | Compact static globe poster after the primary action. Keep opposite headlines below the hero; pause the desktop globe when it leaves view. |
| **Case docket** | Replace the competing A/B columns with one full-width exhibit area. A single **View** selector offers **Regional record / Values over time / Evidence by hearing / Distribution**. Default to the existing record. |
| **Docket map views** | Anomaly map and hearing map occupy the same geographic frame, exclusively. Preserve extent when switching; swap legend and controls. No docket globe. “Explore hearings” selects the hearing view. |
| **Statistics / Limits** | Statistics links “Inspect distribution” to the shared exhibit area and owns its numerical table. Merge pooling, smoothing, weighting, and period qualifications into Limits. No additional chart beneath the exhibit. |
| **Investigate, Step 4** | Existing yearly chart remains default. **Monthly cycle** replaces it with the spiral only when twelve-month regional observations are available. A small adapter uses the live monthly rows and a printed baseline. |
| **Investigate results** | Stripes are technically possible but redundant. Spatial maps/globes and pooled cell-year distributions cannot be reconstructed from a regional series alone; omit them. |
| **How it works** | False-Alarm Planet remains the primary interactive lesson. Link explanation text to the relevant case views; do not reproduce the lab. |
| **Case index / Data & provenance** | Keep current locators and file rows. Add visualization methodology and credits to provenance, without another visual. |

Keep the ruling above every docket view: **C-C supported; C-B partly supported; C-A/C-D withheld.** Descriptive playback never changes that ruling.

**3. The memorable five seconds**

**22–27 seconds: C-A’s blue anomaly field moves, then stops. Above it: “The court cannot rule.”** Hold for two seconds. Voiceover: **“Knowing when to withhold a verdict is part of the science.”**

The surrounding edit: 0–5 opposite headlines; 5–10 Alaska globe into anomaly map; 10–15 distribution movement; 15–22 False-Alarm Planet with actual computed outcomes; 27–30 investigation invitation. Preserve case labels and visibly distinguish simulation from observations.

**4. Implementation brief: 175 minutes**

1. **20 min — shared frame and tokens.** Update `viz.css`/`common.js`: 14px readable labels, tabular values, adjacent legends, 44px controls. **Accept:** both themes remain readable at 375 and 1280; no clipped labels.

2. **35 min — docket integration.** Implement one exhibit mount in `views/cases.js`; preserve selection and dispose inactive modules. **Accept:** exactly one mounted primary visualization; hearing changes leave regional rulings unchanged.

3. **25 min — map/globe polish.** Fix camera framing, geographic contrast, unit strings, legend order, and interpolation disclosure. Mount the Home globe. **Accept:** endpoints and sampled cell values match source data; missingness remains visible.

4. **30 min — spiral adapter.** Adapt live monthly rows; improve current-loop contrast and monthly playback. **Accept:** incomplete calendars fall back to the existing chart; displayed baseline and inspected months match the input.

5. **40 min — distribution polish.** Reuse existing densities for the moving foreground curve; retain reference outline and static comparison fallback. **Accept:** fixed axes, disclosed population/tails, accurate dates and summaries; no invented broadening.

6. **25 min — verification.** Check all four cases, both themes, keyboard/touch, reduced motion, and WebGL failure. **Accept:** paused defaults, no automatic rotation, concise announcements after interaction, accessible tables, and all four verdicts preserved.