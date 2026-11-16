"""
scouting.py - Checks Deal sense: getting better at finding businesses as you
do more deals. XP from checking, buying, fixing and selling; each level's
perk; and that it survives retiring and saving. Screenshots go to tests/shots/.

    python3 tests/scouting.py       (needs: pip install playwright, and Chrome)
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
    page.goto(PAGE); page.wait_for_timeout(600)
    S = lambda expr: page.evaluate("() => " + expr)
    lvl_xp = S("T.SCOUT_LEVELS.map(L => L.xp)")
    def set_level(n):
        page.evaluate(f"() => {{ T.state.scoutXp = {lvl_xp[n]}; T.state.nextEventAt = Date.now() + 1e9; T.refreshDeals(); T.rebuildLists(); }}")

    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.cash = 1e5; T.state.earnedRun = 2e4; T.refreshDeals(); T.rebuildLists(); }")
    ok(S("T.scoutLevel()") == 0 and S("T.state.deals.length") == 4, "a new player is a Rookie with 4 listings")
    ok("Deal sense: Rookie" in page.text_content("#senseName") and "0 / 8 XP" in page.text_content("#senseXp"), "the Deals tab shows your Deal sense and XP")

    # --- XP from doing deals ---
    page.click("#dd-0"); page.wait_for_timeout(100)
    ok(S("T.state.scoutXp") == 1, "due diligence gives 1 XP")
    page.click("#deal-0"); page.wait_for_timeout(100)
    if page.locator("#modalBack.on").count(): page.click("#modalOk")
    ok(S("T.state.scoutXp") == 2, "buying gives 1 XP")
    ok("2 / 8 XP" in page.text_content("#senseXp"), "the XP counter updates")

    # --- each perk ---
    page.evaluate("() => { T.state.scoutXp = 7; T.refreshDeals(); T.rebuildLists(); }")
    c0 = S("T.ddCost(T.state.deals[0])")
    page.evaluate("() => T.gainScoutXp('check')")
    ok(S("T.scoutLevel()") == 1 and abs(S("T.ddCost(T.state.deals[0])") / c0 - 0.5) < 1e-9, "level 1 'Has an eye': due diligence costs half")
    ok("Deal sense up" in page.text_content("#toast"), "levelling up says so")
    page.evaluate(f"() => {{ T.state.scoutXp = {lvl_xp[2] - 1}; T.gainScoutXp('check'); T.rebuildLists(); }}")
    ok(S("T.state.deals.length") == 5, "level 2 'Deal hunter': a 5th listing shows up right away")
    set_level(3)
    page.evaluate("() => { T.state.deals.forEach((l, i) => { l.hidden = i % 2 ? 'taxes' : null; l.checked = false; l.key = 'k' + i; }); T.rebuildLists(); }")
    warn = S("[...document.querySelectorAll('#dealList .biz')].map(r => r.textContent.includes('Something feels off'))")
    ok(warn == [i % 2 == 1 for i in range(len(warn))], "level 3 'Gut feeling': only listings hiding a problem get a warning")
    avg = lambda: S("(() => { let t = 0; for (let i = 0; i < 4000; i++) { const l = T.makeListing('any'); t += l.priceMult / (T.LOCS[l.loc].price * T.QUIRKS[l.quirk].price); } return t / 4000; })()")
    a3 = avg(); set_level(4); a4 = avg()
    ok(abs(a3 - 1) < 0.01 and abs(a4 - 0.94) < 0.01, f"level 4 'Sharp negotiator': asking prices about 6% lower ({a3:.3f} -> {a4:.3f})")
    set_level(5)
    last = S("T.state.deals[T.state.deals.length - 1]")
    ok(last.get("offMarket") is True and "Off-market" in page.inner_text("#dealList"), "level 5 'Well connected': the last listing is an off-market deal")
    ok(S("Math.round((T.state.dealsRefreshAt - Date.now()) / 1000)") in (99, 100), "and the board refreshes every 100s instead of 150s")
    page.click("#scout")
    ok(S("Math.round((T.state.scoutReadyAt - Date.now()) / 1000)") in (22, 23), "and Scout recharges in 22.5s instead of 45s")
    page.screenshot(path=os.path.join(SHOTS, "deck_deal_sense.png"))
    set_level(6)
    ok(S("T.state.deals.length") == 6 and S("T.ddCost(T.state.deals[0])") == 0 and "free" in page.inner_text("#dealList"), "level 6 'Legendary dealmaker': 6 listings and free due diligence")
    ok("max level" in page.text_content("#senseXp"), "the top level says so")

    # --- it lasts ---
    page.evaluate("() => { T.state.scoutXp = 70; T.state.earnedAll = 4e9; T.retire(); }")
    ok(S("T.state.scoutXp") == 70 and S("T.state.biz.length") == 0, "retiring keeps your Deal sense")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")
    page.evaluate("() => T.saveNow()")
    ok(S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).scoutXp") == 70, "Deal sense is saved")
    ok(S("T.validState({ cash: 1, biz: [], scoutXp: 'lots' }).scoutXp") == 0, "a broken XP value in a save resets to 0")
    page.click("#tab-set"); page.click("#wipe"); page.click("#wipe"); page.wait_for_timeout(100)
    ok(S("T.state.scoutXp") == 0, "wiping the save resets Deal sense")
    ok(not errors, f"no page errors {errors}")

    # --- phone ---
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(str(e))); pp.goto(PAGE); pp.wait_for_timeout(600)
    pp.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.scoutXp = 230; T.state.cash = 5e5; T.state.earnedRun = 2e5; T.refreshDeals(); T.state.deals[1].hidden = 'roof'; T.rebuildLists(); }")
    pp.wait_for_timeout(300); pp.mouse.wheel(0, 400); pp.wait_for_timeout(300)
    pp.screenshot(path=os.path.join(SHOTS, "phone_deal_sense.png"))
    ok(pp.evaluate("() => document.documentElement.scrollWidth") <= 390, "phone: the Deals tab doesn't scroll sideways")
    ok(not errors, f"no page errors on the phone {errors}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
