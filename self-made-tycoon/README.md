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

## Fixing up and selling businesses

Like a real small-business buyer, you can buy a business with problems cheaply, fix it, and sell it at a profit.

- **Hidden problems:** about 1 in 4 listings hides something the seller doesn't mention, such as staff who keep quitting, back taxes or a leaky roof. It earns less than it looks.
- **Due diligence:** pay 3% of the asking price to check a listing before you buy. Skip it and you might get a "Surprise!" the day you take over.
- **Fix-ups:** every problem can be fixed from the business's **Manage** button. Each fix is a quick mini game, then paid work that takes longer for bigger businesses:
  - *Answer the reviews:* pick the reply that wins back each angry customer.
  - *Clean up the books:* find the charge that was entered twice.
  - *Repair the machines:* press when the needle is in the green.
  - *Hire a good manager:* pick the best person you can afford.
  - A rough-area storefront just needs money and time for a renovation.
- **Selling:** buyers pay what the business is worth: the market price for its kind, times how well it does, times its size, minus 20% for haggling and fees. Finding a buyer takes time. A plain business sells for less than you paid, so you only profit by fixing things or buying a real bargain. Only the profit counts toward Legacy stars.

## Deal sense

You get better at finding deals the more of them you do. Checking, buying, fixing and selling earn XP, and the XP stays with you when you retire. There are six levels: cheaper due diligence, an extra listing, a "Something feels off" warning on listings that hide a problem, lower asking prices, off-market deals with faster refreshes, and finally free due diligence with one more listing.

## Other features

- **Expanding** adds levels to a business. Its income doubles at levels 10, 25, 50 and 100.
- **Rising prices:** every level you own in an industry makes the next one in that industry 25% pricier.
- **Nine sectors** (Food, Auto, Tech and so on), each with three "double this sector" upgrades.
- **Events with choices:** buyout offers, a business going viral, surprise inspections, risky partner pitches, a hot economy, and lucky breaks.
- **Retiring:** start over for Legacy stars, each worth +10% to everything.
- **Your skyline:** a night skyline grows with one building for each business you own.
- **Saving, away earnings and controls** work the same way as in Paper Jam Tycoon.

## Commodities and crypto (Invest tab)

Both open at the Main Street tier. Neither pays income: you make money only by buying low and selling high, which is the real lesson. Each market is one row with one decision, Buy or Sell, and a small 20-minute price chart.

- **Commodities:** gold barely moves, creeps up slowly, and jumps when bad news hits oil or grain. Oil rises in a hot economy and on supply news. Grain follows the seasons (one "year" per real hour) and weather news. News spikes fade over 15 to 30 minutes. Trades cost 1%, and you can hold up to about an hour of your business income.
- **Crypto:** three made-up coins. Blockbarn is the big one, a mid-size coin swings harder and can be rug-pulled, and a joke coin can 20x but usually goes to zero. When a coin dies, a new one lists in its place. About once every 10 hours the whole market crashes. Trades cost 2.5%, and you can put in up to about 30 minutes of your business income.
- **Events:** a drought warning, an oil supply cut, market jitters, a coin "trending" (usually a trap), and a Blockbarn halving. Each tells you roughly how often the forecast comes true.
- **Can't be farmed:** only the profit part of a sale counts toward unlocks and Legacy stars, and losses never take earnings away. Prices don't compound, the fees eat quick flipping, and the limits keep both a side bet next to your businesses. Holding a joke coin for 8 hours keeps about 40 to 50% of its value on average, and the typical one ends near zero. Prices come from a seeded random generator kept in the save, so reloading can't re-roll a crash.

## Pacing

These are the robot's times when it taps 3 times a second. A person will be slower.

| Milestone | Robot's time |
|---|---|
| Main Street businesses | about 6 minutes |
| Regional businesses | about 16 minutes |
| Big business | about 50 minutes |
| Global (airline, bank, chip factory) | about 2¼ hours |
| Retiring is worth about 10 stars | about 2¼ hours |

`TIER_PAYBACK` and `UNIT_GROWTH` in `src/js/01-data.js` set the pace.

## How the code fits together

The game ships as one self-contained `index.html`, which is what the published page and phones need. It's written as smaller files in `src/` so that several features can be built at the same time without everyone editing one giant file:

```
src/page.html            the page markup, with markers where the CSS and JS go
src/css/style.css        all the styles
src/js/00-…12-*.js       the core game: data, save, deals, businesses, fix-and-sell, screen, controls
src/js/20-invest.js      the plug-in point for investments, and the Invest tab
src/js/30-investments/   one file per investment type (real estate, loans, stocks, bonds,
                         startups, franchising, commodities, partnerships, crypto)
src/js/99-start.js       start-up, and handles for the tests
build.py                 bundles everything back into index.html
```

After editing anything in `src/`, run `python3 build.py`, then commit both `src/` and `index.html`. `python3 build.py --check` fails if `index.html` is out of date. All the `.js` files end up in one `<script>` in A-to-Z order, sharing one scope.

**Adding an investment type:** fill in its file in `src/js/30-investments/` and call `registerInvestment()`. It gets its own card on the Invest tab, its own part of the save, and hooks for earning money over time, events and stats, without editing the core files. `src/js/20-invest.js` documents every hook. The Invest tab stays hidden until at least one investment is built.

## Tests

`tests/run_all.sh` checks the build and runs everything below.

- `tests/play.py` runs 44 click-through checks and takes screenshots. It also generates 3000 listings to check every name and number.
- `tests/business.py` runs 51 checks on hidden problems, due diligence, all four mini games, repairs and selling, on a Steam Deck sized screen and a phone.
- `tests/scouting.py` runs 22 checks on Deal sense: XP, every level's perk, and keeping it through retiring and saving.
- `tests/invest_host.py` runs 18 checks on the investment plug-in point, using a test investment, including that a broken one can't crash the game.
- `tests/invest_commodities.py` runs 37 checks on gold, oil and grain: fees, the limit, profit-only earnings, 8 hours away, news events, bad saves, and a 200-market balance check.
- `tests/invest_crypto.py` runs 34 checks on crypto: made-up names, fees, the limit, rug pulls, bubbles, hype events, bad saves (including HTML in coin names), and a 400-market check that coins lose money on average.
- `tests/sim.py` has a robot play 4 hours, both active and idle, and reports the pacing.
