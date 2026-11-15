## 1. Verdict

- **Keep the courtroom direction.** Navy, parchment, brass, and Georgia give this a recognizable identity. The reference mockup has stronger hierarchy because its ruling is short and its exhibits dominate.
- **The scientific restraint is a strength.** Showing amendments, uncertainty, withheld results, and inconclusive findings supports Validity. Repeating those explanations across multiple boxes weakens Presentation.
- **Too many containers have equal importance.** Cards, stamps, badges, tips, outlines, and all-caps labels compete. Home’s five steps, two modes, and thirteen definitions turn an invitation into documentation.
- **Mobile is the first repair.** The 390px docket visibly clips content horizontally and puts the entire hearing ladder before the evidence. That undermines accessibility and student impact.
- **The globe can distinguish the entry.** Its value is demonstrating a statistical trap. Additional decorative visualizations would dilute that lesson. Fix hierarchy before adding spectacle.

## 2. MECE information architecture

Use three main navigation links: **Investigate · Case files · How it works**. Home is the brand link; Evidence is a utility link.

```text
Home — orient and invite
  Keep: promise, one worked-example teaser, entry action
  Exclude: workflow tutorial, variable encyclopedia, audit material

Investigate — answer a question the visitor configures
  Measurement → Place → Period → Record → Test
  Result: explicitly exploratory
  Exclude: registered-case browsing, unavailable measurements

Case files — examine completed, registered questions
  Index
  Case docket
    Claim and final finding
    Map hearings + regional record
    Detailed statistics
    Provenance summary → canonical registration record
  Exclude: editable investigation controls, general method lessons

How it works — teach interpretation
  False-Alarm Planet
  Method: tests, assumptions, uncertainty, verdict conventions
  Measurement glossary
  Exclude: case-specific results, downloads, amendment chronology

Evidence [utility] — enable inspection and reproduction
  Case/run selector → files, sources, versions, reproduction instructions
  Registration and amendments ledger
  Exclude: duplicated lessons and narrative verdicts
```

**Resolve current overlaps:**

- **Detective versus Case files:** “Open a new case” suggests equivalent evidential status. Rename it **“Investigate a question”**; persist “Exploratory analysis” beside its result.
- **Method versus statistics:** Method explains what a statistic means; the docket owns its actual value and case-specific qualification.
- **Evidence versus exhibits:** Rename the utility **“Data & provenance.”** Exhibit A/B remain case evidence.
- **Registration:** Move the canonical chronology from Method into Data & provenance, with case anchors. Keep a visible docket summary: **“Question registered; methods amended.”**
- **Gaps:** Explicit simulation labeling, a clear live-versus-archived distinction, and a discoverable route from a finding to its exact source files.

## 3. Screen prescriptions

The hierarchy below is the intended eye order.

### Home

**1:** “How strong is the evidence for climate change here?”  
**2:** One real example showing how interpretation changes.  
**3:** **Start investigating**.

Cut “Five steps to a finding” and “Two ways to investigate”; they repeat the entry choices. Move definitions into the measurement picker and glossary. Keep “Explore registered cases” as a text link.

Use a 64px section gap, a maximum 56ch introduction, and at most two sentences. The example should show one question and one consequential comparison, without copying the whole docket. Avoid introducing another card grid.

### Detective / Investigate

**1:** Current question and “Step 1 of 5.”  
**2:** Current input or chart.  
**3:** **Continue: choose a place**, with wording changing by step.

Replace the three-column workspace with a 240px progress rail and flexible task area. Remove the empty ruling column during configuration; show the result beside or immediately after the record once available. Fold the demo banner into a quiet **“Try a guided example”** disclosure.

Replace twelve large measurement cards with compact radio rows, grouped by subject. Show the selected measurement’s definition, units, availability, and provenance once. Remove the unavailable aerosol option; link to its registered case below the picker.

Use one shared 24px panel padding. On phones, show “Step 1 of 5” plus an expandable progress list and a sticky continuation bar. Provide loading progress, retry, and preserved selections. Put repeated-testing caution beside rerun controls.

### Case index

**1:** Question/location. **2:** Dataset, period, finding. **3:** **Open docket**.

The current oversized locator maps consume more attention than the claims. Use compact rows with a 160×120px locator, 24px title, and concise metadata; stack at 640px. Remove the speculative “More cases are being processed” message.

### Case docket

**1:** Claim plus concise final ruling.  
**2:** Regional record and magnitude of change.  
**3:** Map and selectable hearings.

Primary action: **Explore the hearings**.

