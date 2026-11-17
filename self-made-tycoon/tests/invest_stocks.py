"""
invest_stocks.py - Checks the stock market (src/js/30-investments/stocks.js)
in the real page: it opens at tier 2, buying and selling, only profit
counting as earned, prices that grow on average at the planned pace,
crashes and the "buy the dip" event, time away, saving, and retiring.
Screenshots of the card go to tests/shots/.

    python3 tests/invest_stocks.py    (needs: pip install playwright, and Chrome)
"""
import os, math, statistics
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))
def near(a, b, tol=1e-6):
    return abs(a - b) <= tol * max(1, abs(a), abs(b))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    K = "T.invTests.stocks"
    # No random events, and stop the clock (lastTick in the future = the main
    # loop moves no prices and pays nothing), so numbers hold still between steps.
    FREEZE = "T.state.nextEventAt = Date.now() + 1e9; T.state.lastTick = Date.now() + 1e9;"
    page.evaluate("() => { " + FREEZE + " }")
    def close_modal():
        if page.locator("#modalBack.on").count(): page.click("#modalOk"); page.wait_for_timeout(100)

    # --- locked until tier 2 ---
    page.evaluate("() => { T.state.earnedRun = 3000; T.rebuildLists(); }")
    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-stocks"), "the stock card is locked before tier 2")
    page.evaluate("() => { T.state.earnedRun = 2e5; T.state.cash = 0; T.rebuildLists(); }"); page.wait_for_timeout(300)
    ok(page.locator("#inv-stocks .stk-row").count() == 5, "it opens at tier 2 with the index fund and four stocks")
    names = S(f"{K}.ASSETS.map(a => a.name)")
    ok(len(set(names)) == 5, f"all made-up names: {', '.join(names)}")
    ok(page.locator("#stk-buy-index").get_attribute("aria-disabled") == "true", "with no cash, Buy is greyed out")

    # --- buying ---
    page.evaluate("() => { T.state.cash = 10000; }"); page.wait_for_timeout(300)
    ok("$2,500" in page.text_content("#stk-buy-index"), "Buy offers a quarter of your cash")
    price = S("T.inv('stocks').price.index")
    page.click("#stk-buy-index"); page.wait_for_timeout(100)
    h = S("T.inv('stocks').hold.index")
    ok(near(S("T.state.cash"), 7500) and near(h["basis"], 2500) and near(h["shares"], 2500 / price), "it buys $2,500 of shares at today's price")
    ok(S("T.state.earnedRun") == 2e5, "buying isn't earning")

    # --- selling at a profit: only the profit counts as earned ---
    page.evaluate("() => { T.inv('stocks').price.index *= 1.2; T.rebuildLists(); }"); page.wait_for_timeout(300)
    ok("+20.0%" in page.text_content("#inv-stocks"), "the row shows what your holding is up")
    page.click("#stk-sell-index"); page.wait_for_timeout(100)
    ok(near(S("T.state.cash"), 7500 + 3000) and near(S("T.state.earnedRun"), 2e5 + 500), "selling pays $3,000, and only the $500 profit counts as earned")
    ok(S("T.inv('stocks').hold.index.shares") == 0 and near(S("T.inv('stocks').realized"), 500), "you own none afterwards, and the profit is tallied")
    # --- and at a loss ---
    S(f"{K}.buy('quill')")
    page.evaluate("() => { T.inv('stocks').price.quill *= 0.5; }")
    e0 = S("T.state.earnedRun"); c0 = S("T.state.cash"); v = S(f"{K}.value('quill')")
    S(f"{K}.sell('quill')")
    ok(near(S("T.state.cash"), c0 + v) and S("T.state.earnedRun") == e0, "a loss gives back what it's worth and takes nothing off your earnings")
    ok(S("T.inv('stocks').realized") < 500, "the loss comes off the stock profit tally")

    # --- prices grow at the planned pace on average ---
    # Run 600 one-period paths of 50 small steps each, from a fixed start
    # price, and look at the average and the spread of the end prices.
    sim = S(f"""(() => {{
      const s = T.inv('stocks'), out = {{ index: [], quill: [] }}, keep = JSON.stringify(s);
      for (let n = 0; n < 600; n++) {{
        s.price.index = 100; s.price.quill = 100;
        for (let i = 0; i < 50; i++) {K}.step(1 / 50);
        out.index.push(s.price.index / 100); out.quill.push(s.price.quill / 100);
      }}
      Object.assign(s, JSON.parse(keep)); return out; }})()""")
    page.evaluate("() => { T.inv('stocks').crashAt = 0; }")
    mi, mq = statistics.mean(sim["index"]), statistics.mean(sim["quill"])
    si, sq = statistics.pstdev(sim["index"]), statistics.pstdev(sim["quill"])
    ok(1.17 < mi < 1.40, f"the index fund grows about 25-30% per payback period on average ({mi - 1:+.0%}), well under a business's +100%")
    ok(sq > 2.5 * si, f"a wild stock swings far more than the index (spread {sq:.2f} vs {si:.2f})")
    ok(min(sim["quill"]) < 0.75, f"and can lose a lot in one period (worst {min(sim['quill']) - 1:+.0%})")
    ok(all(x > 0 and math.isfinite(x) for x in sim["index"] + sim["quill"]), "prices never hit zero or break")
    ok(near(S(f"{K}.period()"), 1500) and S("(T.state.earnedRun = 1e9, " + K + ".period())") == 25000, "the pace follows your tier (1500s at tier 2, 25000s at tier 4)")
    page.evaluate("() => { T.state.earnedRun = 2e5; }")

    # --- crashes and buying the dip ---
    before = S("T.inv('stocks').price.index")
    page.evaluate(f"() => {K}.crash(0.2)")
    ok(near(S("T.inv('stocks').price.index"), before * 0.8), "a crash knocks 20% off the index")
    ok(S("T.inv('stocks').crashes") == 1 and S("T.inv('stocks').crashAt") > 0, "and is counted")
    found = S("(() => { for (let i = 0; i < 300; i++) { const e = T.makeEvent(); if (e.title === 'Buy the dip?') return true; } return false; })()")
    ok(found, "after a crash, a 'Buy the dip?' event can come up")
    c0 = S("T.state.cash")
    # Take it the way the game does when you tap its green button
    page.evaluate("() => { for (let i = 0; i < 300; i++) { const e = T.makeEvent(); if (e.title === 'Buy the dip?') { T.activeEvent = e; T.chooseEvent(0); break; } } }")
    ok(near(S("T.inv('stocks').hold.index.basis"), c0 * 0.25), "taking it buys a quarter of your cash in the index")
    page.evaluate("() => { T.inv('stocks').crashAt = Date.now() - 5 * 60e3; }")
    gone = S("(() => { for (let i = 0; i < 300; i++) if (T.makeEvent().title === 'Buy the dip?') return false; return true; })()")
    ok(gone, "a few minutes after the crash, the offer stops coming up")

    # --- the chart and time away ---
    page.evaluate("() => { T.investEarn(8 * 3600); }")
    ok(S("T.inv('stocks').hist.index.length") == 48, "the chart keeps the last 48 points")
    ok(S("Object.values(T.inv('stocks').price).every(p => Number.isFinite(p) && p > 0)"), "8 hours away moves the prices without breaking anything")
    t = S("(() => { const t0 = performance.now(); T.investEarn(8 * 3600); return performance.now() - t0; })()")
    ok(t < 200, f"and takes no time to work out ({t:.0f} ms)")
    page.evaluate("() => { T.inv('stocks').hist.index = []; T.inv('stocks').histClock = 0; for (let i = 0; i < 70; i++) T.investEarn(1 / 60); }")
    ok(S("T.inv('stocks').hist.index.length") == 0, "a chart point is only added every 5 seconds, not every frame")

    # --- saving ---
    page.evaluate("() => { T.inv('stocks').price.arcus = 77; T.saveNow(); }")
    ok(S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.stocks.price.arcus") == 77, "prices and holdings are saved and loaded")
    bad = S("T.validState({ cash: 1, biz: [], inv: { stocks: { price: { index: -3, arcus: 'x' }, hold: { index: { shares: -1, basis: 5 } }, hist: { index: [1, NaN, 2] } } } }).inv.stocks")
    ok(bad["price"]["index"] == 100 and bad["price"]["arcus"] == 42 and bad["hold"]["index"]["shares"] == 0 and bad["hist"]["index"] == [1, 2],
       "broken prices, holdings and chart points in a save are cleaned up")

    # --- retiring starts the market over ---
    S(f"{K}.buy('index')")
    page.evaluate("() => { T.state.earnedAll = 4e9; T.retire(); " + FREEZE + " }"); close_modal()
    ok(S(f"{K}.portfolio()") == 0 and S("T.inv('stocks').price.index") == 100, "retiring sells up and starts the market over")

    # --- screenshots ---
    page.evaluate("() => { T.state.earnedRun = 2e5; T.state.cash = 40000; T.rebuildLists(); }")
    for _ in range(60): page.evaluate("() => T.investEarn(5)")
    S(f"{K}.buy('index')"); S(f"{K}.buy('arcus')"); S(f"{K}.buy('quill')")
    page.evaluate("() => { const s = T.inv('stocks'); s.price.arcus *= 1.1; s.price.quill *= 0.85; T.rebuildLists(); }")
    page.click("#tab-invest"); page.wait_for_timeout(400)
    page.locator("#inv-stocks").scroll_into_view_if_needed(); page.wait_for_timeout(200)
    page.screenshot(path=os.path.join(SHOTS, "deck_stocks.png"))
    page.click("#tab-set"); page.wait_for_timeout(200)
    ok("Stocks owned" in page.inner_text("#stats"), "the Stats tab lists your stocks")
    ok(not errors, f"no page errors {errors}")

    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []
    phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(500)
    phone.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e5; T.state.cash = 40000; T.rebuildLists(); for (let i = 0; i < 60; i++) T.investEarn(5); }")
    phone.evaluate("() => { T.invTests.stocks.buy('index'); T.invTests.stocks.buy('cobalt'); }")
    phone.click("#tab-invest"); phone.wait_for_timeout(300)
    phone.locator("#inv-stocks").scroll_into_view_if_needed(); phone.wait_for_timeout(300)
    phone.screenshot(path=os.path.join(SHOTS, "phone_stocks.png"))
    ok(phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), "the card fits a phone screen (no sideways scrolling)")
    ok(not perr, f"no page errors on the phone {perr}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
