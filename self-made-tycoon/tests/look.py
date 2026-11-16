"""
look.py - Checks for the look and feel: the day/night sky, the motion
effects (coin pops, confetti, cash count-up), calm mode for players who
want less motion, the Look and feel settings, and the layouts on a
Steam Deck sized screen and a phone. Screenshots go to tests/shots/.

    python3 tests/look.py           (needs: pip install playwright, and Chrome)
"""
import os, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))

# A mid-game city: 14 businesses at mixed levels, events switched off so
# nothing pops up over the screenshots.
SETUP = """() => { T.state.earnedRun = 3e6; T.state.nextEventAt = Date.now() + 1e9;
  for (let i = 0; i < 14; i++) { const l = T.makeListing('any'); T.state.deals[0] = l; T.state.cash += T.listingPrice(l); T.buyListing(0); T.state.biz.at(-1).level = 1 + (i * 7) % 60; }
  T.state.cash = 2.5e5; document.getElementById('modalBack').classList.remove('on'); T.rebuildLists(); }"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])

    # ================= Steam Deck size =================
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)

    # --- the sky ---
    bad = S("""(() => { const out = []; for (let i = 0; i <= 400; i++) { const s = skyAt(i / 400);
        if (![...s.top, ...s.bottom, s.stars, s.lights].every(Number.isFinite)) out.push(i); } return out; })()""")
    ok(not bad, "sky colors are valid at every moment of the day")
    ok(S("skyAt(0.5).lights") == 0 and S("skyAt(0.0).lights") == 1, "noon has no lit windows, midnight has them all")
    ok(S("skyClockText(0.5)") == "12:00 PM" and S("skyClockText(0)") == "12:00 AM" and S("skyClockText(0.75)") == "6:00 PM",
       f"the sky clock reads noon/midnight/6 PM right ({S('skyClockText(0.75)')})")
    page.click("#tab-set"); page.click("[data-sky=day]")
    ok(S("dayPhase()") == 0.5 and S("document.querySelector('[data-sky=day]').getAttribute('aria-pressed')") == "true", "Sky: Day pins the sky to noon")
    page.click("[data-sky=night]")
    ok(S("dayPhase()") == 0, "Sky: Night pins it to midnight")
    page.reload(); page.wait_for_timeout(400)
    ok(S("look.sky") == "night", "the sky setting is remembered after a reload")
    page.click("#tab-set"); page.click("[data-sky=clock]")
    ok(abs(S("dayPhase()") - S("(new Date().getHours() * 60 + new Date().getMinutes()) / 1440")) < 0.01, "Sky: My clock follows the real time of day")
    page.click("[data-sky=cycle]")
    tint1 = S("getComputedStyle(document.documentElement).getPropertyValue('--term-top')")
    ok(tint1.startswith("rgba("), f"the terminal background follows the sky ({tint1})")

    # --- motion ---
    page.evaluate(SETUP); page.click("#tab-deals"); page.wait_for_timeout(300)
    page.evaluate("() => { T.state.cash = 1e9; parts = []; T.render(true); }"); page.wait_for_timeout(100)
    page.click("#deal-0"); page.wait_for_timeout(60)
    ok(S("parts.filter(p => p.kind === 'paper').length") > 10, "buying a business throws confetti")
    page.wait_for_timeout(100)
    ok(S("document.querySelectorAll('#empireList .biz.is-new').length") == 1, "and its card glows on the Empire tab")
    page.wait_for_timeout(1800)
    ok(S("parts.length") == 0, "the confetti is gone after two seconds")
    page.evaluate("() => document.getElementById('modalBack').classList.remove('on')")   # a hidden problem may have popped up "Surprise!"
    box = page.locator("#hustle").bounding_box()
    page.mouse.click(box["x"] + 50, box["y"] + 30); page.wait_for_timeout(60)
    coins = S("parts.filter(p => p.kind === 'coin')")
    ok(len(coins) >= 2, f"tapping Hustle pops coins ({len(coins)})")
    ok(coins and abs(coins[0]["x"] - (box["x"] + 50)) < 40, "from where you tapped")
    # the cash count-up
    page.evaluate("() => { T.state.cash = 1000; T.render(true); }"); page.wait_for_timeout(1600)
    ok(S("Math.abs(cashShown - T.state.cash) <= T.incomeNow() * 0.2 + 1"), "spending $1B down to $1K rolls down within 1.6 seconds")
    page.evaluate("() => { T.state.cash += 5e6; }"); page.wait_for_timeout(50)
    ok(S("cashShown < T.state.cash - 1e5"), f"a big gain rolls up instead of jumping (showing {S('document.getElementById(\'cash\').textContent')} a moment later)")
    ok("gain" in S("document.getElementById('cash').className"), "and the cash flashes green")
    page.wait_for_timeout(1300)
    ok(S("Math.abs(cashShown - T.state.cash) <= T.incomeNow() * 0.2 + 1"), "then lands on the exact amount")
    # selling: coin shower
    page.evaluate("() => document.getElementById('modalBack').classList.remove('on')")
    page.evaluate("() => { parts = []; T.state.biz[0].selling = { until: Date.now() - 1 }; }"); page.wait_for_timeout(100)
    ok(S("parts.filter(p => p.kind === 'coin').length") > 30, "selling a business makes it rain coins")
    page.evaluate("() => document.getElementById('modalOk').click()")
    # a swapped-in save (retire / wipe / load) must not celebrate the difference
    page.wait_for_timeout(2500)
    page.evaluate("() => { parts = []; const s = T.validState(JSON.parse(JSON.stringify(T.state))); s.stats.bought += 5; s.stats.sold += 3; T.state = s; }")
    page.wait_for_timeout(120)
    ok(S("parts.length") == 0, "loading a different save doesn't set off confetti or coins")
    ok(S("Math.abs(cashShown - T.state.cash) <= T.incomeNow() * 0.2 + 1"), "and the cash shows the new save's amount straight away")

    # --- the sparkline helper investment cards can use ---
    r = S("""(() => { const c = document.createElement('canvas'); c.style.cssText = 'width:200px;height:60px';
        document.body.appendChild(c); try { sparkline(c, []); sparkline(c, [5]); sparkline(c, [3, 3, 3]); sparkline(c, [1, NaN, 4, 2]);
        sparkline(c, [1, 2, 3]); return 'ok'; } catch (e) { return String(e); } finally { c.remove(); } })()""")
    ok(r == "ok", f"sparkline() copes with empty, single, flat and broken data ({r})")

    # --- speed: a big city at night with a confetti burst should still draw fast ---
    page.evaluate("""() => { window.dayPhase = () => 0.02; T.state.earnedRun = 1e13;
        for (let i = 0; i < 26; i++) { const l = T.makeListing('any'); T.state.deals[0] = l; T.state.cash += T.listingPrice(l); T.buyListing(0); }
        document.getElementById('modalBack').classList.remove('on'); }""")
    page.wait_for_timeout(300)
    ms = S("""(() => { fxBurst([400, 300], 'buy'); fxBurst([400, 300], 'sale'); const t = performance.now();
        for (let i = 0; i < 60; i++) { drawSkyline(1 / 60); drawFx(1 / 60); } return (performance.now() - t) / 60; })()""")
    ok(ms < 6, f"40 buildings at night plus a sale and a buy burst draw in {ms:.2f} ms a frame (budget 6 ms)")
    page.wait_for_timeout(2500)

    # --- layout on the Deck ---
    page.evaluate("() => { delete window.dayPhase; }")
    ok(S("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight"), "Deck: the page itself never scrolls")
    hb = page.locator("#hustle").bounding_box()
    ok(hb["y"] + hb["height"] <= 800, "Deck: the Hustle button is fully on screen")
    page.evaluate("() => { window.dayPhase = () => 0.5; }"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "look-deck-day.png"))
    page.evaluate("() => { window.dayPhase = () => 0.02; }"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "look-deck-night.png"))
    ok(not errors, f"no page errors {errors[:3]}")
    ctx.close()

    # ================= Calm mode (device asks for reduced motion) =================
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(400)
    S = lambda expr: page.evaluate("() => " + expr)
    ok(S("document.documentElement.classList.contains('calm')"), "a device set to reduce motion gets calm mode")
    page.evaluate("() => { T.state.cash = 1e6; T.render(true); }")
    page.click("#deal-0"); page.evaluate("() => document.getElementById('modalBack').classList.remove('on')")
    page.click("#hustle"); page.wait_for_timeout(60)
    ok(S("parts.length") == 0, "calm mode: no confetti or coins")
    page.evaluate("() => { T.state.cash += 5e6; }"); page.wait_for_timeout(40)
    ok(S("Math.abs(cashShown - T.state.cash) <= T.incomeNow() * 0.2 + 1"), "calm mode: cash changes instantly")
    page.click("#tab-set"); page.click("[data-motion=full]")
    ok(not S("document.documentElement.classList.contains('calm')"), "Motion: Full overrides the device setting")
    page.click("[data-motion=calm]")
    ok(S("document.documentElement.classList.contains('calm')"), "Motion: Calm turns it back on")
    ok(not errors, f"no page errors in calm mode {errors[:3]}")
    ctx.close()

    # ================= Phone =================
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(400)
    S = lambda expr: page.evaluate("() => " + expr)
    page.evaluate(SETUP); page.click("#tab-empire"); page.wait_for_timeout(300)
    ok(S("document.documentElement.scrollWidth <= innerWidth"), "phone: no sideways page scroll")
    tops = S("[...document.querySelectorAll('.tab')].filter(t => !t.hidden).map(t => Math.round(t.getBoundingClientRect().top))")
    ok(len(set(tops)) == 1, f"phone: the tabs sit in one swipeable row {tops}")
    term = S("document.querySelector('.terminal').getBoundingClientRect().height")
    ok(term < 844 * 0.4, f"phone: the pinned top panel uses {term:.0f}px of 844 (under 40%)")
    page.locator("#tab-set").scroll_into_view_if_needed(); page.click("#tab-set")
    ok(S("document.getElementById('pane-set').classList.contains('on')"), "phone: the last tab can be reached")
    page.click("#tab-empire")
    page.evaluate("() => { window.dayPhase = () => 0.765; }"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "look-phone-dusk.png"))
    page.evaluate("() => { window.dayPhase = () => 0.5; }"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "look-phone-day.png"))
    ok(not errors, f"no page errors on the phone {errors[:3]}")
    ctx.close()
    b.close()

print(f"{sum(results)}/{len(results)} checks passed")
