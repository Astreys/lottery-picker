# Lottery number picker

Personal tool for building Canadian lottery picks out of hot, cold and overdue
numbers. Draw history comes straight from lotto-8.com, or from a text file.

Games: Lotto Max, Lotto 6/49, Daily Grand, Lottario, Ontario 49, BC/49.

## How it works

Two independent readings of the same history sit side by side:

- **Frequency** — how often a number came up in the analysis window. Top third
  hot, bottom third cold.
- **Recency** — how many draws since a number last appeared. Longest gaps are
  the overdue (cold) end.

You choose which reading drives the bands, how wide the window is (50 / 100 /
200 / 500 / all), and how many hot, regular and cold numbers each set takes.

Games whose extra ball has its own pool get a second, independent analysis and
their extra ball picked too. That is currently just Daily Grand — 5 main
numbers from 1–49 plus a grand number from 1–7. Elsewhere the bonus ball is
drawn from the same pool as the main numbers, so there is nothing extra to
pick and none is shown.

## Running it

```
npm install
npm run dev      # http://localhost:5173
npm test         # analysis + picker checks against a real fixture
npm run build
```

## Analytics

Google Analytics 4 loads only when `PUBLIC_GA_ID` is set — copy `.env.example`
to `.env` for local use, or set it under Site configuration → Environment
variables on Netlify. With no ID configured nothing is loaded and no request is
made to Google, and it is skipped in dev so local work stays out of the reports.

Beyond page views it records two custom events: `load_results` (game, cache or
live, draw count) and `generate` (game, metric, window, number of sets, and the
hot-regular-cold split).

If the site ever goes anywhere beyond your own use, GA sets cookies and will
want a consent banner under GDPR/PIPEDA. There is none here.

## Deploying

Connect the repo to Netlify. Build command `npm run build`, publish directory
`build` — both already set in `netlify.toml`. The only environment variable is
the optional `PUBLIC_GA_ID` above; there are no external services to configure,
since draw history is cached in Netlify Blobs, which is provisioned
automatically. Local dev falls back to an in-memory cache.

## Layout

| Path | What it holds |
| --- | --- |
| `src/lib/games.ts` | Every game's rules. Add a game by appending an entry. |
| `src/lib/parse.ts` | Turns scraped HTML or an uploaded file into `Draw[]`. |
| `src/lib/stats.ts` | Frequency, gaps, ranks and bands. |
| `src/lib/picker.ts` | Builds sets from the bands. |
| `src/lib/analytics.ts` | GA4 loader and event helper. |
| `src/lib/server/` | Scraper and the Blobs-backed cache. |
| `src/routes/api/draws/[game]/` | The endpoint the browser calls. |
| `reference/index-v0.html` | The original single-file prototype. |

## Adding a game

Append to `GAMES` in `src/lib/games.ts` — id, display name, the lotto-8.com
page, how many numbers are drawn and the top of the range. Nothing else needs
to change; the parser and UI are driven entirely by that list.

## A note on the odds

Lottery draws are independent. A number being hot, cold or overdue tells you
nothing about the next draw, and no arrangement of these bands changes the odds
of any ticket. This is a tool for picking numbers in a way that feels
considered, not a tool for winning.
