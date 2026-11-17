"""
invest_real_estate.py - Checks the real estate investment
(src/js/30-investments/real-estate.js) in the real built page: the card on
the Invest tab, the one listing at a time, buying with cash or a mortgage,
rent and payments over time (including 8 hours away), paying a loan off,
foreclosure, renovating, selling (and a short sale), the market moving, the
tenant's offer, saving, and retiring. Screenshots go to tests/shots/.

    python3 tests/invest_real_estate.py   (needs: pip install playwright, and Chrome)

Handles: R = T.invTests["real-estate"] (the module's own functions) and
RE = T.inv("real-estate") (its slice of the save).
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))
# a and b equal to within a fraction tol
close = lambda a, b, tol=1e-6: abs(a - b) <= tol * max(1, abs(a), abs(b))

# Short names inside the page for every check below
PRELUDE = "() => { window.R = T.invTests['real-estate']; window.RE = () => T.inv('real-estate'); }"
# A listing we control: a Good rental house at a fair price
def listing(kind="house", cond=2, noise=1, key="k"):
    return f"RE().listing = {{ key: '{key}', type: '{kind}', name: '12 Elm Ave', city: 'Reno', cond: {cond}, noise: {noise} }}"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(600)
    page.evaluate(PRELUDE)
    S = lambda expr: page.evaluate("() => " + expr)
    # Quiet: no events, and the market only moves when a check asks it to.
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; RE().market.nextAt = Date.now() + 1e9; }")

    # ---------- locked at the start ----------
    ok(S("T.MODULES.some(m => m.id === 'real-estate')"), "real estate registers itself as an investment")
    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up" in page.inner_text("#inv-real-estate") and S("RE().listing") is None, "it's locked for a brand-new player, with nothing for sale")
    page.evaluate("() => { T.state.earnedRun = 3e3; T.state.cash = 5e3; T.rebuildLists(); }"); page.wait_for_timeout(400)
    ok(S("!!RE().listing") and page.locator("#re-listing").count() == 1, "once you reach tier 1, one property goes up for sale")
    ok(S("T.invTests['real-estate'].TYPE[RE().listing.type].tier") <= 1, "and it's a type you've unlocked")
    gen = S("""(() => { const was = T.state.earnedRun; T.state.earnedRun = 1e13; const types = new Set(), bad = [];
        for (let i = 0; i < 2000; i++) { const l = R.makeListing(); types.add(l.type);
          if (/undefined|NaN/.test(l.name + l.city) || !(l.noise >= 0.9 && l.noise <= 1.1) || !(l.cond >= 0 && l.cond <= 3)) bad.push(l.name); }
        T.state.earnedRun = was; return [types.size, bad.length]; })()""")
    ok(gen == [6, 0], f"listings use all 6 property types with clean names and numbers ({gen})")
    page.screenshot(path=os.path.join(SHOTS, "re_desktop_listing.png"))

    # ---------- "Show me another" ----------
    k0 = S("RE().listing.key")
    page.click("#re-next"); page.wait_for_timeout(100)
    k1 = S("RE().listing.key")
    # force: Playwright treats aria-disabled buttons as disabled and would wait the 20s out
    page.click("#re-next", force=True); page.wait_for_timeout(100)
    ok(k1 != k0 and S("RE().listing.key") == k1, "Show me another swaps the listing, then has to wait before the next one")
    page.evaluate("() => { RE().anotherAt = 0; RE().listingAt = Date.now() - 1; }"); page.wait_for_timeout(200)
    ok(S("RE().listing.key") != k1, "a new listing also comes up by itself when its time is up")

    # ---------- buy with cash ----------
    page.evaluate(f"() => {{ T.state.cash = 1e4; {listing()}; T.rebuildLists(); }}"); page.wait_for_timeout(300)
    price = S("R.price(RE().listing)")
    page.click("#re-cash"); page.wait_for_timeout(150)
    ok(S("RE().props.length") == 1 and S("RE().props[0].loan") is None, "buying outright gives you the property with no loan")
    # (rent starts coming in straight away, so check what it cost, not the cash left)
    ok(close(S("RE().props[0].invested"), price * 1.03, 1e-6), f"it costs the price plus 3% closing costs (${price * 1.03:,.0f})")
    ok(S("!!RE().listing") and S("RE().listing.key") != "k", "and a new property goes up for sale")
    rent = S("R.rent(RE().props[0])")
    ok(close(rent, 8000 / (300 * 2)), f"a Good rental house rents for its price over twice a tier-1 business's payback (${rent:.2f}/sec)")
    # all in one go, so the game's own frames can't add rent in between
    d = S("(() => { const c0 = T.state.cash, e0 = T.state.earnedRun, n = R.earn(100); return [T.state.cash - c0, T.state.earnedRun - e0, n]; })()")
    ok(all(close(x, rent * 100) for x in d),
       "100 seconds of rent lands in your cash and counts as earnings")

    # ---------- buy with a mortgage ----------
    page.evaluate(f"() => {{ T.state.cash = 1e4; {listing('duplex', key='m')}; T.rebuildLists(); }}"); page.wait_for_timeout(300)
    price = S("R.price(RE().listing)")
    page.click("#re-mort"); page.wait_for_timeout(150)
    m = S("RE().props[1]")
    # payments start straight away, so allow a few frames' worth of paying down
    ok(m["loan"] and close(m["loan"]["balance"], price * 0.8, 1e-3), "a mortgage borrows 80% of the price")
    # what you've put in = down payment + closing costs + the part of the loan paid off so far
    upfront = S("(() => { const q = RE().props[1]; return q.invested - (" + str(price * 0.8) + " - q.loan.balance); })()")
    ok(close(upfront, price * 0.23, 1e-6), "you pay 20% down plus 3% closing costs")
    r, pay = S("R.rent(RE().props[1])"), S("R.payment(RE().props[1])")
    ok(close(pay / r, 0.9), f"a fresh mortgage's payment is 90% of the rent, so a little is left over (net ${r - pay:.2f}/sec)")
    ok(close(S("(() => { const L = R.loanFor({ type: 'duplex', cond: 2, noise: 1 }); return L.rate * L.balance / L.pay; })()"), 0.6 / 0.9), "of which 60% of the rent is interest at first")
    # at a fair price a fresh mortgage leaves money over in every condition...
    conds = S("[0,1,2,3].map(c => { const l = { type: 'house', cond: c, noise: 1 }; return R.rent(l) - R.loanFor(l).pay; })")
    ok(all(x > 0 for x in conds), f"at a fair price a fresh mortgage pays for itself in every condition ({[round(x, 2) for x in conds]})")
    # ...but overpaying for a renovated place doesn't, and the listing says so
    page.evaluate(f"() => {{ {listing(cond=3, noise=1.1, key='o')}; T.rebuildLists(); }}"); page.wait_for_timeout(300)
    ok("you'd lose" in page.inner_text("#re-listing .l2"), "an overpriced renovated listing warns that its mortgage would cost more than the rent")
    ok(S("Math.abs(T.investNet() - (R.rent(RE().props[0]) + R.net(RE().props[1])))") < 1e-6, "the ticker's $/sec includes rent minus mortgage payments")
    # the exact payoff maths vs. a fine step-by-step simulation
    sim = S("""(() => { const L = Object.assign({}, RE().props[1].loan); let B = L.balance, paid = 0;
        for (let i = 0; i < 50000; i++) { const dt = 0.1; if (B <= 0) break; B = Math.max(0, B - (L.pay - L.rate * B) * dt); paid += L.pay * dt; }
        const p = JSON.parse(JSON.stringify(RE().props[1])); const got = R.payMortgage(p, 5000);
        return [B, p.loan ? p.loan.balance : 0, paid, got]; })()""")
    ok(close(sim[0], sim[1], 1e-3) and close(sim[2], sim[3], 1e-3), f"the loan balance after 5000s matches a step-by-step check (${sim[1]:,.0f} left)")
    # (on a copy, worked out in one evaluate so the live loan can't move in between)
    t_off, *payoff = S("""(() => { const p = JSON.parse(JSON.stringify(RE().props[1])), L = p.loan, k = L.pay / L.rate;
        const t = Math.log(k / (k - L.balance)) / L.rate, inv0 = p.invested, b0 = L.balance;
        const paid = R.payMortgage(p, t + 9999); return [t, p.loan, paid, p.invested - inv0 - b0]; })()""")
    ok(payoff[0] is None and close(payoff[1], pay * t_off, 1e-6), f"a long time away pays the loan off exactly and then stops charging (paid off after {t_off / 60:.0f} min)")
    ok(abs(payoff[2]) < 1e-6, "the loan you paid off is added to what you've put into the property")

    # ---------- 8 hours away, the real way (through the game's catch-up) ----------
    c0 = S("T.state.cash")
    page.evaluate("() => { T.state.cash = 1e5; T.state.lastTick = Date.now() - 8 * 3600e3 - 5000; RE().market.nextAt = Date.now() - 8 * 3600e3; T.catchUp(false); }")
    ok(S("RE().props[1].loan") is None, "8 hours away pays off a duplex mortgage")
    ok(S("RE().market.hist.length") == 30 and S("RE().market.nextAt") > S("Date.now()"), "the market catches up on 8 hours of moves and keeps the last 30")
    ok(S("RE().arrears") == 0 and S("T.state.cash") > 1e5, "with plenty of cash there are no missed payments")
    page.evaluate("() => { RE().market.value = 1; RE().market.nextAt = Date.now() + 1e9; }")

    # ---------- pay off a loan early ----------
    page.evaluate(f"() => {{ T.state.cash = 1e4; {listing('duplex', key='p')}; T.rebuildLists(); }}"); page.wait_for_timeout(200)
    page.click("#re-mort"); page.wait_for_timeout(150)
    pid = S("RE().props[2].id")
    page.evaluate("() => { T.state.cash = 1e6; T.render(true); }"); page.wait_for_timeout(100)
    # (one evaluate, so the game's frames can't add rent in between)
    d = S(f"(() => {{ const bal = RE().props[2].loan.balance, c0 = T.state.cash; document.getElementById('re-pay-{pid}').click();"
          " return [bal, c0 - T.state.cash, RE().props[2].loan]; })()")
    ok(d[2] is None and close(d[1], d[0], 1e-9), "Pay off loan takes the balance from your cash")
    ok(close(S("R.net(RE().props[2])"), S("R.rent(RE().props[2])")), "after that, all the rent is yours")

    # ---------- foreclosure ----------
    page.evaluate("""() => { RE().props.push({ id: 90, type: 'apts', name: '1 Main St', city: 'Reno', cond: 0, invested: 1,
        loan: { balance: 4e5, rate: 0.0001, pay: 500 }, fixing: null, selling: null });
        RE().market.value = 0.5; T.state.cash = 10; }""")
    ok(S("R.net(RE().props.find(p => p.id === 90))") < 0, "a big loan on a fixer-upper in a slumped market costs more than it rents for")
    d = S("(() => { R.earn(5); return [T.state.cash, RE().arrears]; })()")
    ok(d[0] >= 0 and d[1] > 0, "when the cash runs out, missed payments pile up but cash never goes below zero")
    page.wait_for_timeout(300)
    ok(S("RE().props.some(p => p.id === 90)") is False and S("RE().foreclosed") == 1, "then the bank forecloses on the property losing the most")
    ok("Foreclosed" in page.text_content("#modalTitle") and S("RE().arrears") == 0, "a note explains what happened and the missed payments are cleared")
    page.click("#modalOk")
    ok(S("RE().props.length") == 3, "the properties you could afford are still yours")
    ok(S("(() => { RE().arrears = 5; const p = RE().props.map(x => x.loan); RE().props.forEach(x => x.loan = null); const r = R.foreclose(); return [r, RE().arrears]; })()") == [False, 0],
       "with no loans left there's nothing to foreclose, and the arrears are dropped")
    page.evaluate("() => { RE().market.value = 1; }")

    # ---------- renovate ----------
    page.evaluate("() => { RE().props[0].cond = 0; T.state.cash = 1e6; T.rebuildLists(); }"); page.wait_for_timeout(200)
    r0, v0 = S("R.rent(RE().props[0])"), S("R.value(RE().props[0])")
    pid = S("RE().props[0].id")
    page.click(f"#re-reno-{pid}"); page.wait_for_timeout(150)
    ok(S("!!RE().props[0].fixing"), "Renovate starts the work")
    page.click(f"#re-sell-{pid}"); page.click(f"#re-sell-{pid}"); page.wait_for_timeout(100)
    ok(S("RE().props[0].selling") is None, "you can't list a property while it's being renovated")
    page.evaluate("() => { RE().props[0].fixing.until = Date.now() - 1; }"); page.wait_for_timeout(200)
    ok(S("RE().props[0].cond") == 1, "when the work's done, a fixer-upper becomes dated")
    ok(S("R.rent(RE().props[0])") > r0 and S("R.value(RE().props[0])") > v0, "and both its rent and its value go up")
    page.evaluate("() => { RE().props[0].cond = 3; T.rebuildLists(); }"); page.wait_for_timeout(200)
    ok(S(f"document.getElementById('re-reno-{pid}').getAttribute('aria-disabled')") == "true" and S(f"R.renovate({pid})") is False,
       "a fully renovated property can't be renovated again")

    # ---------- sell ----------
    page.evaluate("() => { RE().market.value = 1.5; T.rebuildLists(); }"); page.wait_for_timeout(200)
    inv0 = S("RE().props[0].invested"); val = S("R.value(RE().props[0])")
    page.click(f"#re-sell-{pid}"); page.wait_for_timeout(50)
    ok(S("RE().props[0].selling") is None, "one press on Sell only asks you to confirm")
    page.click(f"#re-sell-{pid}"); page.wait_for_timeout(100)
    ok(S("!!RE().props[0].selling"), "a second press puts it on the market")
    ok(S(f"R.renovate({pid})") is False, "you can't renovate while it's for sale")
    page.click(f"#re-unl-{pid}"); page.wait_for_timeout(100)
    ok(S("RE().props[0].selling") is None, "Take off the market cancels the sale")
    # the buyer turns up (run the tick by hand, all in one go, so no rent sneaks in)
    d = S(f"""(() => {{ R.list({pid}); const c0 = T.state.cash, e0 = T.state.earnedAll; RE().props[0].selling.until = Date.now() - 1;
        R.tick(Date.now()); return [T.state.cash - c0, T.state.earnedAll - e0, RE().props.some(p => p.id === {pid})]; }})()""")
    ok(d[2] is False and close(d[0], val * 0.94, 1e-6), "when a buyer turns up you get its value minus 6% fees")
    ok(close(d[1], max(0, val * 0.94 - inv0), 1e-6), "and only the profit counts as earnings")
    page.click("#modalOk")
    page.evaluate("() => { RE().market.value = 1; }")
    # selling a mortgaged property pays the bank first
    page.evaluate(f"() => {{ T.state.cash = 1e6; {listing('duplex', key='s')}; T.rebuildLists(); }}"); page.wait_for_timeout(200)
    page.click("#re-mort"); page.wait_for_timeout(150)
    q = S("RE().props[RE().props.length - 1]")
    c0 = S("T.state.cash")
    page.evaluate(f"() => R.closeSale(RE().props.find(x => x.id === {q['id']}))")
    ok(close(S("T.state.cash") - c0, 20e3 * 0.94 - q["loan"]["balance"], 1e-3), "selling a mortgaged property pays off the loan out of the sale")
    page.click("#modalOk")
    # a short sale: the market crashed, the sale doesn't cover the loan, and you're nearly broke
    page.evaluate(f"() => {{ T.state.cash = 1e6; {listing('duplex', key='x')}; T.rebuildLists(); }}"); page.wait_for_timeout(200)
    page.click("#re-mort"); page.wait_for_timeout(150)
    q = S("RE().props[RE().props.length - 1]")
    left = S(f"(() => {{ RE().market.value = 0.4; T.state.cash = 50; R.closeSale(RE().props.find(x => x.id === {q['id']})); return T.state.cash; }})()")
    ok(left == 0 and "Short sale" in page.text_content("#modalTitle"), "an underwater sale you can't cover is a short sale: cash goes to zero, not below")
    page.click("#modalOk")
    page.evaluate("() => { RE().market.value = 1; }")

    # ---------- the market ----------
    walk = S("""(() => { const m = RE().market; const keep = JSON.stringify(m); m.value = 1; m.hist = [1]; m.nextAt = 0;
        let lo = 9, hi = 0, steps = 0; for (let i = 0; i < 200; i++) { m.nextAt = 0; steps += R.stepMarket(1); lo = Math.min(lo, m.value); hi = Math.max(hi, m.value); }
        const end = m.value; Object.assign(m, JSON.parse(keep)); return [lo, hi, steps, end]; })()""")
    ok(walk[0] >= 0.4 and walk[1] <= 6 and walk[0] < 1 < walk[1] or walk[2] == 200, f"the market wanders up and down within its limits ({walk[0]:.2f}x to {walk[1]:.2f}x)")
    many = S("""(() => { let up = 0; const m = RE().market, keep = JSON.stringify(m);
        for (let r = 0; r < 300; r++) { m.value = 1; m.nextAt = 0; R.stepMarket(600 * 60e3); if (m.value > 1) up++; }
        Object.assign(m, JSON.parse(keep)); return up; })()""")
    ok(160 < many < 300, f"over 10 hours it ends up more often than down ({many}/300 runs up), but not always")
    capped = S("(() => { const m = RE().market, keep = JSON.stringify(m); m.nextAt = 0; const n = R.stepMarket(1e13); const ok = m.nextAt > 1e13; Object.assign(m, JSON.parse(keep)); return [n, ok]; })()")
    ok(capped == [600, True], "a huge gap (an old save) stops after 600 moves instead of freezing the game")

    # ---------- tenant's offer ----------
    page.evaluate(f"() => {{ T.state.cash = 1e6; {listing(key='t')}; R.buy(false); }}")
    ev = S("(() => { const ev = R.tenantOffer(); window.ev = ev; return ev.title; })()")
    ok(ev == "Tenant's offer", "a tenant can offer to buy the place")
    found = S("(() => { for (let i = 0; i < 300; i++) if (T.makeEvent().title === \"Tenant's offer\") return true; return false; })()")
    ok(found, "and it turns up among the game's random events")
    # after a save and reload the property is a new object: the offer must still work
    page.evaluate("() => { T.state = T.validState(JSON.parse(JSON.stringify(T.state))); }")
    n0, c0 = S("RE().props.length"), S("T.state.cash")
    page.evaluate("() => ev.options[0].act()")
    ok(S("RE().props.length") == n0 - 1 and S("T.state.cash") > c0, "taking the offer sells it, even after the game was reloaded")
    page.click("#modalOk")
    page.evaluate("() => ev.options[0].act()")
    ok(S("RE().props.length") == n0 - 1, "taking the same offer twice does nothing the second time")
    ok(S("(() => { const s = RE().props; const keep = s.map(p => p.fixing); s.forEach(p => p.fixing = { until: Date.now() + 1e9 }); const n = T.MODULES.find(m => m.id === 'real-estate').events().length; s.forEach((p, i) => p.fixing = keep[i]); return n; })()") == 0,
       "no offer while every property is mid-renovation")

    # ---------- saving ----------
    page.evaluate("() => T.saveNow()")
    saved = S("(() => { const s = T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))); return [s.inv['real-estate'].props.length, s.inv['real-estate'].market.value]; })()")
    ok(saved[0] == S("RE().props.length") and close(saved[1], S("RE().market.value")), "properties and the market are saved and loaded")
    junk = S("""(() => R.validate({ props: [null, { type: 'castle' }, { id: 3, type: 'house', cond: 99, invested: -5, loan: { balance: 100, rate: 1, pay: 50 } },
        { id: 3, type: 'duplex', cond: 'x', name: '<b>', fixing: { until: 'soon' } }], nextId: 'q', listing: { type: 'house', noise: NaN },
        market: { value: 1e9, nextAt: 9e15, hist: [1, 'a', -2] }, arrears: -1, profit: 'lots' }))()""")
    ok(len(junk["props"]) == 2 and junk["props"][0]["cond"] == 3 and junk["props"][0]["invested"] == 0, "a damaged save keeps only real properties, with sane numbers")
    ok(junk["props"][0]["loan"] is None, "a loan that could never be paid off is dropped")
    ok(junk["props"][0]["id"] != junk["props"][1]["id"] and junk["nextId"] > max(x["id"] for x in junk["props"]), "two properties with the same id get different ids")
    ok(junk["listing"] is None and junk["market"]["value"] == 6 and junk["market"]["nextAt"] < 9e15 and junk["market"]["hist"] == [1], "a bad listing is dropped and the market is pulled back into range")
    ok(junk["arrears"] == 0 and junk["profit"] == 0, "and bad totals reset to zero")
    ok(S("T.validState({ cash: 1, biz: [] }).inv['real-estate'].props.length") == 0, "an older save without real estate starts it fresh")

    # ---------- the card on a phone ----------
    page.evaluate("() => { RE().market.hist = [1, 1.02, 0.99, 1.04, 1.03, 1.07]; RE().market.value = 1.07; T.rebuildLists(); }")
    page.click("#tab-invest"); page.wait_for_timeout(400)
    page.locator("#inv-real-estate").screenshot(path=os.path.join(SHOTS, "re_desktop_card.png"))
    phone = b.new_page(viewport={"width": 390, "height": 2200}, device_scale_factor=2)   # tall, so the sticky header doesn't cover the card in the shot
    phone.on("pageerror", lambda e: errors.append("phone: " + str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(500)
    phone.evaluate(PRELUDE)
    phone.evaluate(f"""() => {{ T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 1e6; T.state.cash = 3e5; {listing('apts', 0, 0.92)}; RE().listingAt = Date.now() + 1e9;
        RE().props = [{{ id: 1, type: 'house', name: '48 Maple St', city: 'Boise', cond: 1, invested: 9000, loan: null, fixing: null, selling: null }},
          {{ id: 2, type: 'duplex', name: '7 Oak St', city: 'Tulsa', cond: 2, invested: 5000, loan: R.loanFor({{ type: 'duplex', cond: 2, noise: 1 }}), fixing: null, selling: null }}];
        RE().nextId = 3; T.rebuildLists(); }}""")
    phone.click("#tab-invest"); phone.wait_for_timeout(500)
    # just the card
    phone.locator("#inv-real-estate").screenshot(path=os.path.join(SHOTS, "re_phone.png"))
    wide = phone.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    ok(wide <= 0, f"the card fits a phone screen with no sideways scrolling ({wide}px over)")
    phone.close()

    # ---------- retire ----------
    page.evaluate("() => { T.state.earnedAll = 4e9; T.retire(); }")
    ok(S("RE().props.length") == 0 and S("RE().bought") == 0, "retiring starts real estate over")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")

    ok(not errors, f"no page errors {errors}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