Replace the long ruling sidebar with a summary above the exhibits: **“Supported”**, one scope line, slope/interval, and one essential caveat. Preserve material qualifications; move their extended explanations into **“Limits of this finding.”**

Keep final regional results visibly separate from map-hearing selection. In `cases.js`, rung selection currently redraws only the rail and map. Label **“Map: hearing 2 of 4”** and **“Regional ruling: final.”** Do not animate a verdict change unsupported by that interaction.

Collapse variance factor, alternative tests, checklist detail, and finding fields into **“Statistics”** and **“Provenance.”** Replace the separate honest-null card with contextual interpretation.

Show one headline map measure: **“85.2% of mapped area flagged”**; disclose cell counts underneath. Reduce cell-symbol contrast, retain distinguishable patterns, and place the legend directly below the map.

Default the chart to observations, Sen trend, and slope-range band. Put least squares behind **“Compare baseline fit.”** Print baseline dates and units; label the band accurately.

**Phone repair:** use claim → ruling → record → compact hearing selector → map. Set grid/flex children to `min-width:0`, wrap long identifiers, constrain SVGs to their containers, and confine horizontal scrolling to tables. Do not mask overflow globally.

### False-Alarm Planet — planned exhibit

**1:** “This simulated planet has no underlying trend.”  
**2:** Globe/flat map with **“X of Y cells falsely flagged.”**  
**3:** **Apply the next correction**.

Keep the same generated world while comparing methods. Show persistence and record-length controls beneath the exhibit; disclose seed and assumptions under “Simulation details.”

Use red for false alarms and neutral cells otherwise. Always display **“Synthetic demonstration · not NASA observations.”** Corrections must display actual outcomes, including increases or unchanged counts; never choreograph guaranteed disappearance.

Default phones to a flat map. Provide a globe toggle and rotation pause; omit rotation by default.

### Method

**1:** A four-stage explanation. **2:** Why each adjustment matters. **3:** **Try False-Alarm Planet**.

Replace the long introductory implementation paragraph with the learning proposition. Use a 68ch reading column and 48px section gaps. Keep essential interpretation visible; disclose formulas and technical assumptions. Move credits, product inventory, and registration chronology to provenance.

The screenshots’ universal “computed in advance” claim is obsolete; current `pages.js` improves Method. Align Evidence and footer language with that distinction.

### Evidence / Data & provenance

**1:** Selected case/run. **2:** Files and provenance. **3:** **Download case bundle**.

Replace four equivalent download cards with file rows: name, purpose, format, size, descriptive action. Put run/schema identifiers below the selector. Add a real reproduction link; the current paragraph merely mentions a repository.

Scope downloads explicitly to archived cases. Never imply the bundle contains a visitor’s live investigation.

## 4. Tighten the design system

- **Type:** retain Georgia display and UI sans. Desktop sizes: 48/56 hero, 36/42 page title, 28/34 section, 20/26 subsection, 16/25 body, 14/20 metadata, 12/16 eyebrow. Phone hero/title: 32/38. Restrict monospace to identifiers and short stage labels.
- **Spacing:** `4, 8, 12, 16, 24, 32, 48, 64px`. Replace scattered 18/20/22px padding with 24px desktop, 16px phone. Maximum workspace width: 1280px.
- **Colour:** navy means structure/primary action in light; ivory text and brass action in dark. Brass means selection, focus, and court identity in both themes. Remove brass from “not flagged” data. Use consistent blue/teal data families across themes; red means error or simulated false alarm, never warming. Neutral provenance labels replace warning-coloured “model-based” chips.
- **Components:** keep buttons, radio choices, exhibit frames, disclosures, tables. Merge card/panel/record shells and badge/tag/stamp variants. Delete decorative trust tags, repeated null cards, and redundant tips.
- **Motion:** 150–200ms state transitions; no gavel bounce, confetti, or automatic tours. Preserve focus and layout. Reduced motion uses immediate updates.

## 5. Five craft details — approximately three agent-hours

1. **30 min:** Tabular numerals throughout results; proper `°C`, minus signs, date ranges, and consistent precision.
2. **45 min:** Responsive SVG sizing, unclipped labels, touch-readable chart inspection, and visible keyboard focus.
3. **30 min:** Ruling updates with a restrained crossfade, stable height, and one concise polite announcement.
4. **45 min:** Distinct loading, unavailable-data, failed-check, and inconclusive states, each with a useful next action.
5. **30 min:** Copy-finding feedback with accessible confirmation; copied text includes scope, units, dataset, interval, and run identifier.