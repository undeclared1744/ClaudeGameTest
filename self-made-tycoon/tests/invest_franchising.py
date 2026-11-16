"""
invest_franchising.py - Checks Franchising (src/js/30-investments/franchising.js):
which businesses can be franchised, launching a brand, locations opening over
time with fees and royalties (also across 8 hours away), the brand's size
following its flagship, the "franchisee cutting corners" event, saves, and the
card on desktop and phone. Screenshots go to tests/shots/.

    python3 tests/invest_franchising.py    (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

# A business you own, in the same shape buyListing() makes
def biz_js(id, ind, level, extra=""):
    return (f"T.state.biz.push({{ id: {id}, ind: '{ind}', name: 'Test {ind} {id}', city: 'Reno', loc: 1, quirk: 0, incMult: 1, level: {level}, "
            f"paid: 1, viralUntil: 0, inspectUntil: 0, hidden: null, fixing: null, selling: null, fixRetryAt: 0 {extra} }});")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    J = lambda js: page.evaluate("() => { " + js + " }")
    J("T.state.nextEventAt = Date.now() + 1e9;")
    F = "T.invTests.franchising"

    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-franchising"), "the card is locked before Main Street (tier 2)")
    J("T.state.earnedRun = 2e5; T.state.cash = 1e5; T.rebuildLists();"); page.wait_for_timeout(300)
    ok("get it to level 10 with no problems" in page.inner_text("#inv-franchising"), "once unlocked, it explains what a business needs to be franchised")

    # --- who can be franchised ---
    J(biz_js(1, "diner", 9) + biz_js(2, "hospital", 1) + biz_js(3, "carwash", 12, ", hidden: 'staff'") + biz_js(4, "gym", 10, ", selling: { until: Date.now() + 1e6 }") + "T.rebuildLists();")
    ok(S(f"{F}.ready().length") == 0, "not ready: level 9, a hospital, a hidden problem, or up for sale")
    ok(S(f"{F}.notReady(T.state.biz[1])") == "not a franchise kind of business", "a hospital group can't be franchised")
    ok(S(f"{F}.notReady(T.state.biz[2])") == "fix its problems first", "a business with problems has to be fixed first")
    J("T.state.biz[0].level = 10; T.rebuildLists();"); page.wait_for_timeout(300)
    ok(S(f"{F}.ready().map(b => b.id).join()") == "1" and page.locator("#fr-launch-1").count() == 1, "a level-10 diner with no problems is ready, with a Launch button")
    cost = S(f"{F}.launchCost(T.state.biz[0])")
    full = S(f"T.IND.diner.income * {F}.FR.royaltyShare * 30")
    ok(abs(cost / full - 3000) < 3000 * 0.06, f"launch cost pays back in about 50 minutes at the starting size ({cost / full / 60:.0f} min)")
    J("T.state.cash = 0;"); page.wait_for_timeout(300)
    ok(page.get_attribute("#fr-launch-1", "aria-disabled") == "true", "the Launch button is greyed out when you can't afford it")
    ok(S(f"{F}.launch(1)") is False and S("T.inv('franchising').brands.length") == 0, "and launching without the cash does nothing")
    page.screenshot(path=os.path.join(SHOTS, "franchising-ready.png"))

    # --- launch ---
    J(f"T.state.cash = {cost} + 1000; T.rebuildLists();"); page.wait_for_timeout(200)
    # press the real button, and read cash right before and after in the same instant
    spent = S("(() => { const c0 = T.state.cash; document.getElementById('fr-launch-1').click(); return c0 - T.state.cash; })()")
    page.wait_for_timeout(300)
    ok(abs(spent - cost) < 1 and S("T.inv('franchising').brands.length") == 1, "launching takes the cost and starts a brand")
    ok("0 / 30 locations" in page.inner_text("#inv-franchising"), "the brand starts with 0 of 30 locations (3 per flagship level)")
    ok(page.locator("#fr-launch-1").count() == 0 and S(f"{F}.notReady(T.state.biz[0])") == "you already franchise this kind", "one brand per kind of business")

    # --- locations open over time ---
    every = S(f"{F}.FR.openSeconds(2)")
    ok(every == 50, f"a Main Street brand gets a new location every 50 seconds ({every})")
    per = S(f"{F}.royaltyPer('diner')")
    # earn() and the cash it adds, measured in one instant (the game loop keeps earning between calls)
    r = S(f"(() => {{ const c0 = T.state.cash, e0 = T.state.earnedRun; const got = T.MODULES.find(m => m.id === 'franchising').earn({every} + 1); return {{ got, cash: T.state.cash - c0, earned: T.state.earnedRun - e0 }}; }})()")
    br = S("T.inv('franchising').brands[0]")
    ok(br["locs"] == 1, "after one opening interval, the first franchisee opens")
    ok(abs(r["cash"] - (per * 120 + per * 1)) < per * 0.5 and abs(r["got"] - r["cash"]) < 1e-6, "the opening pays a franchise fee, then royalties start")
    ok(abs(r["earned"] - r["cash"]) < 1e-6, "fees and royalties count as earnings")
    ok(abs(S("T.investNet()") - per) < 1e-6 and "/sec" in page.inner_text("#ips"), "royalties count toward your $/sec")
    # 8 hours away (the host caps away time at 8 hours)
    J("T.MODULES.find(m => m.id === 'franchising').earn(8 * 3600);")
    ok(S("T.inv('franchising').brands[0].locs") == 30, "after a long time away the brand fills up to its 30 locations")
    page.wait_for_timeout(300)
    ok("full: expand the flagship to grow" in page.inner_text("#inv-franchising"), "a full brand says to expand the flagship")
    ok("Paid for itself" in page.inner_text("#inv-franchising"), "and shows it has paid for itself after hours of royalties")

    # --- the flagship sets the size ---
    J("T.state.biz[0].level = 12;"); page.wait_for_timeout(300)
    ok(S(f"{F}.capOf(T.inv('franchising').brands[0])") == 36, "expanding the flagship to level 12 makes room for 36 locations")
    J("T.state.biz = T.state.biz.filter(b => b.id !== 1); T.rebuildLists();")
    ok(S(f"{F}.capOf(T.inv('franchising').brands[0])") == 36, "selling the flagship keeps the brand and its size")
    J("T.MODULES.find(m => m.id === 'franchising').earn(8 * 3600);"); page.wait_for_timeout(300)
    ok(S("T.inv('franchising').brands[0].locs") == 36 and "you sold the flagship" in page.inner_text("#inv-franchising"), "but it can't grow past it any more")
    page.screenshot(path=os.path.join(SHOTS, "franchising-brand.png"))

    # --- event: franchisee cutting corners ---
    ev = S("(() => { const e = T.MODULES.find(m => m.id === 'franchising').events()[0](); window.__ev = e; return { title: e.title, labels: e.options.map(o => o.label) }; })()")
    ok(ev["title"] == "Franchisee cutting corners" and len(ev["labels"]) == 2, "a big brand can have a franchisee cutting corners: pay or look away")
    J("window.__ev.options[1].act();")
    br = S("T.inv('franchising').brands[0]")
    ok(br["locs"] == 36 - 8 and br["pausedUntil"] > S("Date.now()"), "looking away closes 20% of locations and stops new openings")
    J("T.state.biz.push({ id: 9, ind: 'diner', name: 'Back', city: '', loc: 1, quirk: 0, incMult: 1, level: 12, paid: 1, viralUntil: 0, inspectUntil: 0, hidden: null, fixing: null, selling: null, fixRetryAt: 0 });")
    J("T.MODULES.find(m => m.id === 'franchising').earn(300);")
    ok(S("T.inv('franchising').brands[0].locs") == 28, "no new locations open while openings are on hold")
    page.wait_for_timeout(300)
    ok("openings on hold" in page.inner_text("#inv-franchising"), "the card says openings are on hold")
    J("T.inv('franchising').brands[0].pausedUntil = 0; T.state.cash = 1e12;")
    ev = S("(() => { const e = T.MODULES.find(m => m.id === 'franchising').events()[0](); window.__ev = e; return 1; })()")
    c0 = S("T.state.cash"); J("window.__ev.options[0].act();")
    ok(S("T.state.cash") < c0 and S("T.inv('franchising').brands[0].locs") == 28, "sending the training team costs cash and keeps every location")
    J("T.inv('franchising').brands[0].locs = 3;")
    ok(S("T.MODULES.find(m => m.id === 'franchising').events().length") == 0, "small brands (under 5 locations) don't get the event")

    # --- saving ---
    J("T.saveNow();")
    back = S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.franchising.brands")
    ok(len(back) == 1 and back[0]["ind"] == "diner" and back[0]["locs"] == 3, "brands are saved and loaded")
    bad = S("T.validState({ cash: 1, biz: [], inv: { franchising: { brands: [{ ind: 'diner', locs: 999, cap: 30 }, { ind: 'diner', locs: 5, cap: 30 }, { ind: 'hospital', cap: 30 }, { ind: 'nope' }, null, 'x'], record: 'x' } } }).inv.franchising")
    ok(len(bad["brands"]) == 1 and bad["brands"][0]["locs"] == 30, "a broken save is cleaned up: unknown kinds and duplicates dropped, locations capped")
    ok(S("T.validState({ cash: 1, biz: [], inv: { franchising: 'junk' } }).inv.franchising.brands.length") == 0, "a save that's pure junk starts fresh")

    # --- stats and retire ---
    page.click("#tab-set"); page.wait_for_timeout(200)
    ok("Franchise brands" in page.inner_text("#stats"), "franchising shows on the Stats tab")
    J("T.state.earnedAll = 4e9; T.retire();")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")
    ok(S("T.inv('franchising').brands.length") == 0, "retiring starts franchising over")

    # --- phone ---
    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []; phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(400)
    phone.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e5; T.state.cash = 1e9; " + biz_js(1, "diner", 15) + biz_js(2, "gym", 10) +
                   "T.invTests.franchising.launch(1); T.MODULES.find(m => m.id === 'franchising').earn(600); T.rebuildLists(); T.showTab('invest'); }")
    phone.wait_for_timeout(400)
    phone.locator("#inv-franchising").screenshot(path=os.path.join(SHOTS, "franchising-phone.png"))
    ok(phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), "on a phone the card fits the screen (no sideways scrolling)")
    ok(not perr, f"no page errors on the phone {perr}")
    ok(not errors, f"no page errors {errors}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
