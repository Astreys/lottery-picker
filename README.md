# Lottery Number Picker

A small web app that analyses past Canadian lottery draws and builds number
sets from hot, cold and overdue numbers.

Games: Lotto Max, Lotto 6/49, Daily Grand, Lottario, Ontario 49, BC/49.

Built with SvelteKit and deployed on Netlify.

> **About the odds.** Lottery draws are independent. A number being hot, cold
> or overdue tells you nothing about the next draw, and nothing here changes
> the odds of any ticket. This is a tool for picking numbers in a way that
> feels considered, not a system for winning. Please play responsibly.

## How it works

Every number is measured two ways over the draws you choose to analyse, and
both readings are shown side by side:

- **Frequency**: how often a number came up in the analysis window. The top
  third is hot, the bottom third cold, the rest regular.
- **Recency**: how many draws since a number last appeared. The longest gaps
  are the overdue (cold) end.

You pick which reading drives the bands, how far back to look (50, 100, 200 or
500 draws, or the whole history), and how many hot, regular and cold numbers
each set takes.

Daily Grand's grand number is drawn from its own 1–7 pool, so it gets a
separate analysis and is picked as well. In the other games the bonus ball
comes from the same pool as the main numbers, so there is nothing extra to
pick.

Draw history is fetched from [lotto-8.com](https://www.lotto-8.com) and cached
for 12 hours. You can also upload a text file of past draws instead: one draw
per line, numbers separated by anything.

## Getting started

Requires Node.js 22 or newer.

```sh
npm install
npm run dev      # http://localhost:5173
npm run check    # type check
npm run build
```

## Tests

```sh
npm test                 # everything: unit, then end-to-end
npm run test:unit        # Vitest, in tests/unit
npm run test:coverage    # unit tests with a coverage report
npm run test:e2e         # Playwright, in tests/e2e
```

The unit tests cover everything in `src/lib` and the server routes, using
real draw histories saved in `tests/fixtures`. The end-to-end tests drive the
production build in Chromium at desktop and phone sizes. The draws API is
served from the same fixtures and Google Analytics is blocked, so the tests
never touch lotto-8.com or send analytics. The first run needs a browser:
`npx playwright install chromium`.

GitHub Actions runs the type check and both suites on every push to `main`
or `develop` and on every pull request.

No configuration is needed to run it locally. Draw history is cached in
memory when Netlify Blobs isn't available.

## Configuration

The only setting is optional:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_GA_ID` | Google Analytics 4 measurement ID. Leave it unset to run with no analytics at all. |

Copy `.env.example` to `.env` for local use, or set it under
**Site configuration → Environment variables** on Netlify. Analytics is never
loaded in dev.

When analytics is enabled, it records page views and two custom events:
`load_results` (game, cache or live, draw count) and `generate` (game, metric,
window, number of sets, and the hot-regular-cold split). GA sets cookies, so if
you deploy your own copy for the public, check whether you need a consent banner
where you are (for example under GDPR or PIPEDA). This project doesn't ship one.

## Deploying

Connect the repository to Netlify. The build command (`npm run build`) and
publish directory (`build`) are already set in `netlify.toml`. Draw history is
cached in Netlify Blobs, which Netlify provisions automatically.

## Project layout

| Path | What it holds |
| --- | --- |
| `src/lib/games.ts` | Every game's rules. Add a game by appending an entry. |
| `src/lib/parse.ts` | Turns scraped HTML or an uploaded file into `Draw[]`. |
| `src/lib/stats.ts` | Frequency, gaps, ranks and bands. |
| `src/lib/picker.ts` | Builds sets from the bands. |
| `src/lib/analytics.ts` | GA4 loader and event helper. |
| `src/lib/server/` | Scraper and the Blobs-backed cache. |
| `src/routes/api/draws/[game]/` | The endpoint the browser calls. |
| `tests/unit/` | Vitest unit tests. |
| `tests/e2e/` | Playwright end-to-end tests. |
| `tests/fixtures/` | Real draw histories the tests run against. |
| `reference/index-v0.html` | The original single-file prototype. |

### Adding a game

Append an entry to `GAMES` in `src/lib/games.ts`: id, display name, the
lotto-8.com page, how many numbers are drawn, and the top of the range. The
parser and UI read everything from that list, so nothing else needs to change.

## Disclaimer

This is an independent hobby project. It is not affiliated with, endorsed by
or connected to OLG, BCLC, Loto-Québec, the Interprovincial Lottery Corporation
or lotto-8.com. Draw results are shown as published by a third-party source and
may contain errors. Always check results with the official lottery operator.

## License

Copyright © 2026 Sasha Chernyavsky.

Released under the [PolyForm Noncommercial License 1.0.0](LICENSE). You're free
to read, learn from, fork, run and modify this project for any noncommercial
purpose. **Commercial use requires a separate license.** For one, contact
Sasha Chernyavsky via [GitHub](https://github.com/Astreys).
