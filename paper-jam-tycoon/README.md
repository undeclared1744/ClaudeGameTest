# Paper Jam Tycoon

An incremental (idle) game about running a copier service company. Tap the green button to work service calls, hire crew and buy gear that earn while you're away, then sell the company for Reputation stars and start again faster.

The whole game is `index.html`. Every number you'd want to tune is in the GAME DATA section at the top.

## Features

- **Nine crew tiers,** from Intern up to Toner Factory, plus 49 upgrades.
- **Rush calls** pop up every couple of minutes. Taking one pays a lump sum or gives you overtime pay at 5x.
- **Away earnings:** you're paid for time away, up to 8 hours.
- **Prestige:** selling the company earns Reputation stars, each worth +10% to everything, forever.
- **Saving:** the game saves in the browser, and also to your Claude account when it's opened from claude.ai, so it syncs between devices. A copyable save code is the backup.
- **Controls:** touch, keyboard and game controller all work.

## Tests

- `tests/play.py` runs 30 click-through checks and takes screenshots.
- `tests/sim.py` has a robot play 6 hours to check the pacing.
