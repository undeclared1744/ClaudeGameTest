"""
invest_startups.py - Checks Startup stakes (src/js/30-investments/startups.js):
pitches show up once Main Street is unlocked, due diligence reveals how good
a startup is, funding and passing work, results pay out (only profit counts
as earned), the odds match the design, saves are cleaned up, and the card
looks right on desktop and phone. Screenshots go to tests/shots/.

    python3 tests/invest_startups.py    (needs: pip install playwright, and Chrome)
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
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    J = lambda js: page.evaluate("() => { " + js + " }")
    J("T.state.nextEventAt = Date.now() + 1e9;")      # no random pop-ups during the test
    def close_modal():
        if page.locator("#modalBack.on").count(): page.click("#modalOk"); page.wait_for_timeout(50)

    # --- locked at first ---
    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-startups"), "the card is locked before Main Street (tier 2)")
    ok(S("T.inv('startups').pitch") is None, "and no pitch is made while locked")

    # --- unlock: a pitch appears ---
    J("T.state.earnedRun = 2e5; T.state.cash = 5e6; T.rebuildLists();")
    page.wait_for_timeout(400)
    ok(page.locator("#su-fund").count() == 1, "once unlocked, a founder pitch shows with a Fund button")
    check = S("T.inv('startups').pitch.check")
    ok(check >= 1e4, f"a check is at least 10% of the tier's unlock amount ({check})")
    ok("Founder says" in page.inner_text("#inv-startups"), "before due diligence you only hear the founder's hype")
    page.screenshot(path=os.path.join(SHOTS, "startups-pitch.png"))

    # --- due diligence ---
    c0 = S("T.state.cash")
    page.click("#su-dd"); page.wait_for_timeout(300)
    ok(abs(c0 - S("T.state.cash") - check * 0.05) < 1, "due diligence costs 5% of the check")
    grade = S("T.invTests.startups.GRADES[T.inv('startups').pitch.grade].name")
    ok(grade + ":" in page.inner_text("#inv-startups"), f"and the card now shows what it found ({grade})")
    ok(page.locator("#su-dd").count() == 0, "the due diligence button goes away once it's done")
    ok(S("T.invTests.startups.checkPitch()") is False, "and you can't pay for it twice")

    # --- pass ---
    page.click("#su-pass"); page.wait_for_timeout(300)
    ok(S("T.inv('startups').pitch") is None and "Next founder pitch in" in page.inner_text("#inv-startups"), "passing clears the pitch and shows when the next one comes")
    J("T.inv('startups').nextPitchAt = 0; T.investTick(Date.now()); T.rebuildLists();"); page.wait_for_timeout(300)
    ok(page.locator("#su-fund").count() == 1, "a new pitch arrives when the wait is over")

    # --- fund ---
    check = S("T.inv('startups').pitch.check"); c0 = S("T.state.cash"); e0 = S("T.state.earnedRun")
    page.click("#su-fund"); page.wait_for_timeout(300)
    ok(abs(c0 - S("T.state.cash") - check) < 1 and S("T.inv('startups').stakes.length") == 1, "funding takes the check and adds the startup to your portfolio")
    ok("Results in" in page.inner_text("#inv-startups"), "the portfolio shows a countdown to the result")
    wait = S("(T.inv('startups').stakes[0].endsAt - Date.now()) / 60000")
    ok(11.9 <= wait <= 20.1, f"results take 12 to 20 minutes ({wait:.1f})")
    J("T.inv('startups').nextPitchAt = 0; T.investTick(Date.now());")
    ok(S("T.invTests.startups.fund()") is True, "you can back a second startup")
    J("T.inv('startups').nextPitchAt = 0; T.investTick(Date.now()); T.rebuildLists();"); page.wait_for_timeout(300)
    ok(S("T.invTests.startups.fund()") is False and S("T.inv('startups').stakes.length") == 2, "but not a third: the portfolio holds 2")
    ok("portfolio full" in page.inner_text("#su-fund") and page.get_attribute("#su-fund", "aria-disabled") == "true", "the Fund button says the portfolio is full")
    page.screenshot(path=os.path.join(SHOTS, "startups-portfolio.png"))

    # --- results ---
    st = S("T.inv('startups').stakes[0].check"); c0 = S("T.state.cash"); e0 = S("T.state.earnedRun")
    # resolve and look for the pop-up in the same instant: it must wait for the next tick
    r = S("(() => { const r = T.invTests.startups.resolve(T.inv('startups').stakes[0], 4); r.modalNow = document.getElementById('modalBack').classList.contains('on'); return r; })()")
    ok(50 <= r["mult"] <= 100, f"a unicorn pays 50x to 100x ({r['mult']}x)")
    ok(abs(S("T.state.cash") - c0 - st * r["mult"]) < 1, "the payout goes into your cash")
    ok(abs(S("T.state.earnedRun") - e0 - st * (r["mult"] - 1)) < 1, "but only the profit counts as earned")
    ok(not r["modalNow"], "the pop-up waits one tick (so 'While you were out' can't cover it)")
    page.wait_for_timeout(200)
    ok(page.locator("#modalBack.on").count() == 1 and "Unicorn!" in page.text_content("#modalTitle"), "then a big win gets a pop-up")
    close_modal()
    c0 = S("T.state.cash")
    S("T.invTests.startups.resolve(T.inv('startups').stakes[0], 0)")
    ok(S("T.state.cash") == c0 and S("T.inv('startups').stakes.length") == 0, "a startup that fails pays nothing and leaves the portfolio")
    J("T.investTick(Date.now()); T.rebuildLists();"); page.wait_for_timeout(300)
    ok(not page.locator("#modalBack.on").count(), "and a failure is only a toast, not a pop-up")
    ok("Recent results" in page.inner_text("#inv-startups") and "0x" in page.inner_text("#inv-startups"), "recent results are listed on the card")
    ok(S("T.inv('startups').record.exits") == 1 and S("T.inv('startups').record.best") >= 50, "the record keeps exits and the best return")

    # --- time passing: results due while away get paid by tick ---
    J("T.inv('startups').nextPitchAt = 0; T.investTick(Date.now()); T.invTests.startups.fund(); T.inv('startups').stakes[0].endsAt = Date.now() - 1000; T.investTick(Date.now());")
    ok(S("T.inv('startups').stakes.length") == 0, "a result that came due while you were away is settled on the next tick")
    close_modal(); J("T.investTick(Date.now());"); close_modal()

    # --- the odds match the design (10,000 rolls per grade) ---
    ev = S("""(() => {
      const t = T.invTests.startups, out = [];
      for (let g = 0; g < 3; g++) {
        let sum = 0, uni = 0, fail = 0;
        for (let i = 0; i < 20000; i++) {
          const odds = t.GRADES[g].odds; let roll = Math.random(), o = 0;
          for (; o < odds.length - 1; o++) { roll -= odds[o]; if (roll < 0) break; }
          const m = t.OUTCOMES[o].mult; sum += Array.isArray(m) ? 75 : m; if (o === 4) uni++; if (o === 0) fail++;
        }
        out.push({ ev: sum / 20000, uni: uni / 20000, fail: fail / 20000 });
      }
      const w = t.GRADES.map(g => g.weight);
      return { per: out, blind: out.reduce((a, x, g) => a + x.ev * w[g], 0),
               smart: (out[1].ev * w[1] + out[2].ev * w[2]) / (w[1] + w[2]),
               uniBlind: out.reduce((a, x, g) => a + x.uni * w[g], 0), failBlind: out.reduce((a, x, g) => a + x.fail * w[g], 0) };
    })()""")
    print(f"     odds: weak {ev['per'][0]['ev']:.2f}x, solid {ev['per'][1]['ev']:.2f}x, standout {ev['per'][2]['ev']:.2f}x, "
          f"blind {ev['blind']:.2f}x, after due diligence {ev['smart']:.2f}x, unicorn 1 in {1/max(ev['uniBlind'],1e-9):.0f}, fail {ev['failBlind']:.0%}")
    ok(ev["failBlind"] > 0.6, "most startups fail")
    ok(0.95 < ev["blind"] < 1.3, "funding blind is close to break-even")
    ok(1.5 < ev["smart"] < 2.0, "funding only the good ones after due diligence pays (about 1.7x)")
    ok(1 / 300 < ev["uniBlind"] < 1 / 120, "a unicorn is rare (about 1 in 230 blind checks)")
    ok(abs(sum(S("T.invTests.startups.GRADES.map(g => g.odds.reduce((a, b) => a + b, 0))")) - 3) < 1e-9, "each grade's odds add up to 100%")

    # --- the 'sell your stake early' event ---
    J("T.inv('startups').nextPitchAt = 0; T.investTick(Date.now()); T.inv('startups').pitch.grade = 0; T.invTests.startups.fund();")
    ok(S("T.MODULES.find(m => m.id === 'startups').events().length") == 0, "nobody offers to buy a weak startup's stake")
    J("T.inv('startups').stakes[0].grade = 1;")
    ev = S("(() => { const e = T.MODULES.find(m => m.id === 'startups').events()[0](); window.__ev = e; return { title: e.title, n: e.options.length }; })()")
    ok(ev["title"] == "Someone wants your stake" and ev["n"] == 2, "a promising one can get an early offer: sell or hold")
    c0 = S("T.state.cash"); J("window.__ev.options[0].act();")
    ok(S("T.state.cash") > c0 and S("T.inv('startups').stakes.length") == 0, "selling takes the offer and the stake leaves the portfolio")
    c0 = S("T.state.cash"); J("window.__ev.options[0].act();")
    ok(S("T.state.cash") == c0, "pressing an old offer again can't pay twice")

    # --- saving ---
    J("T.inv('startups').nextPitchAt = 0; T.investTick(Date.now()); T.invTests.startups.fund(); T.saveNow();")
    ok(S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.startups.stakes.length") == 1, "your portfolio is saved and loaded")
    bad = S("T.validState({ cash: 1, biz: [], inv: { startups: { pitch: { check: 'x' }, stakes: [{ check: -5, grade: 9 }, null], results: 'no', record: { funded: 'a' } } } }).inv.startups")
    ok(bad["pitch"] is None and bad["stakes"] == [] and bad["results"] == [] and bad["record"]["funded"] == 0, "a broken save is cleaned up instead of crashing")
    many = S("T.validState({ cash: 1, biz: [], inv: { startups: { stakes: Array(9).fill({ check: 5, grade: 1, sector: 'tech', endsAt: 1 }) } } }).inv.startups.stakes.length")
    ok(many == 2, "a save can't sneak in more startups than the portfolio holds")

    # --- stats and retire ---
    page.click("#tab-set"); page.wait_for_timeout(200)
    ok("Startups funded" in page.inner_text("#stats"), "your startup record shows on the Stats tab")
    J("T.state.earnedAll = 4e9; T.retire();"); close_modal()
    ok(S("T.inv('startups').stakes.length") == 0 and S("T.inv('startups').record.funded") == 0, "retiring starts startup stakes over")

    # --- phone ---
    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []; phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(400)
    phone.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 2e5; T.state.cash = 5e6; T.investTick(Date.now()); T.invTests.startups.fund(); T.inv('startups').nextPitchAt = 0; T.investTick(Date.now()); T.rebuildLists(); T.showTab('invest'); }")
    phone.wait_for_timeout(400)
    phone.locator("#inv-startups").screenshot(path=os.path.join(SHOTS, "startups-phone.png"))
    wide = phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
    ok(wide, "on a phone the card fits the screen (no sideways scrolling)")
    ok(not perr, f"no page errors on the phone {perr}")
    ok(not errors, f"no page errors {errors}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
