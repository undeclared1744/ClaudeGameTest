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

## Investments: startups, franchising, partnerships

Each one is a single card on the Invest tab with one decision.

- **Startup stakes** (opens at Main Street): one founder pitch at a time. Fund it or pass. Due diligence (5% of the check) tells you whether it's weak, solid or a standout. Most startups fail; a rare one pays 50x to 100x. Results come in 12 to 20 minutes later, and you can back two at once. Funding blind roughly breaks even (about 1.1x); funding only the solid ones after due diligence returns about 1.7x. A bigger fund may offer to buy a promising stake early.
- **Franchising** (opens at Main Street): turn a business that's at level 10 or more with no problems into a brand, if it's a kind that really gets franchised (diners, gyms, hotels; not hospitals or airlines). Franchisees then open locations by themselves, each paying a fee and a royalty of 30% of a plain level-1 unit's income. The brand can grow to 3 locations per level of the business you franchised, and pays for itself in about 50 minutes at its starting size. A franchisee cutting corners can cost you locations if you look the other way.
- **Partnerships and private equity** (opens at Regional): join a made-up buyout fund on a big company, or pass. The fund's track record is shown up front: proven, steady, or first-time (riskier). Your share is locked up 20 to 30 minutes and returns about 1.6x on average; a deal can also go bad and return a quarter. Partners may ask for 25% more money to buy a rival.

Startups and deals are sized to about 4 and 10 minutes of your income, so together they add something like a fifth to a third to a careful player's earnings without replacing building the empire. Only profit counts toward tiers and Legacy, the same as selling a business. Retiring starts all three over.

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
- `tests/invest_startups.py` (44 checks), `tests/invest_franchising.py` (37) and `tests/invest_partnerships.py` (34) check each of those investment types: unlocking, the decision, payouts, events, the odds over thousands of rolls, broken saves, and the card on a phone.
- `tests/sim.py` has a robot play 4 hours, both active and idle, and reports the pacing.
