"""
invest_commodities.py - Checks the Commodities card (src/js/30-investments/
commodities.js): gold, oil and grain prices move (also while you're away),
buying and selling charge the 1% fee, the hour-of-income limit holds, only
profit counts as earnings, news events work, bad saves are cleaned up, and
the balance can't be farmed. Screenshots go to tests/shots/.

    python3 tests/invest_commodities.py   (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    C = "T.invTests.commodities"
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; }")

    # --- locked until Main Street ---
    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-commodities"), "the card is locked for a new player")
    page.evaluate("() => { T.state.earnedRun = 2e5; T.state.cash = 1e5; T.rebuildLists(); }"); page.wait_for_timeout(400)
    ok(page.locator("#cmd-buy-gold").count() == 1, "it opens at the Main Street tier ($100K earned)")
    ok(S(f"{C}.cap()") == 25000, "with little income the limit is the $25K floor")

    # --- buying and selling ---
    gold = S("T.inv('commodities').a.gold.p"); cash0 = S("T.state.cash")
    page.click("#cmd-buy-gold"); page.wait_for_timeout(100)
    a = S("T.inv('commodities').a.gold")
    ok(abs(cash0 - S("T.state.cash") - 6250) < 0.01 and a["cost"] == 6250, "Buy puts in a quarter of the limit ($6,250)")
    ok(abs(a["units"] * gold - 6250 * 0.99) < 0.01, "and the 1% fee comes off what you get")
    for _ in range(5): page.click("#cmd-buy-oil", force=True); page.wait_for_timeout(50)   # force: the last presses are greyed out on purpose
    ok(abs(S(f"{C}.room()")) < 0.01 and S("T.inv('commodities').a.oil.cost") == 18750, "buying stops at the limit")
    ok(page.get_attribute("#cmd-buy-grain", "aria-disabled") == "true", "and the Buy buttons grey out")
    run0 = S("T.state.earnedRun"); cash0 = S("T.state.cash")
    page.evaluate("() => { T.inv('commodities').a.oil.p *= 1.2; }")
    page.click("#cmd-sell-oil"); page.wait_for_timeout(100)
    got = S("T.state.cash") - cash0; expect = 18750 * 0.99 * 1.2 * 0.99
    ok(abs(got - expect) < 0.5, f"selling after a 20% rise pays {got:.0f} (both fees taken)")
    ok(abs(S("T.state.earnedRun") - run0 - (expect - 18750)) < 0.5, "only the profit counts as earnings")
    run0 = S("T.state.earnedRun"); prof0 = S("T.inv('commodities').profit")
    page.evaluate("() => { T.inv('commodities').a.gold.p *= 0.5; }")
    page.click("#cmd-sell-gold"); page.wait_for_timeout(100)
    ok(S("T.state.earnedRun") == run0 and S("T.inv('commodities').profit") < prof0, "a loss doesn't take away earnings, but shows in the profit stat")
    ok(S(f"{C}.sell('gold')") is False, "selling with nothing held does nothing")
    page.evaluate("() => { T.state.cash = 0; }")
    ok(S(f"{C}.buy('gold')") is False and S("T.state.cash") == 0, "buying with no cash does nothing")

    # --- the limit grows with income ---
    page.evaluate("() => { T.state.biz.push({ id: 900, ind: 'diner', name: 'Test Diner', city: 'X', loc: 0, quirk: null, incMult: 1, level: 50, paid: 1, viralUntil: 0, inspectUntil: 0, hidden: null, fixing: null, selling: null, fixRetryAt: 0 }); }")
    ok(abs(S(f"{C}.cap()") - S("T.baseIncome() * 3600")) < 1, "with real income the limit is an hour of business income")

    # --- prices move ---
    page.evaluate("() => { T.inv('commodities').a = T.invTests.commodities.fresh().a; T.state.cash = 1e9; }")
    p0 = S("JSON.stringify(Object.values(T.inv('commodities').a).map(a => a.p))")
    page.evaluate("() => T.invTests.commodities.steps(120)")
    ok(S("JSON.stringify(Object.values(T.inv('commodities').a).map(a => a.p))") != p0, "prices change as time passes")
    ok(S("T.inv('commodities').a.gold.hist.length") == 40, "a new market already has 20 minutes of chart (40 points)")
    last = S("T.inv('commodities').a.gold.hist.at(-1)"); page.evaluate("() => T.invTests.commodities.steps(6)")
    ok(S("T.inv('commodities').a.gold.hist.length") == 40 and S("T.inv('commodities').a.gold.hist.at(-2)") == last, "a new chart point every 30 seconds, keeping the last 40")
    # same seed -> same future (reloading can't re-roll)
    same = S("""(() => { const st = T.inv('commodities'), copy = JSON.parse(JSON.stringify(st));
        T.invTests.commodities.steps(200); const a = st.a.oil.p;
        T.state.inv.commodities = T.invTests.commodities.validate(copy); T.invTests.commodities.steps(200); return Math.abs(T.inv('commodities').a.oil.p - a) < 1e-9; })()""")
    ok(same, "the same save always gives the same future prices (no re-rolling by reloading)")
    # 8 hours away
    page.evaluate("() => { const a = T.inv('commodities').a; a.grain.units = 1000; a.grain.cost = 6500; }")
    s0 = S("T.inv('commodities').steps"); page.evaluate("() => T.earnBetween(Date.now(), Date.now() + 8 * 3600e3)")
    ok(S("T.inv('commodities').steps") - s0 == 5760, "8 hours away moves the market 8 hours (5,760 steps)")
    ok(S("Object.values(T.inv('commodities').a).every(a => a.p > 0 && isFinite(a.p))"), "prices stay positive numbers")

    # --- news shocks and fair price ---
    page.evaluate("() => { const st = T.inv('commodities'); st.a.oil.p = T.invTests.commodities.fair('oil'); st.a.oil.shocks = []; }")
    o0 = S("T.inv('commodities').a.oil.p")
    page.evaluate("() => { T.invTests.commodities.addShock('oil', Math.log(1.5), 60); T.invTests.commodities.steps(12); }")
    ok(S("T.inv('commodities').a.oil.p") / o0 > 1.3, "a news shock moves the price within a minute")
    page.evaluate("() => T.invTests.commodities.steps(720)")
    ok(abs(S("T.inv('commodities').a.oil.p / T.invTests.commodities.fair('oil')") - 1) < 0.25, "and an hour later it has drifted back toward normal")

    # --- events ---
    titles = S("T.invTests.commodities.events().map(f => f().title)")
    ok(titles == ["Drought warning", "Oil supply cut", "Market jitters"], "three news events")
    page.evaluate("() => { T.state.cash = 1e6; T.inv('commodities').a.grain.units = 0; T.inv('commodities').a.grain.cost = 0; T.activeEvent = T.invTests.commodities.events()[0](); T.showEvent(); }")
    n0 = S("T.inv('commodities').a.grain.shocks.length")
    # (pressed straight away: an event set by hand has no "shown at" time, so the game would close it on the next frame)
    page.evaluate("() => { T.activeEvent = T.invTests.commodities.events()[0](); T.chooseEvent(0); }")
    ok(S("T.inv('commodities').a.grain.units") > 0 and S("T.inv('commodities').a.grain.shocks.length") == n0 + 1, "'Buy grain' buys a lot and the news moves grain")
    ok(S("T.makeEvent && (() => { for (let i = 0; i < 300; i++) if (['Drought warning','Oil supply cut','Market jitters'].includes(T.makeEvent().title)) return true; return false; })()"),
       "the events can pop up in the game")

    # --- bad saves ---
    ok(S("T.validState({ cash: 1, biz: [], inv: { commodities: 'junk' } }).inv.commodities.a.gold.units") == 0, "a junk save starts fresh")
    v = S("T.invTests.commodities.validate({ seed: 5, t: -9, a: { gold: { p: -5, units: 'x', cost: 9, hist: [1, 'a', NaN, 2], shocks: [{m: 1e9, dur: 5, left: 5}, null] }, oil: { p: 1e99, units: 3, cost: 300 } } })")
    ok(v["t"] == 0 and v["a"]["gold"]["p"] > 0 and v["a"]["gold"]["units"] == 0 and v["a"]["gold"]["cost"] == 0, "bad numbers are fixed (no units means nothing paid in)")
    ok(v["a"]["gold"]["hist"] == [1, 2] and v["a"]["gold"]["shocks"][0]["m"] == 3, "bad chart points are dropped and wild shocks are capped")
    ok(v["a"]["oil"]["p"] <= 80 * 5 and v["a"]["oil"]["units"] == 3, "a crazy saved price is pulled back near normal")

    # --- balance: no free money ---
    # Holding for 8 hours, averaged over 200 random markets: gold creeps up
    # (linear, ~+32% of base), oil and grain average about flat.
    ev = S("""(() => { const out = { gold: 0, oil: 0, grain: 0 }, N = 200;
        for (let i = 0; i < N; i++) { T.state.inv.commodities = T.invTests.commodities.fresh(); T.inv('commodities').seed = i * 7919;
          const a = T.inv('commodities').a, p0 = {}; for (const k in out) p0[k] = a[k].p;
          T.invTests.commodities.steps(5760); for (const k in out) out[k] += a[k].p / p0[k] / N; }
        return out; })()""")
    ok(1.15 < ev["gold"] < 1.45, f"gold over 8 hours averages x{ev['gold']:.2f} (slow, straight-line growth)")
    ok(0.85 < ev["oil"] < 1.15 and 0.85 < ev["grain"] < 1.15, f"oil x{ev['oil']:.2f} and grain x{ev['grain']:.2f} average about flat: no free growth")
    # Perfect timing of the grain seasons, with the fee: best case per hour
    best = S("""(() => { T.state.inv.commodities = T.invTests.commodities.fresh(); const f = T.invTests.commodities.fair, st = T.inv('commodities');
        let lo = 1e9, hi = 0; for (let i = 0; i < 720; i++) { st.t = i * 5; const v = f('grain'); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return hi / lo * 0.99 * 0.99 - 1; })()""")
    ok(best < 0.10, f"perfectly timing a grain season makes at most {best*100:.1f}% of the stake per hour (stake is capped at an hour of income)")

    # --- retire resets it ---
    page.evaluate("() => { T.inv('commodities').a.gold.units = 5; T.state.earnedAll = 4e9; T.retire(); }")
    ok(S("T.inv('commodities').a.gold.units") == 0, "retiring starts commodities over")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")

    # --- screenshots: desktop and phone ---
    page.evaluate("""() => { T.state.earnedRun = 2e5; T.state.cash = 5e4; T.state.inv.commodities = T.invTests.commodities.fresh();
        T.invTests.commodities.steps(240); T.invTests.commodities.buy('gold'); T.invTests.commodities.buy('grain'); T.rebuildLists(); T.showTab('invest'); }""")
    page.wait_for_timeout(500)
    page.locator("#inv-commodities").screenshot(path=os.path.join(SHOTS, "commodities_card.png"))
    ok("You hold" in page.inner_text("#inv-commodities") and "Room left" in page.inner_text("#inv-commodities"), "the card shows holdings and the room left")
    ok(not errors, f"no page errors {errors}")

    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []; phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(500)
    phone.evaluate("""() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e5; T.state.cash = 5e4; T.invTests.commodities.steps(240);
        T.invTests.commodities.buy('oil'); T.rebuildLists(); T.showTab('invest'); }""")
    phone.wait_for_timeout(500)
    phone.screenshot(path=os.path.join(SHOTS, "commodities_phone.png"), full_page=True)
    wide = phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
    ok(wide, "on a phone the card fits without sideways scrolling")
    # The event pop-up on a phone. The game loop is paused first: an event
    # put up by hand has no "shown at" time, so the next frame would close it.
    phone.evaluate("() => { window.requestAnimationFrame = () => 0; }"); phone.wait_for_timeout(100)
    phone.evaluate("() => { T.activeEvent = T.invTests.commodities.events()[0](); T.showEvent(); }")
    phone.screenshot(path=os.path.join(SHOTS, "commodities_event_phone.png"))
    ok("Drought warning" in phone.text_content("#event"), "the drought event shows its title and choices")
    ok(not perr, f"no page errors on the phone {perr}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
