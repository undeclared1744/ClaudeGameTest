"""
invest_bonds.py - Checks bonds and CDs (src/js/30-investments/bonds.js) in
the real page: buying locks the money up, interest is fixed when you buy,
paying out at maturity (also after time away), breaking a CD early,
corporate bonds that go bust, the holding limit, saving, and retiring.
Screenshots of the card go to tests/shots/.

    python3 tests/invest_bonds.py    (needs: pip install playwright, and Chrome)
"""
import os
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
    K = "T.invTests.bonds"
    # No random events, and the main loop pays no income (lastTick in the future)
    FREEZE = "T.state.nextEventAt = Date.now() + 1e9; T.state.lastTick = Date.now() + 1e9;"
    page.evaluate("() => { " + FREEZE + " }")
    def close_modal():
        if page.locator("#modalBack.on").count(): page.click("#modalOk"); page.wait_for_timeout(100)

    # --- locked until tier 1 ---
    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-bonds"), "the bonds card is locked at the start")
    page.evaluate("() => { T.state.earnedRun = 3000; T.state.cash = 0; T.rebuildLists(); }"); page.wait_for_timeout(300)
    ok(page.locator("#inv-bonds .bnd-prod").count() == 3, "it opens at tier 1 with a CD, a government bond and a corporate bond")
    ok(page.locator("#bnd-buy-cd").get_attribute("aria-disabled") == "true", "with no cash, Buy is greyed out")

    # --- rates: longer and riskier pays more, always less than a business ---
    rates = S(f"{K}.PRODUCTS.map(p => {K}.rateFor(p))")
    terms = S(f"{K}.PRODUCTS.map(p => p.term)")
    ok(rates[0] < rates[1] < rates[2], f"longer, riskier bonds pay more ({', '.join(f'{r:.1%}' for r in rates)})")
    ok(all(r < t / 300 for r, t in zip(rates, terms)), "every one pays less than a tier 1 business would earn in the same time")
    ok(near(rates[1], 0.15 * 600 / 1500), "rates follow the pacing table (tier 2 rates at the lowest)")
    page.evaluate("() => { T.state.earnedRun = 1e9; }")
    ok(S(f"{K}.rateFor({K}.PRODUCTS[1])") < rates[1] / 10, "and fall as you grow, like everything else")
    page.evaluate("() => { T.state.earnedRun = 3000; }")

    # --- buying locks money up, with the interest fixed ---
    page.evaluate("() => { T.state.cash = 10000; T.rebuildLists(); }"); page.wait_for_timeout(300)
    ok("$2,500" in page.text_content("#bnd-buy-gov"), "Buy offers a quarter of your cash")
    page.click("#bnd-buy-gov"); page.wait_for_timeout(300)
    h = S("T.inv('bonds').held[0]")
    ok(near(S("T.state.cash"), 7500) and near(h["amount"], 2500), "buying takes the money")
    ok(near(h["interest"], 2500 * rates[1]) and near(h["matures"] - h["boughtAt"], 600e3), "the interest is fixed and it matures in 10 minutes")
    ok("matures in" in page.text_content("#bndHeld") and page.locator("#bndHeld .smallbtn").count() == 0,
       "it shows in your list with a countdown, and a bond has no way out early")
    page.evaluate("() => { T.state.earnedRun = 1e9; T.investTick(Date.now()); T.state.earnedRun = 3000; }")
    ok(near(S("T.inv('bonds').held[0].interest"), 2500 * rates[1]), "growing a tier later doesn't change what it pays")

    # --- maturity ---
    e0 = S("T.state.earnedRun"); c0 = S("T.state.cash")
    page.evaluate("() => { T.inv('bonds').held[0].matures = Date.now() - 1; T.investTick(Date.now()); }")
    ok(S("T.inv('bonds').held.length") == 0 and near(S("T.state.cash"), c0 + h["amount"] + h["interest"]), "when it matures you get the money back plus interest")
    ok(near(S("T.state.earnedRun"), e0 + h["interest"]), "only the interest counts as earned")
    ok(near(S("T.inv('bonds').interestEarned"), h["interest"]), "interest is tallied")

    # --- breaking a CD early ---
    page.click("#tab-invest")
    page.evaluate("() => { T.state.cash = 8000; T.rebuildLists(); }"); page.wait_for_timeout(300)
    page.click("#bnd-buy-cd"); page.wait_for_timeout(300)
    ok(page.locator("#bndHeld .smallbtn").count() == 1, "a CD has a Break button")
    e0 = S("T.state.earnedRun"); c0 = S("T.state.cash")
    page.click("#bndHeld .smallbtn"); page.wait_for_timeout(100)
    ok(near(S("T.state.cash"), c0 + 2000 * 0.95) and S("T.state.earnedRun") == e0, "breaking it gives back 95%, no interest, nothing earned")
    ok(S("T.inv('bonds').held.length") == 0, "and it's gone")
    ok(not S(f"(() => {{ T.state.cash = 1000; {K}.buy('gov'); return {K}.breakCd(T.inv('bonds').held[0].id); }})()"), "a government bond can't be broken")
    page.evaluate("() => { T.inv('bonds').held = []; }")

    # --- corporate bonds can go bust ---
    outcome = S(f"""(() => {{
      const s = T.inv('bonds'); let busts = 0; const n = 4000;
      for (let i = 0; i < n; i++) {{
        T.state.cash = 400; {K}.buy('corp');
        s.held[0].matures = 0; const c0 = T.state.cash; {K}.matureDue(Date.now());
        if (T.state.cash - c0 < 100) busts++;     // got back 50 of the 100 instead of 100+interest
      }}
      return {{ rate: busts / n, defaults: s.defaults, lost: s.lost }}; }})()""")
    ok(0.035 < outcome["rate"] < 0.065, f"about 1 corporate bond in 20 goes bust ({outcome['rate']:.1%})")
    ok(near(outcome["lost"], outcome["defaults"] * 50), "and pays back only half")
    exp = 0.95 * (1 + rates[2]) + 0.05 * 0.5
    # compare per second of being locked up, since the terms differ
    ok((exp - 1) / terms[2] > rates[1] / terms[1], f"even counting busts, it pays more per minute on average than a government bond ({exp - 1:.1%} in 30 min vs {rates[1]:.1%} in 10)")
    index_30min = S("Math.exp(T.invTests.stocks.ASSETS[0].mu * 1800 / 1500)") - 1
    ok(exp - 1 < index_30min, f"but less than the index fund grows on average in the same time ({index_30min:.1%}): stocks pay for their risk")

    # --- the holding limit ---
    page.evaluate("() => { const s = T.inv('bonds'); s.held = []; T.state.cash = 1e6; }")
    for _ in range(8): S(f"{K}.buy('cd')")
    ok(not S(f"{K}.buy('cd')") and S("T.inv('bonds').held.length") == 8, "you can hold 8 at a time")
    page.wait_for_timeout(300)
    ok(page.locator("#bnd-buy-gov").get_attribute("aria-disabled") == "true", "and Buy greys out at the limit")

    # --- time away: several mature at once ---
    page.evaluate("() => { const s = T.inv('bonds'); s.held.forEach(h => h.matures = Date.now() - 3600e3); T.state.lastTick = Date.now() - 2 * 3600e3; T.catchUp(false); " + FREEZE + " }")
    close_modal()
    ok(S("T.inv('bonds').held.length") == 0, "after time away, everything that matured is paid out")
    ok("8 bonds matured" in page.text_content("#toast"), "with one combined message")

    # --- saving ---
    page.evaluate(f"() => {{ T.state.cash = 4000; {K}.buy('gov'); T.saveNow(); }}")
    ok(S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.bonds.held.length") == 1, "bonds are saved and loaded")
    bad = S("T.validState({ cash: 1, biz: [], inv: { bonds: { held: [{ p: 'gov', amount: -5, interest: 1, boughtAt: 1, matures: 2 }, { p: 'junk', amount: 5, interest: 1, boughtAt: 1, matures: 2 },"
            " { id: 3, p: 'cd', amount: 50, interest: 1, boughtAt: 1000, matures: 9e15 }], nextId: 'x' } } }).inv.bonds")
    ok(len(bad["held"]) == 1 and bad["held"][0]["matures"] == 1000 + 180e3, "broken entries are dropped, and a far-off maturity is pulled back to the bond's real term")
    ok(bad["nextId"] == 4, "new ids won't clash with saved ones")

    # --- retiring ---
    page.evaluate("() => { T.state.earnedAll = 4e9; T.retire(); " + FREEZE + " }"); close_modal()
    ok(S("T.inv('bonds').held.length") == 0, "retiring starts bonds over")

    # --- screenshots ---
    page.evaluate(f"() => {{ T.state.earnedRun = 2e5; T.state.cash = 20000; T.rebuildLists(); {K}.buy('cd'); {K}.buy('gov'); {K}.buy('corp'); }}")
    page.click("#tab-invest"); page.wait_for_timeout(400)
    page.locator("#inv-bonds").scroll_into_view_if_needed(); page.wait_for_timeout(200)
    page.screenshot(path=os.path.join(SHOTS, "deck_bonds.png"))
    page.click("#tab-set"); page.wait_for_timeout(200)
    ok("Bonds and CDs held" in page.inner_text("#stats"), "the Stats tab lists your bonds")
    ok(not errors, f"no page errors {errors}")

    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []
    phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(500)
    phone.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 3000; T.state.cash = 9000; T.rebuildLists(); T.invTests.bonds.buy('cd'); T.invTests.bonds.buy('corp'); }")
    phone.click("#tab-invest"); phone.wait_for_timeout(300)
    phone.locator("#inv-bonds").scroll_into_view_if_needed(); phone.wait_for_timeout(300)
    phone.screenshot(path=os.path.join(SHOTS, "phone_bonds.png"))
    ok(phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), "the card fits a phone screen (no sideways scrolling)")
    ok(not perr, f"no page errors on the phone {perr}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
