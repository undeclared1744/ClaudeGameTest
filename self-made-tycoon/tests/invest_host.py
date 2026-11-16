"""
invest_host.py - Checks the plug-in point that every investment type uses
(src/js/20-invest.js): a test module registers itself, gets an Invest tab
card, earns money over time, is saved and cleaned up on load, resets on
retire, and a broken module can't crash the game.

    python3 tests/invest_host.py    (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

TEST_MODULE = """() => {
  window.calls = { earn: 0, tick: 0, render: 0 };
  T.registerInvestment({
    id: "piggy", name: "Piggy bank", order: 1, unlockTier: 0,
    fresh: () => ({ coins: 0 }),
    validate: saved => { if (typeof saved.coins !== "number") throw new Error("bad"); return { coins: saved.coins }; },
    earn(seconds) { calls.earn++; T.inv("piggy").coins += seconds; T.addCash(seconds * 2); return seconds * 2; },
    tick() { calls.tick++; },
    netIncome: () => 2,
    render(card, full) { calls.render++; if (full) card.innerHTML = '<h2 class="cond">Piggy bank</h2><p id="piggyCoins"></p><button class="smallbtn" id="piggyBtn">Shake it</button>';
      card.querySelector('#piggyCoins').textContent = Math.floor(T.inv("piggy").coins) + " coins"; },
    events: () => [() => ({ title: "Piggy news", text: "Oink.", options: [{ label: "OK", yes: true, act: () => {} }] })],
    stats: () => [["Piggy coins", Math.floor(T.inv("piggy").coins)]],
  });
  T.rebuildLists();
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    page.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; }")

    ok(page.locator("#tab-invest").is_hidden(), "with no investments built, the Invest tab is hidden")
    ok(S("T.tabOrder().length") == 5, "and the tab keys skip it (5 tabs)")
    page.evaluate(TEST_MODULE)
    ok(page.locator("#tab-invest").is_visible() and S("T.tabOrder().includes('invest')"), "registering a module shows the Invest tab")
    page.click("#tab-invest"); page.wait_for_timeout(400)
    ok(page.locator("#inv-piggy #piggyBtn").count() == 1, "the module draws its own card on the Invest tab")
    ok(S("calls.render") > 1, "and keeps it updated")
    c0 = S("T.state.cash"); page.evaluate("() => T.earnBetween(Date.now(), Date.now() + 10000)")
    ok(abs(S("T.state.cash") - c0 - 20) < 0.5 and S("T.inv('piggy').coins") >= 10, "time passing calls the module's earn()")
    ok(S("calls.tick") > 5, "the main loop calls tick() every frame")
    ok("/sec" in page.inner_text("#ips") and S("T.investNet()") == 2, "the module's income counts toward the $/sec in the ticker")
    ok(S("(() => { for (let i = 0; i < 200; i++) if (T.makeEvent().title === 'Piggy news') return true; return false; })()"), "the module's events can pop up")
    page.click("#tab-set"); page.wait_for_timeout(200)
    ok("Piggy coins" in page.inner_text("#stats"), "and its stats show on the Stats tab")

    # saving and loading
    page.evaluate("() => { T.inv('piggy').coins = 77; T.saveNow(); }")
    ok(S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.piggy.coins") == 77, "its state is saved and loaded")
    ok(S("T.validState({ cash: 1, biz: [], inv: { piggy: { coins: 'lots' } } }).inv.piggy.coins") == 0, "a bad saved value falls back to fresh() when validate() throws")
    ok(S("T.validState({ cash: 1, biz: [] }).inv.piggy.coins") == 0, "an old save without it starts fresh")
    ok(S("Object.keys(T.validState({ cash: 1, biz: [], inv: { ghost: { a: 1 } } }).inv).join()") == "piggy", "state for a module that no longer exists is dropped")

    # retire resets it
    page.evaluate("() => { T.state.earnedAll = 4e9; T.inv('piggy').coins = 5; T.retire(); }")
    ok(S("T.inv('piggy').coins") < 1, "retiring starts the module over")
    if page.locator("#modalBack.on").count(): page.click("#modalOk")

    # a broken module can't take the game down
    page.evaluate("() => { T.registerInvestment({ id: 'broken', name: 'Broken', earn() { throw new Error('boom'); }, tick() { throw new Error('boom'); }, render() { throw new Error('boom'); } }); T.rebuildLists(); }")
    c0 = S("T.state.cash"); page.wait_for_timeout(600)
    page.evaluate("() => T.earnBetween(Date.now(), Date.now() + 5000)")
    ok(S("T.state.cash") > c0 and not errors, "a module that throws is skipped and the rest of the game keeps running")
    ok(S("(() => { try { T.registerInvestment({ id: 'piggy', name: 'x' }); return false; } catch { return true; } })()"), "two modules can't use the same id")
    page.keyboard.press("3"); page.wait_for_timeout(100)
    ok(page.locator("#pane-invest.on").count() == 1, "the 3 key opens the Invest tab once it's showing")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
