# Joke, Word & Quote

Home Screens module: the built-in Dad Joke, Word of the Day and Quote modules rolled into one, shown one at a time on a timer, made to read from across the room.

## What it shows

- **Dad joke**: a question-and-answer joke shows its question, then the answer on its own line in bold color.
- **Word of the day**: the word, large, its part of speech and its definition, from the built-in Word of the Day module's list. Kept for a whole day, it's the same word the built-in module shows that day.
- **Quote of the day**: the quote and its author.

One item fills the module at a time and crossfades to the next on the timer. By default each time an item comes round again it's a new one; set **Show the same joke, word and quote for** to keep each for anything from 5 minutes to a whole day. Periods follow the household's clock, so hourly changes land on the hour and daily ones at midnight. Jokes and quotes come from a batch fetched once an hour. If a source can't be reached, it's skipped until it's back.

Text grows to the largest size that fits the module, whatever its shape, so a short joke is huge and a long quote still fits.

## Install

In the Home Screens editor, open the Plugin Store, choose **Install from URL**, and paste:

```
https://github.com/rferg05/daily-mix-HS/releases/latest/download/daily-mix.tar.gz
```

To update: Plugin Store > **Installed**, then the download icon on Joke, Word & Quote, then **Install**.

No account or key is needed.

## Settings

| Setting | Default | |
|---|---|---|
| Dad joke / Word of the day / Quote of the day | on | Which items take a turn. |
| Show each for | 20 s | 5 to 300 seconds per turn. |
| Show the same joke, word and quote for | One turn | Or 5, 15 or 30 minutes, 1, 3, 6 or 12 hours, or a whole day. |
| Show a heading on each | on | Turn off for slightly larger text. |

## Where it comes from

- `icanhazdadjoke.com/search`: a random page of 30 jokes, the same site the built-in Dad Joke module uses.
- `zenquotes.io/api/quotes`: 50 random quotes, the same service the built-in Quote module uses.
- Word of the day: the host's en-US list (home-screens, MIT), bundled in `src/words.ts`.

## Developing

```bash
npm install
npm run preview   # http://localhost:5181 against the live sources — try ?quote=false, ?headings=false, ?w=1800&h=360
npm test
npm run build     # dist/bundle.js
```

To package: copy `manifest.json` and `dist/bundle.js(.map)` into `release/pkg/daily-mix/` and
`tar -czf release/daily-mix-<version>.tar.gz -C release/pkg daily-mix`, copy it to `release/daily-mix.tar.gz`, and attach both to a
GitHub release tagged `v<version>` so the `latest/download` URL keeps working.
