"""
runit.py - Checks the game inside each business ("Run it", 14-runit-data.js
and 15-runit.js) in the real page: the work button, jobs, hiring crew,
roles unlocking, milestones, gear, rush orders, the "runs without you"
stage and what it does to the sale price, saving, the Fix & sell switch,
keyboard and controller, and the phone layout. Screenshots go to
tests/shots/ (runit_*.png).

    python3 tests/runit.py       (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))
close = lambda a, b, tol=1e-9: abs(a - b) <= tol * max(1, abs(a), abs(b))

# Buy a plain business of kind `ind` through the real buy function, so it
# gets everything a real purchase gets. Returns its id.
BUY = """(ind) => { const l = T.makeListing('any'); l.ind = ind; l.name = 'Test ' + T.IND[ind].name; l.hidden = null; l.checked = true; l.incMult = 1; l.priceMult = 1;
  T.state.deals[0] = l; T.state.cash += T.listingPrice(l); T.buyListing(0);
  document.getElementById('modalBack').classList.remove('on'); return T.state.biz.at(-1).id; }"""

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(600)
    S = lambda expr: page.evaluate("() => " + expr)
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e4; T.refreshDeals(); T.rebuildLists(); }")

    # --- every kind of business has its own theme ---
    bad = S("""T.INDUSTRIES.filter(i => { const t = T.RUN_THEMES[i.id];
        return !t || !t.verb || t.crew.length !== T.CREW_ROLES.length || t.gear.length !== T.GEAR_SLOTS.length || t.jobs.length < 2 || !t.rush.length; }).map(i => i.id)""")
    ok(bad == [], f"all {S('T.INDUSTRIES.length')} kinds of business have a full theme (missing: {bad})")
    ok(S("new Set(T.INDUSTRIES.map(i => T.RUN_THEMES[i.id].verb)).size") >= 30, "and they don't all share one verb")

    # --- buying gives a business its own game ---
    bid = page.evaluate(BUY, "lawn")
    b0 = S("T.state.biz.at(-1)")
    ok(b0["crew"] == [0, 0, 0, 0] and b0["gear"] == [False, False, False] and b0["jobStep"] == 0, "a new business starts with no crew, no gear, job 0")
    page.click("#tab-empire"); page.wait_for_timeout(200)
    ok(page.locator(f"#run-{bid}").count() == 1, "its Empire card has a Run it button")
    page.click(f"#run-{bid}"); page.wait_for_timeout(200)
    ok(page.locator("#sheetBack.on").count() == 1 and S("T.sheetMode") == "run", "Run it opens the business in the Run it view")
    ok(S("document.activeElement.id") == "runTap", "the work button has focus (A / Enter works straight away)")
    ok(page.inner_text("#runTap").startswith("MOW"), f"the work button is themed: '{page.inner_text('#runTap').splitlines()[0]}'")
    page.screenshot(path=os.path.join(SHOTS, "runit_deck_new.png"))

    # --- working ---
    page.evaluate("() => { T.state.cash = 0; T.state.earnedRun = 2e4; T.render(true); }")
    v = S(f"T.runTapValue(T.state.biz.find(b => b.id === {bid}))")
    expect = S(f"T.tapValue() + T.bizIncome(T.state.biz.find(b => b.id === {bid})) * 0.2")
    ok(close(v, expect), f"one press pays a Hustle plus 0.2 seconds of the business's income (${v:.2f})")
    job0 = page.inner_text("#runJob")
    c0 = S("T.state.cash")
    for _ in range(9): page.click("#runTap")
    ok(S(f"T.state.biz.find(b => b.id === {bid}).jobStep") == 9 and "9 / 10" in page.inner_text("#runJobN"), "each press moves the job along (9 / 10)")
    page.click("#runTap"); page.wait_for_timeout(50)
    gained = S("T.state.cash") - c0
    ok(gained > v * 14.5 and S(f"T.state.biz.find(b => b.id === {bid}).jobStep") == 0, f"the 10th press finishes the job with a bonus (10 presses paid ${gained:.2f}, about 15 presses' worth)")
    ok(page.inner_text("#runJob") != job0, "and the next job comes up")
    ok(S("T.state.stats.runTaps") == 10 and S("T.state.stats.taps") == 0, "presses count as work in your businesses, not as Hustles")

    # --- hiring ---
    page.evaluate("() => { T.state.cash = 1e6; T.render(true); }")
    B = f"T.state.biz.find(b => b.id === {bid})"
    inc0 = S(f"T.bizIncome({B})"); cost1 = S(f"T.crewCost({B}, 0, 1)"); paid0 = S(f"{B}.paid")
    ok(close(cost1, S(f"T.expandCost({B}, 1)")), f"the first hire costs the same as one more level (${cost1:.2f})")
    page.click("#crew-0"); page.wait_for_timeout(50)
    ok(close(S(f"T.bizIncome({B})"), inc0 * 1.1), "one hire of the first role: +10% income")
    ok(close(S(f"T.crewCost({B}, 0, 1)"), cost1 * 1.2), "the next one costs 20% more")
    ok(close(S(f"{B}.paid"), paid0 + cost1), "what you spent on the crew counts as money put into the business")
    ok(page.locator("#crew-1").count() == 0, "the second role is still hidden after one hire")
    page.click("#crew-0"); page.click("#crew-0"); page.wait_for_timeout(50)
    ok(page.locator("#crew-1").count() == 1, f"hiring 3 unlocks the second role ({page.inner_text('#sheetBody .crew-row >> nth=1').splitlines()[0]})")
    ok(S("document.activeElement.id") == "crew-0", "focus stays on the hire button through the redraw")

    # --- x10 / Max and the milestone ---
    page.click("#rm10"); page.wait_for_timeout(50)
    ok("hire +10" in page.inner_text("#crew-0"), "x10 makes the hire button buy 10")
    page.click("#crew-0"); page.wait_for_timeout(50)
    ok(S(f"{B}.crew[0]") == 13, "x10 hired 10 more (13 now)")
    ok(close(S(f"T.crewAdds({B}, 0)"), 13 * 0.1 * 2), "10+ of a role: each adds double (13 x 10% x 2 = +260%)")
    page.evaluate(f"() => {{ T.state.cash = T.crewCost({B}, 1, 1) * 3.5; T.render(true); }}")
    page.click("#rmmax"); page.wait_for_timeout(50)
    page.click("#crew-1"); page.wait_for_timeout(50)
    ok(S(f"{B}.crew[1]") == 2 and S(f"T.state.cash < T.crewCost({B}, 1, 1)"), "Max hires as many as you can afford (2 of the second role) and spends down")
    page.click("#rm1")

    # --- gear ---
    page.evaluate("() => { T.state.cash = 1e9; T.render(true); }")
    tv = S(f"T.runTapValue({B})")
    page.click("#gear-0"); page.wait_for_timeout(50)
    ok(close(S(f"T.runTapValue({B})"), tv * 2), "the first gear doubles what your own work pays")
    ok(page.locator("#gear-0").count() == 0 and "Owned" in page.inner_text("#sheetBody"), "and shows as owned")
    a0 = S(f"T.crewAdds({B}, 0)")
    page.click("#gear-1"); page.wait_for_timeout(50)
    ok(close(S(f"T.crewAdds({B}, 0)"), a0 * 1.5), "the second gear: every crew role adds 50% more")
    ok(not page.evaluate(f"() => T.buyGear({bid}, 1)"), "the same gear can't be bought twice")
    page.screenshot(path=os.path.join(SHOTS, "runit_deck_crew.png"))

    # --- stage and the sale price ---
    st = S(f"T.runStage({B})")
    ok(st >= 2, f"with this crew it '{S(f'T.RUN_STAGES[T.runStage({B})].name')}'")
    page.click("#sheetClose"); page.wait_for_timeout(300)
    ok(S(f"T.RUN_STAGES[{st}].name") in page.inner_text("#empireList"), "the Empire card shows that stage")
    ok(close(S(f"T.runSaleMult({B})"), 1.5), f"buyers pay the full +50% for it (crew adds +{S(f'T.crewBonus({B})') * 100:.0f}%, capped)")
    base = S(f"T.saleValue(T.runDefaults(Object.assign({{}}, {B})))")     # the same business with no crew
    ok(close(S(f"T.saleValue({B})"), base * 1.5), "and the sale value includes it")
    # The cap means hiring then selling can't be a money machine: what the
    # extra 50% brings in is less than the crew cost, for any business.
    # (The test business goes into your empire while it's measured: crew
    # prices follow what one more level costs, which depends on how many
    # levels of that kind you own, and a level-60 business is 60 of them.)
    worst = S("""(() => { let worst = 0; const keep = T.state.biz; for (const ind of T.INDUSTRIES) { for (const level of [1, 5, 10, 25, 60]) {
        const b = T.runDefaults({ id: 999, ind: ind.id, incMult: 1, level, paid: 0, hidden: null }); T.state.biz = [b];
        let spent = 0; while (T.crewBonus(b) < 2) { spent += T.crewCost(b, 0, 1); b.crew[0]++; }
        const extra = T.saleValue(b) - T.saleValue(T.runDefaults(Object.assign({}, b)));
        worst = Math.max(worst, extra / spent); } } T.state.biz = keep; return worst; })()""")
    ok(worst < 1, f"for every kind and size of business, the +50% a buyer pays is less than the crew cost (worst {worst:.0%} of it back)")

    # --- rush orders ---
    page.click(f"#run-{bid}"); page.wait_for_timeout(200)
    page.evaluate("() => { T.runRushNextAt = 0; T.updateRush(Date.now()); T.renderRun(); }")
    ok(page.locator("#runRush").is_visible(), f"a rush order shows up: '{page.inner_text('#runRushBtn')[:60]}...'")
    pay = S(f"T.bizIncome({B}) * 30"); c1 = S("T.state.cash")
    page.keyboard.press("r"); page.wait_for_timeout(50)
    ok(close(S("T.state.cash") - c1, pay, 0.01) and not page.locator("#runRush").is_visible(), "R takes it: 30 seconds of the business's income, and it's gone")
    page.evaluate("() => { T.runRushNextAt = 0; T.updateRush(Date.now()); T.renderRun(); }")
    page.evaluate("() => T.updateRush(Date.now() + 13e3)"); page.evaluate("() => T.renderRun()")
    ok(not page.locator("#runRush").is_visible() and S("T.runRush") is None, "an ignored rush order goes away after 12 seconds")

    # --- keyboard ---
    page.evaluate("() => document.activeElement.blur()")
    s0 = S(f"{B}.jobStep")
    page.keyboard.press("x"); page.keyboard.press("Space")
    ok(S(f"{B}.jobStep") == (s0 + 2) % 10, "X and Space work the button from the keyboard")

    # --- switching views ---
    page.click("#vsInfo"); page.wait_for_timeout(100)
    ok("Sell it" in page.inner_text("#sheetBody").title() or "SELL IT" in page.inner_text("#sheetBody"), "Fix & sell switches to the fix-up and selling view")
    ok("for the crew you built" in page.inner_text("#sheetBody"), "which says the sale price includes the crew")
    page.click("#vsRun"); page.wait_for_timeout(100)
    ok(page.locator("#runTap").count() == 1, "Run it switches back")
    page.keyboard.press("Escape")
    ok(page.locator("#sheetBack.on").count() == 0, "Escape closes it")

    # --- saving ---
    page.evaluate("() => T.saveNow()")
    loaded = S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).biz.find(b => b.id === %d)" % bid)
    now = S(B)
    ok(loaded["crew"] == now["crew"] and loaded["gear"] == now["gear"], f"crew {now['crew']} and gear survive a reload")
    old = S("T.validState({ cash: 1, biz: [{ id: 1, ind: 'lawn', level: 3, incMult: 1 }] }).biz[0]")
    ok(old["crew"] == [0, 0, 0, 0] and old["gear"] == [False, False, False], "a save from before this feature loads with an empty crew")
    junk = S("T.validState({ cash: 1, biz: [{ id: 1, ind: 'lawn', crew: [-4, 'x', 2.7, 1e3, 9], gear: 'yes', jobStep: 99 }] }).biz[0]")
    ok(junk["crew"] == [0, 0, 2, 1000] and junk["gear"] == [False, False, False] and junk["jobStep"] == 9, "broken crew/gear numbers are repaired, not trusted")

    # --- away earnings count the crew ---
    page.evaluate("() => { T.state.cash = 0; T.state.lastTick = Date.now() - 600e3; T.catchUp(false); }")
    ok(S("T.state.cash") >= S("T.baseIncome()") * 600 * 0.999, "time away pays at the crew-boosted rate")
    page.evaluate("() => document.getElementById('modalBack').classList.remove('on')")

    # --- controller ---
    page.evaluate("""() => {
        window.__pad = { index: 0, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({length: 17}, () => ({pressed: false})) };
        navigator.getGamepads = () => [window.__pad];
        window.press = async i => { __pad.buttons[i].pressed = true; await new Promise(r => setTimeout(r, 60)); __pad.buttons[i].pressed = false; await new Promise(r => setTimeout(r, 60)); }; }""")
    page.focus(f"#run-{bid}"); page.evaluate("async () => { await press(0); }")
    ok(page.locator("#sheetBack.on").count() == 1 and S("T.sheetMode") == "run", "controller A on Run it opens the game")
    s0 = S(f"{B}.jobStep")
    page.evaluate("async () => { await press(2); await press(0); }")
    ok(S(f"{B}.jobStep") == (s0 + 2) % 10, "X works, and A on the focused work button works too")
    page.evaluate("async () => { await press(3); }")
    ok(S("T.state.buyMode") == "10" and "hire +10" in page.inner_text("#crew-0"), "Y switches hiring to x10")
    page.evaluate("async () => { await press(3); await press(3); }")
    page.evaluate("() => { T.runRushNextAt = 0; T.updateRush(Date.now()); T.renderRun(); }")
    r0 = S("T.state.stats.runRushes")
    page.evaluate("async () => { await press(5); }")
    ok(S("T.state.stats.runRushes") == r0 + 1, "RB takes a rush order")
    ok(page.locator("#runPad.on").count() == 1, "controller hints show inside the game once a controller is seen")
    page.evaluate("async () => { await press(13); await press(13); await press(13); }")
    ok(S("document.getElementById('sheetBack').contains(document.activeElement)"), "the D-pad keeps focus inside the game")
    page.evaluate("async () => { await press(1); }")
    ok(page.locator("#sheetBack.on").count() == 0, "B closes it")

    # --- a business you sell while its game is open ---
    page.click(f"#run-{bid}"); page.wait_for_timeout(100)
    page.evaluate(f"() => {{ const b = {B}; b.selling = {{ until: Date.now() - 1 }}; T.finishProjects(); }}")
    page.wait_for_timeout(100)
    ok(page.locator("#sheetBack.on").count() == 0 and S(f"!T.state.biz.some(b => b.id === {bid})"), "selling a business closes its game cleanly")
    page.evaluate("() => document.getElementById('modalBack').classList.remove('on')")

    # --- retiring starts every business over ---
    page.evaluate("() => { T.state.earnedAll = 4e9; T.retire(); document.getElementById('modalBack').classList.remove('on'); }")
    ok(S("T.state.biz.length") == 0 and S("T.state.stats.crew") > 0, "retiring clears your businesses (and their crews) but keeps the stats")
    ok(not errors, f"no page errors {errors}")

    # --- phone ---
    ph = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(str(e))); pp.goto(PAGE); pp.wait_for_timeout(600)
    pp.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e6; T.refreshDeals(); }")
    pid = pp.evaluate(BUY, "coffee")
    pp.evaluate(f"() => {{ const b = T.state.biz.at(-1); b.crew = [12, 4, 0, 0]; b.gear[0] = true; T.state.cash = 4e5; T.showTab('empire'); T.openSheet({pid}, 'run'); }}")
    pp.wait_for_timeout(300)
    ok(pp.evaluate("() => document.documentElement.scrollWidth") <= 390, "phone: the game doesn't scroll sideways")
    tap = pp.locator("#runTap").bounding_box()
    ok(tap and tap["y"] + tap["height"] < 844 and tap["height"] >= 48, "phone: the work button is on screen without scrolling, and big enough for a thumb")
    hire = pp.locator("#crew-0").bounding_box(); row = pp.locator(".crew-row >> nth=0").bounding_box()
    ok(hire and row and hire["y"] < row["y"] + row["height"] / 2 + 10 and hire["x"] > row["x"] + row["width"] / 2, "phone: hire buttons sit beside their role, not under it")
    c0 = pp.evaluate("() => T.state.cash")
    for _ in range(5): pp.tap("#runTap")
    ok(pp.evaluate("() => T.state.stats.runTaps") == 5 and pp.evaluate("() => T.state.cash") > c0, "phone: tapping the work button works")
    pp.evaluate("() => { T.runRushNextAt = 0; T.updateRush(Date.now()); T.renderRun(); }"); pp.wait_for_timeout(1200)
    pp.screenshot(path=os.path.join(SHOTS, "runit_phone.png"))
    pp.evaluate("() => document.querySelector('.sheet').scrollTop = 9999"); pp.wait_for_timeout(200)
    pp.screenshot(path=os.path.join(SHOTS, "runit_phone_bottom.png"))
    ok(not errors, f"no page errors on the phone {errors}")
    br.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
