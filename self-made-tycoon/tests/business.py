"""
business.py - Checks the "buy it, fix it, sell it" features in the real page:
hidden problems and due diligence, the four fix-up mini games, repair work
that takes time, and selling a business for what it's worth. Screenshots
of the business sheet and each mini game go to tests/shots/.

    python3 tests/business.py       (needs: pip install playwright, and Chrome)
"""
import os, json
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

# A business in the shape the game stores, with chosen traits.
def biz_js(id, ind="laundry", quirk=0, loc=1, hidden="null", level=1, paid=5000):
    return (f"{{ id: {id}, ind: '{ind}', name: 'Test {id}', city: 'Reno', loc: {loc}, quirk: {quirk}, level: {level}, paid: {paid},"
            f" incMult: T.LOCS[{loc}].inc * T.QUIRKS[{quirk}].inc, hidden: {hidden}, fixing: null, selling: null, fixRetryAt: 0, viralUntil: 0, inspectUntil: 0 }}")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(600)
    S = lambda expr: page.evaluate("() => " + expr)
    # quiet: no random events in the middle of the checks
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e4; T.refreshDeals(); T.rebuildLists(); }")
    QUIRK = {q: i for i, q in enumerate(S("T.QUIRKS.map(q => q.name)"))}

    # --- hidden problems on listings ---
    rate = S("(() => { let n = 0; for (let i = 0; i < 4000; i++) if (T.makeListing('any').hidden) n++; return n / 4000; })()")
    ok(0.21 < rate < 0.29, f"about a quarter of listings hide a problem ({rate:.1%})")

    # --- due diligence finds it ---
    page.evaluate("() => { const l = T.state.deals[0]; l.hidden = 'staff'; l.checked = false; l.key = 'x1'; T.state.cash = 1e5; T.rebuildLists(); }")
    inc0 = S("T.listingIncome(T.state.deals[0])"); cash0 = S("T.state.cash"); cost = S("Math.max(5, T.listingPrice(T.state.deals[0]) * 0.03)")
    page.click("#dd-0"); page.wait_for_timeout(200)
    ok(abs(cash0 - S("T.state.cash") - cost) < 0.01, f"due diligence costs 3% of the asking price (${cost:.0f})")
    ok("Staff keep quitting" in page.inner_text("#dealList"), "the hidden problem now shows on the listing")
    ok(abs(S("T.listingIncome(T.state.deals[0])") / inc0 - 0.8) < 1e-9, "the listing's income now counts the problem (x0.8)")
    ok(page.locator("#dd-0").count() == 0, "the due diligence button goes away once it's done")
    page.evaluate("() => { const l = T.state.deals[1]; l.hidden = null; l.checked = false; l.key = 'x2'; T.rebuildLists(); }")
    page.click("#dd-1"); page.wait_for_timeout(200)
    ok("Checked: clean" in page.inner_text("#dealList"), "a clean listing says so after due diligence")
    page.screenshot(path=os.path.join(SHOTS, "deck_due_diligence.png"))

    # --- buying without checking: surprise ---
    page.evaluate("() => { const l = T.state.deals[2]; l.hidden = 'roof'; l.checked = false; T.rebuildLists(); }")
    page.click("#deal-2"); page.wait_for_timeout(200)
    ok(page.locator("#modalBack.on").count() == 1 and "Surprise" in page.text_content("#modalTitle"), "buying unchecked shows a 'Surprise!' about the hidden problem")
    page.click("#modalOk")
    nb = S("T.state.biz[T.state.biz.length - 1]")
    ok(nb["hidden"] == "roof", "the business you bought has the leaky roof")
    ok(abs(S("T.bizIncome(T.state.biz[T.state.biz.length - 1]) / T.bizIncome(Object.assign({}, T.state.biz[T.state.biz.length - 1], {hidden: null}))") - 0.85) < 1e-9,
       "and it earns 15% less until it's fixed")

    # --- a business with every kind of problem, to fix one by one ---
    page.evaluate(f"""() => {{ T.state.biz = [{biz_js(50, quirk=QUIRK['Bad online reviews'], loc=0, hidden="'staff'")},
                                            {biz_js(51, quirk=QUIRK['Messy books'])}, {biz_js(52, quirk=QUIRK['Needs new equipment'])}];
        T.state.nextBizId = 60; T.state.cash = 1e6; T.rebuildLists(); }}""")
    ok(S("T.problemsOf(T.state.biz[0]).join()") == "reviews,rough,staff", "problems list: bad reviews, rough area and the hidden one")
    page.click("#tab-empire"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "deck_empire_problems.png"))
    page.click("#mng-50"); page.wait_for_timeout(200)
    ok(page.locator("#sheetBack.on").count() == 1 and page.text_content("#sheetTitle") == "Test 50", "Manage opens the business sheet")
    ok(page.locator("#sheetBody [data-fix]").count() == 3, "the sheet offers a fix for each of the 3 problems")
    page.screenshot(path=os.path.join(SHOTS, "deck_sheet.png"))

    # events wait while the sheet is open
    page.evaluate("() => { T.state.nextEventAt = Date.now() - 1; }"); page.wait_for_timeout(300)
    ok(S("T.activeEvent") is None, "no event pops up while you're managing a business")
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; }")

    # reviews game: pick the good reply each time -> pass
    cash0 = S("T.state.cash"); fix = S("T.fixCost(T.state.biz[0], 'reviews')")
    page.click("#fix-reviews"); page.wait_for_timeout(150)
    page.screenshot(path=os.path.join(SHOTS, "deck_game_reviews.png"))
    for _ in range(4): page.click("#sheetBody [data-k=good]"); page.wait_for_timeout(60)
    page.wait_for_timeout(150)
    bz = S("T.state.biz[0]")
    ok(bz["fixing"] and bz["fixing"]["p"] == "reviews", "winning the reviews game starts the repair work")
    ok(abs(cash0 - S("T.state.cash") - fix) < S("T.baseIncome()") * 3, f"the work costs ${fix:,.0f}, paid when you pass")
    ok("Work done in" in page.inner_text("#sheetBody"), "the sheet shows a countdown for the work")
    ok(page.locator("#fix-rough").count() == 0, "only one project at a time per business")
    inc_before = S("T.bizIncome(T.state.biz[0])"); val_before = S("T.saleValue(T.state.biz[0])")
    page.evaluate("() => { T.state.biz[0].fixing.until = Date.now() - 1; T.finishProjects(); }")
    bz = S("T.state.biz[0]")
    ok(bz["quirk"] == QUIRK["Turned around"] and bz["fixing"] is None, "when the work is done, 'Bad online reviews' becomes 'Turned around'")
    ok(abs(S("T.bizIncome(T.state.biz[0])") / inc_before - 1.05 / 0.8) < 1e-9, "income goes up by 1.05 / 0.8")
    ok(S("T.saleValue(T.state.biz[0])") > val_before, "and it's worth more to a buyer")

    # hire game: lose on purpose (always pick an over-budget person) -> fail, no charge, cooldown
    page.evaluate("() => T.renderSheet ? 0 : 0"); page.wait_for_timeout(1100)
    cash0 = S("T.state.cash")
    page.click("#fix-staff"); page.wait_for_timeout(150)
    page.screenshot(path=os.path.join(SHOTS, "deck_game_hire.png"))
    for _ in range(3):
        page.evaluate("""() => { const btns = [...document.querySelectorAll('#sheetBody [data-n]')];
            const budget = Number(document.querySelector('#sheetBody .note strong').textContent.replace(/[^0-9]/g, ''));
            btns.find(b => Number(b.textContent.match(/\\$(\\d+)\\/hr/)[1]) > budget).click(); }""")
        page.wait_for_timeout(60)
    page.wait_for_timeout(150)
    ok(S("T.state.biz[0].hidden") == "staff" and not S("T.state.biz[0].fixing"), "failing the hiring game fixes nothing")
    ok(abs(S("T.state.cash") - cash0) < S("T.baseIncome()") * 3, "and costs nothing (only a few seconds of income went by)")
    ok("Try again in" in page.inner_text("#sheetBody"), "but you have to wait before trying again")
    # hire game: win (pick the best affordable person)
    page.evaluate("() => { T.state.biz[0].fixRetryAt = 0; }"); page.wait_for_timeout(1100)
    page.click("#fix-staff"); page.wait_for_timeout(150)
    for _ in range(3):
        page.evaluate("""() => { const note = document.querySelector('#sheetBody .note');
            const budget = Number(note.querySelectorAll('strong')[0].textContent.replace(/[^0-9]/g, ''));
            const want = note.querySelectorAll('strong')[1].textContent === 'reliable' ? 0 : 1;
            const people = [...document.querySelectorAll('#sheetBody [data-n]')].map(b => {
              const spans = b.querySelectorAll('span');
              return { b, stat: (spans[want].textContent.match(/★/g) || []).length, wage: Number(b.textContent.match(/\\$(\\d+)\\/hr/)[1]) }; });
            people.filter(c => c.wage <= budget).sort((a, c) => c.stat - a.stat)[0].b.click(); }""")
        page.wait_for_timeout(60)
    page.wait_for_timeout(150)
    ok(S("T.state.biz[0].fixing && T.state.biz[0].fixing.p") == "staff", "picking the best affordable hire 3 times passes the hiring game")
    page.evaluate("() => { T.state.biz[0].fixing.until = Date.now() - 1; T.finishProjects(); }")
    ok(S("T.state.biz[0].hidden") is None, "the hidden problem is gone once the new manager starts")

    # renovation: no game, just money and time
    page.wait_for_timeout(1100)
    page.click("#fix-rough"); page.wait_for_timeout(150)
    ok(S("T.state.biz[0].fixing && T.state.biz[0].fixing.p") == "rough", "renovating a rough-area storefront starts right away (no game)")
    page.evaluate("() => { T.state.biz[0].fixing.until = Date.now() - 1; T.finishProjects(); }")
    ok(S("T.state.biz[0].loc") == 1 and S("T.problemsOf(T.state.biz[0]).length") == 0, "after renovating, it has no problems left")
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    ok(page.locator("#sheetBack.on").count() == 0, "Escape closes the sheet")

    # books game: tap the duplicate each time
    page.click("#mng-51"); page.wait_for_timeout(150)
    page.click("#fix-books"); page.wait_for_timeout(150)
    page.screenshot(path=os.path.join(SHOTS, "deck_game_books.png"))
    for _ in range(3): page.click("#sheetBody [data-d='1'] >> nth=0"); page.wait_for_timeout(60)
    page.wait_for_timeout(150)
    ok(S("T.state.biz.find(x => x.id === 51).fixing?.p") == "books", "finding the double-entered charge 3 times passes the books game")
    page.click("#sheetClose")

    # machine game: press when the needle is in the green, and miss on purpose once
    page.click("#mng-52"); page.wait_for_timeout(150)
    page.click("#fix-equipment"); page.wait_for_timeout(150)
    page.screenshot(path=os.path.join(SHOTS, "deck_game_machine.png"))
    inzone = """() => { const z = document.querySelector('#sheetBody .zone'), n = document.querySelector('#sheetBody .needle');
        const l = parseFloat(z.style.left), w = parseFloat(z.style.width), x = parseFloat(n.style.left); return x > l + 1 && x < l + w - 1; }"""
    def press_when(want_in):
        for _ in range(400):
            if page.evaluate(inzone) == want_in: page.click("#g-0"); return True
            page.wait_for_timeout(10)
        return False
    press_when(False); page.wait_for_timeout(50)
    ok("misses 1 of 3" in page.inner_text("#gStat"), "pressing outside the green counts a miss")
    for _ in range(3): press_when(True); page.wait_for_timeout(50)
    page.wait_for_timeout(500)
    ok(S("T.state.biz.find(x => x.id === 52).fixing?.p") == "equipment", "3 presses in the green pass the machine game")
    page.click("#sheetClose")

    # --- selling ---
    page.evaluate("() => { T.state.biz.forEach(b => { b.fixing = null; }); T.rebuildLists(); }")
    page.click("#mng-50"); page.wait_for_timeout(150)
    val = S("T.saleValue(T.state.biz.find(x => x.id === 50))"); paid = S("T.state.biz.find(x => x.id === 50).paid")
    page.click("#sellBtn"); page.wait_for_timeout(100)
    ok(not S("T.state.biz.find(x => x.id === 50).selling") and "again" in page.inner_text("#sellBtn").lower(), "the first press on Sell only asks to confirm")
    page.click("#sellBtn"); page.wait_for_timeout(150)
    ok(S("!!T.state.biz.find(x => x.id === 50).selling"), "the second press puts it on the market")
    ok(page.locator("#sheetBody [data-fix]").count() == 0, "you can't start work on a business that's for sale")
    page.click("#sellCancel"); page.wait_for_timeout(100)
    ok(not S("T.state.biz.find(x => x.id === 50).selling"), "you can take it off the market")
    page.click("#sellBtn"); page.click("#sellBtn"); page.wait_for_timeout(150)
    cash0, earned0 = S("T.state.cash"), S("T.state.earnedAll")
    page.evaluate("() => { T.state.biz.find(x => x.id === 50).selling.until = Date.now() - 1; T.finishProjects(); }")
    ok(S("T.state.biz.some(x => x.id === 50)") is False, "when the buyer turns up the business is gone")
    ok(abs(S("T.state.cash") - cash0 - val) < 1, f"and you get its value (${val:,.0f})")
    ok(abs(S("T.state.earnedAll") - earned0 - max(0, val - paid)) < 1, "only the profit counts as earnings (for Legacy stars)")
    ok(page.locator("#sheetBack.on").count() == 0 and "Sold" in page.text_content("#modalTitle"), "the sheet closes and a 'Sold!' note shows the profit or loss")
    page.screenshot(path=os.path.join(SHOTS, "deck_sold.png"))
    page.click("#modalOk")

    # a buyout offer for a business you've already sold does nothing
    cash0 = S("T.state.cash")
    page.evaluate("""() => { const b = T.state.biz[0]; T.state.biz = T.state.biz.filter(x => x !== b); T.state.biz.push(b);
        let ev; for (let i = 0; i < 200 && (!ev || ev.title !== 'Buyout offer'); i++) ev = T.makeEvent();
        const target = T.state.biz.find(x => ev.text.includes(x.name)); T.state.biz = T.state.biz.filter(x => x !== target);
        T.activeEvent = ev; T.chooseEvent(0); }""")
    ok(abs(S("T.state.cash") - cash0) < 1, "a buyout offer for a business you already sold pays nothing")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")

    # --- the numbers make sense: fixing and selling a bargain makes money ---
    flip = S("""(() => { const ind = T.IND.coffee; const l = { ind: 'coffee', loc: 1, quirk: T.QUIRKS.findIndex(q => q.name === 'Needs new equipment') };
        const price = ind.cost * 0.6;                      // what the quirk knocks off
        const b = { ind: 'coffee', loc: 1, quirk: l.quirk, level: 1, incMult: T.QUIRKS[l.quirk].inc, hidden: null };
        const fix = T.fixCost(b, 'equipment');
        b.incMult = b.incMult / T.QUIRKS[l.quirk].inc * 1.05;
        return [price, fix, T.saleValue(b)]; })()""")
    profit = flip[2] - flip[0] - flip[1]
    ok(profit > 0, f"fixing up a 'needs new equipment' coffee shop and selling it makes a profit (${profit:,.0f} on ${flip[0]:,.0f})")
    plain = S("(() => { const b = { ind: 'coffee', loc: 1, quirk: 0, level: 1, incMult: 1, hidden: null }; return T.saleValue(b) / T.IND.coffee.cost; })()")
    ok(plain <= 0.8, f"but buying a plain one and selling straight back loses money (sells for {plain:.0%} of the asking price)")

    # --- saving keeps it all, and bad data is cleaned up ---
    page.evaluate("() => { T.state.biz[0].fixing = { p: 'books', until: Date.now() + 5e4 }; T.state.biz[0].hidden = 'taxes'; T.saveNow(); }")
    loaded = S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).biz[0]")
    ok(loaded["fixing"]["p"] == "books" and loaded["hidden"] == "taxes", "work in progress and hidden problems survive a reload")
    junk = S("T.validState({ cash: 1, biz: [{ id: 1, ind: 'lawn', hidden: 'oops', fixing: { p: 'nope', until: 5 }, selling: { until: 'x' } }], deals: [{ ind: 'lawn', priceMult: 1, incMult: 1, hidden: 'hmm' }] })")
    ok(junk["biz"][0]["hidden"] is None and junk["biz"][0]["fixing"] is None and junk["biz"][0]["selling"] is None and junk["deals"][0]["hidden"] is None,
       "a save with made-up problem names is cleaned up instead of crashing")

    # --- controller: open the sheet, B closes it ---
    page.evaluate("""() => {
        window.__pad = { index: 0, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({length: 17}, () => ({pressed: false})) };
        navigator.getGamepads = () => [window.__pad];
        window.press = async i => { __pad.buttons[i].pressed = true; await new Promise(r => setTimeout(r, 60)); __pad.buttons[i].pressed = false; await new Promise(r => setTimeout(r, 60)); }; }""")
    bid = S("T.state.biz[0].id")
    page.focus(f"#mng-{bid}"); page.evaluate("async () => { await press(0); }")
    ok(page.locator("#sheetBack.on").count() == 1, "controller A on Manage opens the sheet")
    page.evaluate("async () => { await press(13); await press(13); }")
    ok(S("document.getElementById('sheetBack').contains(document.activeElement)"), "the D-pad keeps focus inside the sheet")
    page.evaluate("async () => { await press(1); }")
    ok(page.locator("#sheetBack.on").count() == 0, "controller B closes the sheet")
    ok(not errors, f"no page errors {errors}")

    # --- phone: the sheet and a mini game fit ---
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(str(e))); pp.goto(PAGE); pp.wait_for_timeout(600)
    pp.evaluate(f"""() => {{ T.state.nextEventAt = Date.now() + 1e9; T.state.cash = 1e6;
        T.state.biz = [{biz_js(70, quirk=QUIRK['Bad online reviews'], loc=0, hidden="'taxes'").replace("T.LOCS", "T.LOCS")}]; T.rebuildLists(); T.openSheet(70); }}""")
    pp.wait_for_timeout(300)
    pp.screenshot(path=os.path.join(SHOTS, "phone_sheet.png"))
    ok(pp.evaluate("() => document.documentElement.scrollWidth") <= 390, "phone: the business sheet doesn't scroll sideways")
    pp.click("#fix-reviews"); pp.wait_for_timeout(200)
    pp.screenshot(path=os.path.join(SHOTS, "phone_game_reviews.png"))
    box = pp.locator("#sheetBody [data-k]").last.bounding_box()
    ok(box and box["y"] + box["height"] < 844, "phone: every reply button in the reviews game is on screen")
    ok(not errors, f"no page errors on the phone {errors}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
