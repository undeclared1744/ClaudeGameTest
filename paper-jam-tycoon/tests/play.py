"""
play.py - Click through the real page like a player would and check each
feature works: tapping, buying, rush calls, saving, coming back later,
selling, save codes, keyboard and a fake game controller.
Saves screenshots to tests/shots/.

    python3 tests/play.py
"""
import os, json, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
ok = lambda cond, msg: print(("PASS " if cond else "FAIL ") + msg) or cond
results = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 760})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(600)
    S = lambda expr: page.evaluate("() => " + expr)

    # --- tapping ---
    for _ in range(9):
        page.locator("#start").dispatch_event("pointerdown", {"clientX": 300, "clientY": 600})
    results.append(ok(S("PJ.state.stats.taps") == 9 and S("PJ.state.stats.calls") == 1, "9 taps = 9 taps counted, 1 call closed"))
    results.append(ok(abs(S("PJ.state.cash") - (9 + 5)) < 0.01, f"cash after 9 taps + call bonus is $14 (got {S('PJ.state.cash')})"))

    # --- buying ---
    page.evaluate("() => { PJ.state.cash = 20; PJ.render(true); }")
    page.click("#buy-intern")
    results.append(ok(S("PJ.state.owned[0]") == 1 and abs(S("PJ.state.cash") - 5) < 0.01, "buying an Intern costs $15"))
    page.click("#buy-intern", force=True)   # cannot afford: shows a message instead
    results.append(ok(S("PJ.state.owned[0]") == 1, "can't buy what you can't afford"))
    page.evaluate("() => { PJ.state.cash = 1e5; PJ.render(true); }")
    page.click("#bmmax"); page.click("#buy-intern")
    n = S("PJ.state.owned[0]"); cash = S("PJ.state.cash")
    results.append(ok(n > 30 and cash < S("PJ.costOf(0,1)"), f"Max buy bought {n} interns and left less than the next one costs"))
    page.click("#bm1")
    page.wait_for_timeout(1100)
    results.append(ok(S("PJ.state.cash") > cash, "idle income ticks up in real time"))

    # --- upgrades tab ---
    page.click("#tab-upg"); page.wait_for_timeout(300)
    btns = page.locator("#pane-upg .buy")
    results.append(ok(btns.count() > 0, f"upgrades offered: {btns.count()}"))
    before = S("PJ.tapValue()")
    page.click("#up-tap1")
    results.append(ok(S("PJ.tapValue()") > before, "Steady Hands raises tap value"))
    page.screenshot(path=os.path.join(SHOTS, "deck_upgrades.png"))
    page.click("#tab-crew")

    # --- rush call ---
    page.evaluate("() => { PJ.state.nextRushAt = Date.now() - 1; }"); page.wait_for_timeout(300)
    results.append(ok(page.locator("#rush").is_visible(), "rush call appears when due"))
    page.screenshot(path=os.path.join(SHOTS, "deck_rush.png"))
    c0 = S("PJ.state.cash"); page.click("#rush"); page.wait_for_timeout(200)
    got = S("PJ.state.cash") > c0 + 100 or S("PJ.state.overtimeUntil > Date.now()")
    results.append(ok(got and S("PJ.state.stats.rushes") == 1, "taking a rush call pays out or starts overtime"))
    if page.locator("#modalBack.on").count(): page.click("#modalOk")
    page.evaluate("() => { PJ.state.nextRushAt = Date.now() - 1; }"); page.wait_for_timeout(200)
    page.evaluate("() => { PJ.state.nextRushAt = Date.now() + 1e6; }")
    page.wait_for_timeout(14000)
    results.append(ok(not page.locator("#rush").is_visible(), "an ignored rush call goes away after 13s"))

    # --- save + come back 2 hours later ---
    page.evaluate("() => PJ.saveNow()")
    saved = json.loads(S("localStorage.getItem('paperJamTycoon.save.v1')"))
    page.close()   # closing saves again, so wind the clock back afterwards, before the game starts
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    S = lambda expr: page.evaluate("() => " + expr)
    page.add_init_script("""if (!sessionStorage.getItem('wound')) { sessionStorage.setItem('wound', '1');
        const s = JSON.parse(localStorage.getItem('paperJamTycoon.save.v1'));
        s.savedAt -= 2*3600e3; s.lastTick -= 2*3600e3; s.overtimeUntil = 0;
        localStorage.setItem('paperJamTycoon.save.v1', JSON.stringify(s)); }""")
    page.goto(PAGE); page.wait_for_timeout(700)
    results.append(ok(S("PJ.state.owned[0]") == saved["owned"][0], "save survives a reload"))
    modal = page.locator("#modalBack.on")
    results.append(ok(modal.count() == 1 and "2h" in page.inner_text("#modalText"), "coming back after 2h shows 'While you were out'"))
    page.screenshot(path=os.path.join(SHOTS, "deck_offline.png"))
    page.keyboard.press("Enter")
    results.append(ok(page.locator("#modalBack.on").count() == 0, "Enter closes the pop-up"))

    # --- 30-hour absence is capped at 8h ---
    inc = S("PJ.baseIncome()")
    page.evaluate("() => { PJ.state.lastTick = Date.now() - 30*3600e3; PJ.state.cash = 0; PJ.catchUp(false); }")
    results.append(ok(abs(S("PJ.state.cash") - inc * 8 * 3600) / (inc * 8 * 3600) < 0.01, "time away is capped at 8 hours"))

    # --- damaged saves don't crash ---
    page.evaluate("() => localStorage.setItem('paperJamTycoon.save.v1', '{broken')"); page.reload(); page.wait_for_timeout(500)
    results.append(ok(S("PJ.state.cash") >= 0 and not errors, "a corrupted save starts a fresh game instead of crashing"))

    # --- selling (prestige) needs two presses ---
    page.evaluate("() => { PJ.state.earnedAll = 5e7 * 16; PJ.state.cash = 1e9; PJ.state.owned[3] = 20; PJ.render(true); }")
    if page.locator("#modalBack.on").count():   # a pop-up that came up on its own (e.g. a rush-call payout) must be closed first
        print("     (closing pop-up: " + page.inner_text("#modalTitle") + " / " + page.inner_text("#modalText") + ")")
        page.click("#modalOk")
    page.click("#tab-fran"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "deck_franchise.png"))
    page.click("#prestige")
    results.append(ok(S("PJ.state.rep") == 0 and "again" in page.inner_text("#prestige").lower(), "first press on Sell only asks to confirm"))
    page.click("#prestige")
    results.append(ok(S("PJ.state.rep") == 4 and S("PJ.state.cash") < 1 and S("PJ.state.owned[3]") == 0, "second press sells: 4 stars, cash and crew reset"))
    results.append(ok(abs(S("PJ.tapValue()") - 1.4) < 0.001, "4 stars make a fresh tap worth $1.40 (+40%)"))
    page.click("#modalOk")

    # --- save code export / import ---
    page.evaluate("() => { PJ.state.cash = 12345; }")
    code = S("PJ.encodeSave(PJ.state)")
    page.evaluate("() => { PJ.state.cash = 1; }")
    page.click("#tab-set"); page.fill("#importBox", code); page.click("#importSave")
    results.append(ok(abs(S("PJ.state.cash") - 12345) < 1, "pasting a save code restores it"))
    page.fill("#importBox", "nonsense"); page.click("#importSave")
    results.append(ok(abs(S("PJ.state.cash") - 12345) < 5 and not errors, "a bad save code is rejected safely"))
    page.screenshot(path=os.path.join(SHOTS, "deck_stats.png"))

    # --- keyboard: arrows move focus, space taps ---
    page.click("#tab-crew"); page.focus("#start")
    t0 = S("PJ.state.stats.taps"); page.keyboard.press("Enter")
    results.append(ok(S("PJ.state.stats.taps") == t0 + 1, "Enter on the focused green button taps"))
    page.keyboard.press("ArrowRight")
    results.append(ok(S("document.activeElement.id") != "start", f"ArrowRight moves focus to the shop ({S('document.activeElement.id')})"))

    # --- fake game controller ---
    page.evaluate("""() => {
        window.__pad = { index: 0, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({length: 17}, () => ({pressed: false})) };
        navigator.getGamepads = () => [window.__pad];
        window.press = async i => { __pad.buttons[i].pressed = true; await new Promise(r => setTimeout(r, 60)); __pad.buttons[i].pressed = false; await new Promise(r => setTimeout(r, 60)); };
    }""")
    t0 = S("PJ.state.stats.taps")
    page.evaluate("async () => { await press(2); await press(2); await press(2); }")
    results.append(ok(S("PJ.state.stats.taps") == t0 + 3, "controller X taps once per press (holding doesn't repeat)"))
    page.evaluate("async () => { await press(5); }")
    results.append(ok(page.locator("#pane-upg.on").count() == 1, "controller RB switches to the next tab"))
    page.evaluate("async () => { await press(4); await press(3); }")
    results.append(ok(S("PJ.state.buyMode") == "10", "controller Y cycles the buy amount"))
    results.append(ok(page.locator("#padHints.on").count() == 1, "controller button hints appear once a pad is seen"))
    page.evaluate("async () => { await press(1); }")   # B with no rush: nothing happens, no error
    page.screenshot(path=os.path.join(SHOTS, "deck_main.png"))

    results.append(ok(not errors, f"no page errors ({errors})"))

    # --- phone layout ---
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pp = ph.new_page(); pp.goto(PAGE); pp.wait_for_timeout(600)
    pp.evaluate("() => { PJ.state.cash = 3e6; PJ.state.owned = [25,12,6,3,1,0,0,0,0]; PJ.state.earnedRun = 5e6; PJ.rebuildLists(); }")
    pp.wait_for_timeout(400)
    pp.screenshot(path=os.path.join(SHOTS, "phone_top.png"))
    pp.mouse.wheel(0, 600); pp.wait_for_timeout(300)
    pp.screenshot(path=os.path.join(SHOTS, "phone_scrolled.png"))
    start_box = pp.locator("#start").bounding_box()
    results.append(ok(start_box and start_box["y"] + start_box["height"] < 844, "on a phone the green button stays on screen while scrolling"))
    wide = pp.evaluate("() => document.documentElement.scrollWidth")
    results.append(ok(wide <= 390, f"phone page doesn't scroll sideways (width {wide})"))
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
