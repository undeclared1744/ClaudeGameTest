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

## Investing (Invest tab)

Besides running businesses, you can put money to work the ways real entrepreneurs do. Each investment is one card with one decision. They're paced by the same table as the businesses (`TIER_PAYBACK`), so the order stays the real one at every stage of the game: bonds earn least, then the index fund, then single stocks, and running a business beats them all. Safer means less.

- **Bank loans** (open at $2K earned). Borrow against your businesses: the bank lends up to half of what they'd sell for, a quarter of that per press. Interest is variable (35% of what a plain business at your tier earns per dollar) and comes out of your cash every 2 minutes. If you sell the businesses a loan rests on, the extra comes due with the next payment. Miss a payment and you get a 10% late fee and 60 seconds to find the money. After that the bank takes the business that best covers the debt, sells it for 75% of its value, and hands you what's left over. If there's nothing left to take, you go bankrupt: the loan is written off and no bank lends to you again until you retire.
- **Stock market** (opens at $100K earned). A whole-market index fund (slow, about +25% per payback period on average) and four made-up stocks (+30 to +45%, with far bigger swings). Buy puts in a quarter of your cash, and Sell sells all of that one. Now and then the market crashes, and a "Buy the dip?" event follows. Only the profit from selling counts as earned.
- **Bonds and CDs** (open at $2K earned). A 3-minute bank CD (the only one you can break early, losing the interest plus 5%), a 10-minute government bond, and a 30-minute corporate bond with the best rate but a 1 in 20 chance the company goes bust and pays back half. The interest is fixed when you buy. You can hold 8 at a time.

## Other features

- **Expanding** adds levels to a business. Its income doubles at levels 10, 25, 50 and 100.
- **Rising prices:** every level you own in an industry makes the next one in that industry 25% pricier.
- **Nine sectors** (Food, Auto, Tech and so on), each with three "double this sector" upgrades.
- **Events with choices:** buyout offers, a business going viral, surprise inspections, risky partner pitches, a hot economy, and lucky breaks. Investments can add their own, such as buying the dip after a crash.
- **Retiring:** start over for Legacy stars, each worth +10% to everything.
- **Your skyline:** grows with one building for each business you own. A new business rises out of the ground, expanding makes it taller, and a sold one sinks away. Small shops get striped awnings, the biggest businesses get antennas.
- **Day and night:** a full day passes every 12 minutes, with sunrise, clouds by day, sunset, and lit windows and stars at night. The left panel's color follows the sky. In Stats > Look and feel you can pin it to day or night, or follow your own clock.
- **Motion and feedback:** coins pop out of the Hustle button, the cash counts up and down smoothly and flashes green on a big gain, buying a business throws confetti, level milestones sparkle, and selling a business makes it rain coins. If your device asks for reduced motion (or you pick Calm in Look and feel), none of that moves: numbers just change.
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
src/js/11-skyline.js     the skyline and the day/night cycle
src/js/13-fx.js          motion and feedback (coins, confetti, cash count-up), Look and feel settings
src/js/20-invest.js      the plug-in point for investments, and the Invest tab
src/js/30-investments/   one file per investment type (real estate, loans, stocks, bonds,
                         startups, franchising, commodities, partnerships, crypto)
src/js/99-start.js       start-up, and handles for the tests
build.py                 bundles everything back into index.html
```

After editing anything in `src/`, run `python3 build.py`, then commit both `src/` and `index.html`. `python3 build.py --check` fails if `index.html` is out of date. All the `.js` files end up in one `<script>` in A-to-Z order, sharing one scope.

**Look of an investment card:** `src/css/style.css` has a "THEME KIT" section with ready-made pieces (title row with a big number, label/value list, progress meter, price chart, holdings list, button row), and `13-fx.js` offers `sparkline(canvas, values)` for charts and `fxBurst(element, "buy" | "sale" | "spark")` for celebrations.

**Adding an investment type:** fill in its file in `src/js/30-investments/` and call `registerInvestment()`. It gets its own card on the Invest tab, its own part of the save, and hooks for earning money over time, events and stats, without editing the core files. `src/js/20-invest.js` documents every hook. Every module lives in its own scope (`(() => { ... })();`), since all files share one `<script>` and two files using the same name would break the whole game.

## Tests

`tests/run_all.sh` checks the build and runs everything below.

- `tests/play.py` runs 44 click-through checks and takes screenshots. It also generates 3000 listings to check every name and number.
- `tests/business.py` runs 51 checks on hidden problems, due diligence, all four mini games, repairs and selling, on a Steam Deck sized screen and a phone.
- `tests/scouting.py` runs 22 checks on Deal sense: XP, every level's perk, and keeping it through retiring and saving.
- `tests/look.py` runs 37 checks on the day/night sky, the Look and feel settings, the effects (confetti, coins, cash count-up), calm mode, drawing speed, and the Steam Deck and phone layouts.
- `tests/invest_host.py` runs 16 checks on the investment plug-in point, using a test investment, including that a broken one can't crash the game.
- `tests/invest_loans.py` runs 47 checks on loans: the credit limit, interest, on-time and missed payments, the bank taking a business, bankruptcy, paying back, time away and saving.
- `tests/invest_stocks.py` runs 33 checks on stocks: buying and selling, only profit counting as earned, growth and swings over 600 simulated periods, crashes and buying the dip, time away and saving.
- `tests/invest_bonds.py` runs 35 checks on bonds and CDs: fixed interest, maturity, breaking a CD, corporate busts over 4000 bonds, the 8-bond limit, time away and saving.
- `tests/sim.py` has a robot play 4 hours, both active and idle, and reports the pacing.
