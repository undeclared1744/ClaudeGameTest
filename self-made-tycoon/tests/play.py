"""
play.py - Click through the real page like a player would and check every
feature: hustling, the deal generator, buying, expanding, upgrades, events,
saving, coming back later, retiring, save codes, keyboard, a fake game
controller and the phone layout. Screenshots go to tests/shots/.

    python3 tests/play.py           (needs: pip install playwright, and Chrome)
"""
import os, json
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 760})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(600)
    S = lambda expr: page.evaluate("() => " + expr)

    # --- the deal generator ---
    gen = page.evaluate("""() => { const out = { bad: [], tiers: new Set(), names: new Set() };
        T.state.earnedRun = 1e13;            // pretend everything is unlocked
        for (let i = 0; i < 3000; i++) { const l = T.makeListing('any');
          if (/[{}]|undefined/.test(l.name + l.city)) out.bad.push(l.name);
          if (!(l.priceMult > 0.3 && l.priceMult < 2 && l.incMult > 0.4 && l.incMult < 2)) out.bad.push('mult ' + l.name);
          out.tiers.add(T.IND[l.ind].tier); out.names.add(l.name); }
        T.state.earnedRun = 0;
        return { bad: out.bad.slice(0, 5), tiers: out.tiers.size, names: out.names.size }; }""")
    ok(not gen["bad"], f"3000 generated listings have clean names and sane numbers {gen['bad']}")
    ok(gen["tiers"] == 6 and gen["names"] > 800, f"listings span all 6 tiers with lots of variety ({gen['names']} different names)")
    ok(S("T.state.deals.every(l => T.IND[l.ind].tier === 0)"), "a brand-new game only offers side hustles")

    # --- hustling ---
    for _ in range(11):
        page.locator("#hustle").dispatch_event("pointerdown", {"clientX": 300, "clientY": 650})
    ok(S("T.state.stats.taps") == 11 and S("T.state.stats.jobs") == 1, "11 hustles counted, 1 job finished")
    ok(abs(S("T.state.cash") - (11 + 5)) < 0.01, f"cash after 11 hustles + job bonus is $16 (got {S('T.state.cash')})")

    # --- buying a deal ---
    price = S("T.listingPrice(T.state.deals[0])")
    page.evaluate("() => { T.state.cash = 1000; T.render(true); }")
    name = S("T.state.deals[0].name")
    page.click("#deal-0")
    ok(S("T.state.biz.length") == 1 and S("T.state.biz[0].name") == name, f"buying a deal adds '{name}' to your empire")
    paid = S("T.state.biz[0].paid")
    ok(abs(paid - price) < 1e-9, f"it cost exactly the listed price (${price:.2f})")
    ok(S("T.state.deals[0].name") != name, "a fresh listing takes its place")
    page.click("#deal-1", force=True) if S("T.listingPrice(T.state.deals[1]) > T.state.cash") else None
    page.wait_for_timeout(1100)
    ok(S("T.state.cash") > 1000 - price, "the business earns money on its own")

    # --- expanding ---
    page.click("#tab-empire")
    bid = S("T.state.biz[0].id")
    page.evaluate("() => { T.state.cash = 1e6; T.render(true); }")
    c1 = S("T.expandCost(T.state.biz[0], 1)")
    page.click(f"#exp-{bid}")
    ok(S("T.state.biz[0].level") == 2 and S("T.expandCost(T.state.biz[0], 1)") > c1, "expanding adds a level and the next level costs more")
    page.click("#bmmax"); page.click(f"#exp-{bid}")
    lvl = S("T.state.biz[0].level")
    ok(lvl > 10 and S("T.state.cash") < S("T.expandCost(T.state.biz[0], 1)"), f"Max expand went to level {lvl} and spent down to less than one more level")
    ok(S("T.listingPrice({ind: T.state.biz[0].ind, priceMult: 1})") > S("T.IND[T.state.biz[0].ind].cost") * 100, "levels make new businesses of the same kind pricier too")
    page.click("#bm1")

    # --- upgrades ---
    page.click("#tab-upg"); page.wait_for_timeout(300)
    n_up = page.locator("#pane-upg .buy").count()
    ok(n_up > 0, f"upgrades on offer: {n_up}")
    before = S("T.tapValue()"); page.click("#up-boots")
    ok(S("T.tapValue()") > before, "Work Boots raises hustle pay")
    sec = S("T.UPGRADES.find(u => u.kind === 'sector' && T.upgradeAvailable(u))?.id")
    if sec:
        inc0 = S("T.baseIncome()"); page.evaluate(f"() => {{ T.state.cash = 1e9; T.render(true); }}"); page.click(f"#up-{sec}")
        ok(abs(S("T.baseIncome()") / inc0 - 2) < 0.01, f"sector upgrade {sec} doubles that sector's income")
    page.screenshot(path=os.path.join(SHOTS, "deck_upgrades.png"))

    # --- tiers unlock as you earn ---
    page.evaluate("() => { T.state.earnedRun = 2e5; T.refreshDeals(); T.rebuildLists(); }")
    ok(S("T.tierUnlocked()") == 2 and S("T.state.deals.some(l => T.IND[l.ind].tier === 2)"), "earning $200K unlocks Main Street businesses on the board")
    ok(S("document.getElementById('rank').textContent").startswith("MAIN STREET"), "your title changes to Main Street mogul")

    # --- scout cooldown ---
    page.click("#tab-deals")
    k0 = S("T.state.deals.map(l=>l.key).join()"); page.click("#scout")
    k1 = S("T.state.deals.map(l=>l.key).join()"); page.click("#scout", force=True)
    ok(k0 != k1 and S("T.state.deals.map(l=>l.key).join()") == k1, "Scout gives new deals, then has to wait")
    page.screenshot(path=os.path.join(SHOTS, "deck_deals.png"))

    # --- events: every kind, both choices, no crashes ---
    page.evaluate("() => { T.state.cash = 1e7; }")
    fired = page.evaluate("""() => { const titles = new Set();
        for (let i = 0; i < 300; i++) {
          if (!T.state.biz.length) T.state.biz.push({id: 900 + i, ind: 'lawn', name: 'Test Lawn', city: 'Reno', loc: 1, quirk: 0, incMult: 1, level: 1, paid: 25});
          const ev = T.makeEvent(); titles.add(ev.title);
          T.activeEvent = ev; T.chooseEvent(i % ev.options.length); }
        document.getElementById('modalBack').classList.remove('on');
        if (!T.state.biz.length) T.state.biz.push({id: 99, ind: 'lawn', name: 'Test Lawn', city: 'Reno', loc: 1, quirk: 0, incMult: 1, level: 1, paid: 25});
        return [...titles]; }""")
    ok(len(fired) == 6 and not errors, f"all 6 event types fire and both answers work: {fired}")
    ok(S("T.state.cash") >= 0, "events never push cash below zero")
    page.evaluate("() => { T.state.nextEventAt = Date.now() - 1; }"); page.wait_for_timeout(300)
    ok(page.locator("#event").is_visible(), "an event card appears when one is due")
    page.screenshot(path=os.path.join(SHOTS, "deck_event.png"))
    page.click("#ev-opt-0"); page.wait_for_timeout(200)
    ok(not page.locator("#event").is_visible(), "answering closes the event card")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")
    page.evaluate("() => { T.state.nextEventAt = Date.now() - 1; }"); page.wait_for_timeout(300)
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e6; }")
    page.wait_for_timeout(26000)
    ok(not page.locator("#event").is_visible(), "an ignored event goes away after 25s")

    # --- temporary effects are counted correctly over time ---
    page.evaluate("() => { T.state.boomUntil = 0; T.state.biz.forEach(b => { b.viralUntil = 0; b.inspectUntil = 0; }); }")
    inc = S("T.baseIncome()")
    got = page.evaluate("() => { const b = T.state.biz[0]; const t = Date.now(); b.viralUntil = t + 10000; const c0 = T.state.cash; T.earnBetween(t, t + 20000); b.viralUntil = 0; return [T.state.cash - c0, T.bizIncome(b)]; }")
    ok(abs(got[0] - (inc * 20 + got[1] * 9 * 10)) / got[0] < 1e-6, "a 10s viral spike inside a 20s stretch pays exactly 10x for those 10s")

    # --- save, then come back 2 hours later ---
    page.evaluate("() => T.saveNow()")
    saved = json.loads(S("localStorage.getItem('selfMadeTycoon.save.v1')"))
    page.close()
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)))
    S = lambda expr: page.evaluate("() => " + expr)
    page.add_init_script("""if (!sessionStorage.getItem('wound')) { sessionStorage.setItem('wound', '1');
        const s = JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'));
        s.savedAt -= 2*3600e3; s.lastTick -= 2*3600e3; s.boomUntil = 0; s.biz.forEach(b => { b.viralUntil = 0; b.inspectUntil = 0; });
        localStorage.setItem('selfMadeTycoon.save.v1', JSON.stringify(s)); }""")
    page.goto(PAGE); page.wait_for_timeout(700)
    ok(S("T.state.biz.length") == len(saved["biz"]) and S("T.state.biz[0].name") == saved["biz"][0]["name"], "your businesses survive a reload")
    ok(page.locator("#modalBack.on").count() == 1 and "2h" in page.inner_text("#modalText"), "coming back after 2h shows 'While you were out'")
    page.screenshot(path=os.path.join(SHOTS, "deck_offline.png"))
    page.keyboard.press("Enter")
    ok(page.locator("#modalBack.on").count() == 0, "Enter closes the pop-up")
    inc = S("T.baseIncome()")
    page.evaluate("() => { T.state.lastTick = Date.now() - 30*3600e3; T.state.cash = 0; T.catchUp(false); }")
    ok(abs(S("T.state.cash") - inc * 8 * 3600) / (inc * 8 * 3600) < 0.01, "time away is capped at 8 hours")

    # --- damaged save ---
    page.evaluate("() => localStorage.setItem('selfMadeTycoon.save.v1', '{broken')"); page.reload(); page.wait_for_timeout(500)
    ok(S("T.state.cash") >= 0 and S("T.state.deals.length") >= 4 and not errors, "a corrupted save starts a fresh game instead of crashing")

    # --- retiring needs two presses ---
    page.evaluate("() => { T.state.earnedAll = 1e9 * 9; T.state.cash = 1e9; T.state.biz.push({id: 5, ind: 'diner', name: 'X Diner', city: 'Reno', loc: 1, quirk: 0, incMult: 1, level: 3, paid: 1}); T.render(true); }")
    page.click("#tab-retire"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "deck_retire.png"))
    page.click("#retire"); page.wait_for_timeout(400)
    ok(S("T.state.legacy") == 0 and "again" in page.inner_text("#retire").lower(), "first press on Retire only asks to confirm")
    page.click("#retire")
    ok(S("T.state.legacy") == 3 and S("T.state.cash") < 1 and S("T.state.biz.length") == 0, "second press retires: 3 stars, cash and businesses gone")
    ok(abs(S("T.tapValue()") - 1.3) < 1e-9, "3 stars make a fresh hustle worth $1.30 (+30%)")
    page.click("#modalOk")

    # --- save codes ---
    page.evaluate("() => { T.state.cash = 12345; }")
    code = S("T.encodeSave(T.state)")
    page.evaluate("() => { T.state.cash = 1; }")
    page.click("#tab-set"); page.fill("#importBox", code); page.click("#importSave")
    ok(abs(S("T.state.cash") - 12345) < 1, "pasting a save code restores it")
    page.fill("#importBox", "nonsense"); page.click("#importSave")
    ok(abs(S("T.state.cash") - 12345) < 5 and not errors, "a bad save code is rejected safely")
    page.screenshot(path=os.path.join(SHOTS, "deck_stats.png"))

    # --- keyboard ---
    page.click("#tab-deals"); page.focus("#hustle")
    t0 = S("T.state.stats.taps"); page.keyboard.press("Enter")
    ok(S("T.state.stats.taps") == t0 + 1, "Enter on the focused Hustle button hustles")
    page.keyboard.press("ArrowRight")
    ok(S("document.activeElement.id") not in ("hustle", ""), f"ArrowRight moves focus into the ledger ({S('document.activeElement.id')})")

    # --- fake game controller ---
    page.evaluate("""() => {
        window.__pad = { index: 0, mapping: 'standard', axes: [0,0,0,0], buttons: Array.from({length: 17}, () => ({pressed: false})) };
        navigator.getGamepads = () => [window.__pad];
        window.press = async i => { __pad.buttons[i].pressed = true; await new Promise(r => setTimeout(r, 60)); __pad.buttons[i].pressed = false; await new Promise(r => setTimeout(r, 60)); };
    }""")
    t0 = S("T.state.stats.taps")
    page.evaluate("async () => { await press(2); await press(2); await press(2); }")
    ok(S("T.state.stats.taps") == t0 + 3, "controller X hustles once per press")
    page.evaluate("async () => { await press(5); }")
    ok(page.locator("#pane-empire.on").count() == 1, "controller RB switches to the next tab")
    page.evaluate("async () => { await press(3); }")
    ok(S("T.state.buyMode") == "10", "controller Y cycles the expand amount")
    page.evaluate("() => { T.state.nextEventAt = Date.now() - 1; }"); page.wait_for_timeout(300)
    e0 = S("T.state.stats.events"); page.evaluate("async () => { await press(1); }")
    ok(S("T.state.stats.events") == e0 + 1, "controller B takes the offer on an event")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")
    ok(not errors, f"no page errors {errors}")

    # --- a well-developed empire, for the main screenshot ---
    page.evaluate("""() => { T.state = T.validState({ cash: 4.2e7, biz: [], earnedRun: 3e7, earnedAll: 3e7 });
        const ids = ['lawn','detail','courier','phonefix','foodtruck','laundry','copier','coffee','vending','diner','carwash','garage','gym','hvac','hardware','grocery','hotel','insure'];
        ids.forEach((ind, i) => { const l = T.makeListing('any'); l.ind = ind; l.name = l.name; T.state.biz.push({ id: i + 1, ind, name: ind === l.ind ? (T.IND[ind].names[0].replace(/\\{\\w+\\}/g, 'Harbor')) : '', city: 'Tulsa', loc: i % 4, quirk: i % 9, incMult: 1, level: 3 + (i * 7) % 40, paid: 1 }); });
        T.state.nextBizId = 30; T.refreshDeals(); T.rebuildLists(); }""")
    page.click("#tab-deals"); page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(SHOTS, "deck_main.png"))
    page.click("#tab-empire"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "deck_empire.png"))

    # --- phone ---
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pp = ph.new_page(); pp.goto(PAGE); pp.wait_for_timeout(600)
    pp.evaluate("() => { T.state.cash = 3e6; T.state.earnedRun = 2e5; T.refreshDeals(); T.rebuildLists(); }")
    pp.wait_for_timeout(400)
    pp.screenshot(path=os.path.join(SHOTS, "phone_top.png"))
    pp.mouse.wheel(0, 700); pp.wait_for_timeout(300)
    box = pp.locator("#hustle").bounding_box()
    ok(box and box["y"] + box["height"] < 844, "on a phone the Hustle button stays on screen while scrolling")
    ok(pp.evaluate("() => document.documentElement.scrollWidth") <= 390, "phone page doesn't scroll sideways")
    pp.evaluate("() => { T.state.nextEventAt = Date.now() - 1; }"); pp.wait_for_timeout(300)
    pp.screenshot(path=os.path.join(SHOTS, "phone_event.png"))
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
