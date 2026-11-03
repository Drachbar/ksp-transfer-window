# KSP Transfer Window

A transfer window planner for **Kerbal Space Program 1** (stock solar system).
Tell it where you are, where you want to go and what day it is in your game,
and it tells you **when to burn and how**: the upcoming launch windows, the
ejection burn split into the prograde/normal values you enter in a manoeuvre
node, the ejection angle, the phase angle and the Δv for the whole trip.

Live at **<https://ksp.findersson.se>** and **<https://drachbar.github.io/ksp-transfer-window/>**.

## Features

- **Upcoming windows** from the current game date, with a "leave now or wait?"
  comparison, for every pair of planets and for moons of the same planet.
- **The ejection burn as manoeuvre node values** (prograde/normal Δv) and a
  diagram of where on your parking orbit to burn.
- **Solar system view** with the origin at the bottom, showing where everything
  is at departure (with the transfer orbit) and right now, so you can check the
  alignment against the map view in the game.
- **Mid-course plane change suggestions** when they save more than 10 %, e.g.
  for some Dres and Eeloo windows.
- **The trip home**: the next window back after you arrive (optionally after a
  minimum stay), with the round-trip Δv and the full burn details for the return.
- **Porkchop plot** of every departure date and flight time around a window;
  click any point to see that transfer in detail.
- Kerbin or Earth calendar, optional maximum flight time, flybys without a
  capture burn.
- Shareable links (the search is in the URL) and the last mission is remembered.

## Credits

This is a modernised rewrite of Alex Moon's
[KSP Launch Window Planner](https://github.com/alexmoon/ksp). The orbital
mechanics (Lambert solver, ejection and plane change calculations) are ported
from that project, and the port is tested against reference results recorded
from the original code (see below). The original application is kept in
[`legacy/`](legacy/) for reference.

## Licence

Like the original, this work is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-nc-sa/4.0/)
(see [LICENSE](LICENSE)). You are welcome to fork and modify it, as long as you
give credit, do not use it commercially and share your changes under the same
licence.

## Development

Requires Node.js 24 (or ≥ 22.22.3).

```bash
npm ci
npm start                 # dev server on http://localhost:4200
npm test                  # unit tests (Vitest), in watch mode
npm test -- --watch=false # single run, as in CI
npm run build             # production build in dist/
```

### Project layout

| Path | What |
| --- | --- |
| `src/app/astro/` | Orbital mechanics in plain TypeScript (no Angular): vectors, quaternions, root finding, Lambert's problem, Keplerian orbits, the stock bodies, transfers. |
| `src/app/search/` | Porkchop grid, transfer window finder and the Web Worker that runs them. |
| `src/app/planner/` | The UI: mission form, window card, diagrams, window list and porkchop plot. |
| `src/testing/legacy/` | Reference results recorded from the original JavaScript. |
| `scripts/generate-legacy-fixtures.mjs` | Regenerates those reference results by running `legacy/javascripts/` in Node. |
| `legacy/` | The original application (CoffeeScript sources and compiled JavaScript). |

### Differences from the original calculations

The port reproduces the original results to the last bit, except where a bug
was fixed deliberately (each is covered by a test):

- The Lambert solver reported a `NaN` transfer angle for hyperbolic transfers.
- The ejection refinement ("refine transfer") can diverge when the ejection
  inclination is close to 0°. The window finder only accepts a refined result
  that stays within 3 % of the estimate and otherwise reports the estimate.

Known difference that is kept for now: when several multi-revolution Lambert
solutions exist, the original picks the one with the lowest ejection Δv only
(a typo meant the insertion Δv was never added). This only matters for flight
times longer than about one orbit.

### Deployment

The app is published in two places from the same `main` branch:

- **<https://ksp.findersson.se>**: pushes to the primary (Gitea) repository build a
  container image (`Containerfile`, static nginx on port 8080) via
  `.gitea/workflows/build.yml` and deploy it with Argo CD.
- **GitHub Pages** (<https://drachbar.github.io/ksp-transfer-window/>): the GitHub
  mirror runs `.github/workflows/pages.yml`, which tests, builds with the right
  base path and deploys.

Forks on GitHub can publish their own copy: enable *Settings → Pages → Source:
GitHub Actions* and push to `main`. The `.gitea/` directory can be ignored.
