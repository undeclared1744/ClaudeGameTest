# Self-Made Tycoon

A business tycoon incremental game. You start with nothing but a Hustle button. You buy businesses from a deals board and expand them, working your way up from a lawn care route to an airline.

## Randomly generated businesses

Every business for sale is generated when it appears on the board:

- **A real kind of business:** 33 of them across 6 tiers, from a lawn care route, food truck or laundromat up to a chip factory or launch company.
- **A made-up name:** built from name parts, such as "Palmetto Laundromat" or "Okafor Freight". No real companies are used.
- **A city.**
- **A location rating**, from rough area to prime location.
- **A quirk,** such as "Owner wants out fast", "Went viral last month" or "Needs new equipment".

The location and quirk change the price and the income. Each listing is labelled as a steal, a good deal, a fair price or overpriced. The board leans toward industries you haven't built up yet.

## Other features

- **Expanding** adds levels to a business. Its income doubles at levels 10, 25, 50 and 100.
- **Rising prices:** every level you own in an industry makes the next one in that industry 25% pricier.
- **Nine sectors** (Food, Auto, Tech and so on), each with three "double this sector" upgrades.
- **Events with choices:** buyout offers, a business going viral, surprise inspections, risky partner pitches, a hot economy, and lucky breaks.
- **Retiring:** start over for Legacy stars, each worth +10% to everything.
- **Your skyline:** a night skyline grows with one building for each business you own.
- **Saving, away earnings and controls** work the same way as in Paper Jam Tycoon.

## Pacing

These are the robot's times when it taps 3 times a second. A person will be slower.

| Milestone | Robot's time |
|---|---|
| Main Street businesses | about 6 minutes |
| Regional businesses | about 16 minutes |
| Big business | about 50 minutes |
| Global (airline, bank, chip factory) | about 2¼ hours |
| Retiring is worth about 10 stars | about 2¼ hours |

`TIER_PAYBACK` and `UNIT_GROWTH` near the top of `index.html` set the pace.

## Tests

- `tests/play.py` runs 43 click-through checks and takes screenshots. It also generates 3000 listings to check every name and number.
- `tests/sim.py` has a robot play 4 hours, both active and idle, and reports the pacing.
