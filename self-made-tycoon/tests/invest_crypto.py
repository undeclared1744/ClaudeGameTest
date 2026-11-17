"""
invest_crypto.py - Checks the Crypto card (src/js/30-investments/crypto.js):
made-up coins swing (also while you're away), buying and selling charge the
2.5% fee, the 30-minutes-of-income limit holds, only profit counts as
earnings, rug pulls wipe a coin and list a new one, hype events, bad saves
are cleaned up, and above all that crypto can't be farmed for free money.
Screenshots go to tests/shots/.

    python3 tests/invest_crypto.py   (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

# Real coin names that must never show up (the coins are all made up)
REAL = ["bitcoin", "ethereum", "doge", "litecoin", "solana", "ripple", "cardano", "tether", "shiba", "monero", "bytecoin"]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    C = "T.invTests.crypto"
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; }")

    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-crypto"), "the card is locked for a new player")
    page.evaluate("() => { T.state.earnedRun = 2e5; T.state.cash = 1e5; T.rebuildLists(); }"); page.wait_for_timeout(400)
    ok(page.locator("#cry-buy-big").count() == 1, "it opens at the Main Street tier")
    ok(S(f"{C}.cap()") == 10000, "with little income the limit is the $10K floor")
    coins = S("Object.values(T.inv('crypto').c).map(c => c.name + ' ' + c.sym)")
    ok(coins[0] == "Blockbarn BARN" and len(coins) == 3, f"three coins: {coins}")

    # --- names are always made up ---
    names = S("""(() => { const out = new Set(); for (let i = 0; i < 300; i++) { out.add(T.invTests.crypto.newCoin('alt').name); out.add(T.invTests.crypto.newCoin('meme').name); } return [...out]; })()""")
    ok(not any(r in n.lower() for n in names for r in REAL), f"{len(names)} generated coin names, none of them a real coin")

    # --- buying and selling ---
    cash0 = S("T.state.cash"); pr = S("T.inv('crypto').c.meme.p")
    page.click("#cry-buy-meme"); page.wait_for_timeout(100)
    c = S("T.inv('crypto').c.meme")
    ok(abs(cash0 - S("T.state.cash") - 2500) < 0.01 and abs(c["units"] * pr - 2500 * 0.975) < 0.01, "Buy puts in a quarter of the limit, minus the 2.5% fee")
    for _ in range(5): page.click("#cry-buy-big", force=True); page.wait_for_timeout(50)   # force: the last presses are greyed out on purpose
    ok(abs(S(f"{C}.room()")) < 0.01 and S("T.inv('crypto').c.big.cost") == 7500, "buying stops at the limit")
    run0 = S("T.state.earnedRun"); cash0 = S("T.state.cash")
    page.evaluate("() => { T.inv('crypto').c.big.p *= 3; }")
    page.click("#cry-sell-big"); page.wait_for_timeout(100)
    expect = 7500 * 0.975 * 3 * 0.975
    ok(abs(S("T.state.cash") - cash0 - expect) < 0.5 and abs(S("T.state.earnedRun") - run0 - (expect - 7500)) < 0.5,
       f"cashing out a 3x pays {expect:.0f}, and only the profit counts as earnings")
    ok(S(f"{C}.room()") == 7500, "cashing out frees the room again")

    # --- rug pull ---
    old = S("T.inv('crypto').c.meme.name"); run0 = S("T.state.earnedRun"); prof0 = S("T.inv('crypto').profit")
    msgs = S(f"{C}.kill('meme')")
    ok(S("T.inv('crypto').c.meme.name") != old and S("T.inv('crypto').c.meme.units") == 0, "a rug pull wipes the coin and lists a new one")
    ok(S("T.inv('crypto').profit") == prof0 - 2500 and S("T.inv('crypto').rugs") == 1 and S("T.state.earnedRun") == run0, "you lose what you put in (counted in the stats, not taken from earnings)")
    ok(S(f"{C}.room()") == 10000, "and the dead coin no longer uses up your limit")
    page.wait_for_timeout(400)
    ok(S("T.inv('crypto').c.meme.name") in page.text_content("#inv-crypto"), "the card shows the new coin")
    # a coin falling to 1/1000 of its launch price is delisted
    page.evaluate("() => { const c = T.inv('crypto').c.alt; c.p = c.launch / 2000; c.units = 1; c.cost = 100; }")
    old = S("T.inv('crypto').c.alt.name"); page.evaluate(f"() => {C}.steps(1)")
    ok(S("T.inv('crypto').c.alt.name") != old, "a coin that crashes to almost nothing is delisted")
    ok(S("T.inv('crypto').c.big.name") == "Blockbarn", "Blockbarn never rug-pulls (it's the 'established' one)")

    # --- hype event ---
    page.evaluate("() => { T.state.cash = 1e5; T.inv('crypto').c.meme.units = 0; T.inv('crypto').c.meme.cost = 0; T.inv('crypto').c.alt.units = 1; T.inv('crypto').c.alt.cost = 1; }")
    ev = S(f"{C}.events().map(f => f().title)")
    meme = S("T.inv('crypto').c.meme.sym")
    ok(ev == [meme + " is trending", "Blockbarn halving"], "hype is only offered for coins you don't hold (so ignoring can't dodge bad news)")
    page.evaluate("() => { const e = T.invTests.crypto.events()[0](); T.activeEvent = e; T.chooseEvent(0); }")
    ok(S("T.inv('crypto').c.meme.units") > 0 and S("T.inv('crypto').c.meme.shocks.length") >= 1, "'Buy the hype' buys a lot and the hype plays out")
    page.evaluate("() => { const c = T.inv('crypto').c; for (const k in c) { c[k].units = 1; c[k].cost = 1; } }")
    ok(S(f"{C}.events().length") == 0, "holding every coin: no crypto events")

    # --- same seed -> same future ---
    same = S("""(() => { const st = T.inv('crypto'), copy = JSON.parse(JSON.stringify(st));
        T.invTests.crypto.steps(300); const a = JSON.stringify(Object.values(st.c).map(c => [c.name, c.p]));
        T.state.inv.crypto = T.invTests.crypto.validate(copy); T.invTests.crypto.steps(300);
        return JSON.stringify(Object.values(T.inv('crypto').c).map(c => [c.name, c.p])) === a; })()""")
    ok(same, "the same save always gives the same future (reloading can't dodge a crash)")
    s0 = S("T.inv('crypto').steps"); page.evaluate("() => T.earnBetween(Date.now(), Date.now() + 8 * 3600e3)")
    ok(S("T.inv('crypto').steps") - s0 == 5760, "8 hours away moves the market 8 hours")

    # --- bad saves ---
    ok(S("T.validState({ cash: 1, biz: [], inv: { crypto: 7 } }).inv.crypto.c.big.name") == "Blockbarn", "a junk save starts fresh")
    v = S("T.invTests.crypto.validate({ c: { meme: { name: '<img src=x onerror=alert(1)>', sym: 'a<b>cdefg', launch: 0.05, p: 1e9, units: -4, cost: 50 } } })")
    ok("<" not in v["c"]["meme"]["name"] and "<" not in v["c"]["meme"]["sym"] and len(v["c"]["meme"]["sym"]) <= 5, "names from a save can't carry HTML")
    ok(v["c"]["meme"]["p"] <= 0.05 * 1000 and v["c"]["meme"]["units"] == 0 and v["c"]["meme"]["cost"] == 0, "silly prices and holdings are fixed")

    # --- balance: crypto must not be free money ---
    # 400 random markets, holding $1 of each coin for 8 hours (dead coins count as 0).
    ev = S("""(() => { const N = 400, out = { big: 0, alt: 0, meme: 0 }, med = { big: [], alt: [], meme: [] };
        for (let i = 0; i < N; i++) { T.state.inv.crypto = T.invTests.crypto.fresh(); const st = T.inv('crypto'); st.seed = i * 104729 + 1;
          const start = {}; for (const k in out) { start[k] = st.c[k].name; st.c[k].units = 1 / st.c[k].p; st.c[k].cost = 1; }
          T.invTests.crypto.steps(5760);
          for (const k in out) { const c = st.c[k], v = c.name === start[k] ? c.units * c.p : 0; out[k] += v / N; med[k].push(v); } }
        for (const k in med) { med[k].sort((a, b) => a - b); med[k] = med[k][N >> 1]; }
        return { mean: out, median: med }; })()""")
    m, md = ev["mean"], ev["median"]
    print(f"     8h hold, mean: BARN x{m['big']:.2f}  alt x{m['alt']:.2f}  meme x{m['meme']:.2f};  median: x{md['big']:.2f} x{md['alt']:.2f} x{md['meme']:.2f}")
    ok(m["meme"] < 1.0 and md["meme"] < 0.5, "meme coins lose on average, and the typical one loses most of its value")
    ok(m["alt"] < 1.1, "alt coins don't grow on average")
    ok(m["big"] < 1.4, "Blockbarn grows only a little on average (and the stake is capped)")
    # Flipping: buy and sell straight away always loses the two fees
    page.evaluate("() => { T.state.inv.crypto = T.invTests.crypto.fresh(); T.state.cash = 1e5; }")
    c0 = S("T.state.cash"); page.evaluate(f"() => {{ for (let i = 0; i < 20; i++) {{ {C}.buy('big'); {C}.sell('big'); }} }}")
    lost = c0 - S("T.state.cash"); fees = 20 * 2500 * (1 - 0.975 ** 2)
    ok(abs(lost - fees) < 1, f"buying and selling 20 times in a row just burns {lost:.0f} in fees")
    # Bubble: a coin parked far above launch pops sooner or later
    pop = S("""(() => { const st = T.inv('crypto'), c = st.c.meme; c.p = c.launch * 200; c.shocks = [];
        T.invTests.crypto.steps(720); return st.c.meme !== c || st.c.meme.p < c.launch * 200 * 0.5; })()""")
    ok(pop, "a coin in a bubble (200x its launch) pops within an hour")

    # --- retire resets it ---
    page.evaluate("() => { T.inv('crypto').c.big.units = 5; T.state.earnedAll = 4e9; T.retire(); }")
    ok(S("T.inv('crypto').c.big.units") == 0, "retiring starts crypto over")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")

    # --- screenshots ---
    page.evaluate("""() => { T.state.earnedRun = 2e5; T.state.cash = 5e4; T.state.inv.crypto = T.invTests.crypto.fresh();
        T.invTests.crypto.steps(240); T.invTests.crypto.buy('big'); T.invTests.crypto.buy('meme'); T.rebuildLists(); T.showTab('invest'); }""")
    page.wait_for_timeout(500)
    page.locator("#inv-crypto").screenshot(path=os.path.join(SHOTS, "crypto_card.png"))
    ok("Cash out" in page.inner_text("#inv-crypto") and "Room left" in page.inner_text("#inv-crypto"), "the card shows holdings and the room left")
    ok(not errors, f"no page errors {errors}")

    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []; phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(500)
    phone.evaluate("""() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e5; T.state.cash = 5e4; T.invTests.crypto.steps(240);
        T.invTests.crypto.buy('alt'); T.rebuildLists(); T.showTab('invest'); }""")
    phone.wait_for_timeout(500)
    phone.locator("#inv-crypto").screenshot(path=os.path.join(SHOTS, "crypto_phone.png"))
    ok(phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), "on a phone the card fits without sideways scrolling")
    phone.evaluate("() => { window.requestAnimationFrame = () => 0; }"); phone.wait_for_timeout(100)   # pause the loop so the hand-made event stays up
    phone.evaluate("() => { T.activeEvent = T.invTests.crypto.events()[0](); T.showEvent(); }")
    phone.screenshot(path=os.path.join(SHOTS, "crypto_event_phone.png"))
    ok("trending" in phone.text_content("#event"), "the hype event shows on a phone")
    ok(not perr, f"no page errors on the phone {perr}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
