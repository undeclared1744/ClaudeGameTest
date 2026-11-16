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

## Real estate

The first investment on the Invest tab, open from the second tier (Small business owner). It's one card with one decision at a time: a single property is for sale, and you pass on it, buy it with cash, or buy it with a mortgage (20% down).

- **Rent** comes in every second. Property pays back half as fast as a business of the same size, but it runs itself.
- **The market** is one number that every rent and value follows. It moves every minute, up about 6% an hour on average, with swings. The card shows the last half hour.
- **Mortgages** let you own more with the same cash, but the payment stays the same when the market drops. Run out of cash and the bank forecloses on the property losing you the most. Overpaying for a renovated place can make the payment bigger than the rent, and the listing says so.
- **Condition:** fixer-uppers are cheap and rent for less. Renovating moves a property up a step (Fixer-upper, Dated, Good, Renovated), raising rent and value.
- **Selling** costs 6% in fees and takes time. If the market crashed and the sale won't cover the loan, it's a short sale and the bank takes the loss.
- **Tenant's offer:** a tenant may offer above market for the place they rent, with no fees.

Everything is in `src/js/30-investments/real-estate.js`.

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
- `tests/invest_real_estate.py` runs 64 checks on real estate: buying, mortgages (against a step-by-step check), 8 hours away, foreclosure, renovating, selling, a short sale, the market, the tenant's offer, damaged saves, and the card on a phone.
- `tests/sim.py` has a robot play 4 hours, both active and idle, and reports the pacing.
