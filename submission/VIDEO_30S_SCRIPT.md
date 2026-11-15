# Climate Claim on Trial: 30-second video script

Script A, "Headline detective" (chosen by Walter), with his opening line added on Nov 14 at 5:45 PM. Source of the wording: `review/video_r1/SCRIPT_A.md`.

Hard cap: 30.0 seconds or less (over the limit means no global judging). Export at 29.5 s so the cap has margin. English, with English captions burned in. Spoken words: 64. The delivered read is 22.6 s of speech with 0.7 s gaps, so the last spoken word ends at about 24.7 s and the end card runs from 25.7 s to the end of the 29.3 s file. The cap stays 29.5 s. No NASA logos on screen. No people under 18. Record against the live site on the final build. Every number on screen is the number on the page.

Voice: Walter Guevara's own voice, as an AI voice clone made with his consent (ElevenLabs, balanced settings, v1). Plain, warm, unhurried, like someone explaining it to a friend. Because the voice is an AI clone, the end card and the video description must say so. If the read ever runs past the end card start, cut "I'm Walter," first and shorten the gaps between lines before changing any other word.

The story in one breath: by choosing the years, one NASA record gives opposite headlines; so a claim has to be written down first and tested, and the test itself has to be checked for false alarms.

## Narration (read in this order, one block per shot)

```
I'm Walter, team Earth on the Stand.

By changing the years, I can make Alaska's headline say cooling or warming.

To judge a claim, I write it down before seeing the data.

I check our test for false alarms on made-up data with no trend.

In our Alaska case, the full NASA record supports warming.

Move the years yourself. Put a claim on trial.
```

Word count: 7 + 13 + 12 + 13 + 10 + 9 = 64.

## Shot table (delivered timing, v2)

The times below are the delivered cut, read from `submission/video/pipeline/timing.json` and the SRT in `submission/video/out/` (the earlier planning targets are gone). Each shot starts with its narration block: 0.00, 3.08, 8.46, 12.56, 17.16 and 21.62 s; the end card starts at 25.7 s and the file is 29.3 s long (the cap is 29.5 s). Version v1 (the first cut) was re-cut as v2 with zoomed shots, so the case-page, false-alarm and ruling frames fill the picture; the narration text is unchanged. If `timing.json` changes again, change this table to match.

Capture at 1280 by 720 (recorded at 2x scale), dark theme (the site default; do not mix themes, and set ?theme=dark in the address if needed), normal motion (not the reduced-motion setting). Navigate by setting the address, for example `http://localhost:8000/#/case/C-C`.

| Time | Narration | On screen | Route and action |
|---|---|---|---|
| 0:00-0:03.08 | I'm Walter, team Earth on the Stand. | The Home hook frozen on its cooling window with the globe turning, so the question is on screen from the first frame. | Open `#/` (Home). Hold the first frame, then let the page's own timeline play from the same mark. |
| 0:03.08-0:08.46 | By changing the years, I can make Alaska's headline say cooling or warming. | The window slides from 1998 to 2012 (cooling) to 2005 to 2019 (warming); the warming window is held as a still so "warming" stays readable to the end of the shot. The headline words come from the page. | Home. Read the exact headline words and slopes off the page; never type them. |
| 0:08.46-0:12.56 | To judge a claim, I write it down before seeing the data. | The Alaska case page: the claim as written down before the data, and the "Question fixed in advance; tests adjusted (disclosed)" chip. | Open `#/case/C-C`; scroll from the claim to the ruling box. |
| 0:12.56-0:17.16 | I check our test for false alarms on made-up data with no trend. | False-Alarm Planet: a made-up planet with no trend shows red false alarms. The "Synthetic" label is in frame the whole time. | Open `#/false-alarm` about 14 s before this slot, off camera, so the planet has grown and played its trial. On camera, show the three test buttons on the left. Do not speak the counts. |
| 0:17.16-0:21.62 | In our Alaska case, the full NASA record supports warming. | The Alaska ruling "Supported", with the region, the years, the data source and the "Model-based data" chip in frame. | `#/case/C-C`, ruling box in frame. |
| 0:21.0-0:25.7 | Move the years yourself. Put a claim on trial. | The years window is dragged; then the globe turns and a region (the Sahel) is pressed. This shot starts 0.6 s before its line so the globe press and the headline change land inside the slot. | Home: drag the years window, scroll, turn the globe, press the Sahel. |
| 0:25.7-0:29.3 | (the last spoken word ends at 24.74) | End card, fading in at 25.7 and held to 29.3. | End card drawn by `assemble.py` on the brand navy background. No route. |

End card text:

```
Climate Claim on Trial
Walter Guevara, team Earth on the Stand, NASA Space Apps 2026
https://lucumax.github.io/climate-claim-on-trial/
Narration: AI voice clone of Walter Guevara (ElevenLabs), made with his consent.
Data: NASA. Independent entry, not endorsed by NASA.
```

The card is on screen for only two seconds, so keep it to these five lines with the same text in the video description. Put the name, team and voice notice in the largest type that fits.

## On-screen captions (burned in, same words as the narration)

Captions sit in the bottom third. Break each line at a natural pause, two lines at most. The opening line and the last line stay on screen until the next line starts.

## Check against the page (do before recording)

- The headline words ("cooling", "warming"), the two windows (1998 to 2012 and 2005 to 2019) and every slope are computed and written by the page. Read them off the screen. The Home headline card may say "Warming fast" in an older build; the plain word "Warming" is the intended text, so record after that fix is in.
- "Supported" for Alaska is the ruling in the final case file. Do not use a cached screenshot from an older run. The Alaska data is model output (MERRA-2), and the source must be visible in frame at 0:20 to 0:24.8.
- Show the "Synthetic" chip in every False-Alarm Planet frame. A viewer must never see those red cells without the label.
- The video does not mention the Southeastern US case, the satellite drift or the NO2 pair. Do not add them: the earlier drafts made it sound as if satellite drift caused the withheld verdict, and the registered reason is year-to-year memory in a short record.
- Check every control that the shot table uses against the final landing build before recording (the years drag on the Home chart, the region press on the globe). If a control is not there, use the nearest control that is, and change the table.

## Notes for the recording

- Captions: English, burned in. Also supply an .srt. Test the public link in a private window.
- No numbers are spoken. All numbers appear only on the page, in frame.
- Voice: render each line separately with the ElevenLabs clone of Walter's voice (balanced settings, v1), check the length of each, trim silence, then lay the lines on the picture. Read the lines aloud once in a normal voice to hear whether they sound like a person. Keep the consent record for the clone with the project files.
- The video description must say: "Narration: AI voice clone of Walter Guevara (ElevenLabs), made with his consent. Screens are recordings of the working site on real NASA data. Independent entry, not endorsed by NASA." The MP4 metadata comment carries the same note (REPRODUCE.md, section 5), and the SI field says the same.
- If another case file looks better by the time of recording, do not add it. Keep one real result per segment.
