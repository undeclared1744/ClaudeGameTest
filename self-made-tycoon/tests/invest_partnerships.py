"""
invest_partnerships.py - Checks Partnerships and private equity
(src/js/30-investments/partnerships.js): deals show up once Regional is
unlocked, joining and passing, the share's value along the way, the exit
(only profit counts as earned), the "capital call" event, the odds, saves,
and the card on desktop and phone. Screenshots go to tests/shots/.

    python3 tests/invest_partnerships.py    (needs: pip install playwright, and Chrome)
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
    J("T.state.nextEventAt = Date.now() + 1e9;")
    P = "T.invTests.partnerships"
    def close_modal():
        if page.locator("#modalBack.on").count(): page.click("#modalOk"); page.wait_for_timeout(50)

    page.click("#tab-invest"); page.wait_for_timeout(300)
    J("T.state.earnedRun = 2e5; T.rebuildLists();"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-partnerships"), "the card is still locked at Main Street (opens at Regional, tier 3)")
    J("T.state.earnedRun = 6e6; T.state.cash = 1e8; T.rebuildLists();"); page.wait_for_timeout(400)
    ok(page.locator("#pe-join").count() == 1, "at Regional a buyout deal is offered with a Join button")
    o = S("T.inv('partnerships').offer")
    ok(o["share"] >= 1e6, f"a share is at least 20% of the tier's unlock amount ({o['share']:.0f})")
    ok(S(f"T.IND['{o['ind']}'].tier") >= 3, "the company is a big one (tier 3 or up)")
    txt = page.inner_text("#inv-partnerships")
    ok(S(f"{P}.FUNDS[{o['fq']}].name") in txt and "Plan:" in txt, "the fund's track record and plan are shown up front")
    page.screenshot(path=os.path.join(SHOTS, "partnerships-offer.png"))

    # --- pass ---
    page.click("#pe-pass"); page.wait_for_timeout(300)
    ok(S("T.inv('partnerships').offer") is None and "next deal comes your way" in page.inner_text("#inv-partnerships"), "passing clears the offer and says when the next one comes")
    J("T.inv('partnerships').nextOfferAt = 0; T.investTick(Date.now()); T.rebuildLists();"); page.wait_for_timeout(300)
    ok(page.locator("#pe-join").count() == 1, "a new deal arrives after the wait")
    J("T.inv('partnerships').offer.madeAt = Date.now() - 400e3; T.investTick(Date.now());")
    ok(S("T.inv('partnerships').offer.madeAt") > S("Date.now()") - 5000, "an offer left alone for 6 minutes is replaced by a fresh one (sized to your income now)")

    # --- join ---
    J("T.state.cash = 0; T.rebuildLists();"); page.wait_for_timeout(300)
    ok(page.get_attribute("#pe-join", "aria-disabled") == "true" and S(f"{P}.join()") is False, "you can't join without the cash")
    share = S("T.inv('partnerships').offer.share")
    J(f"T.state.cash = {share} * 3; T.rebuildLists();"); page.wait_for_timeout(200)
    spent = S("(() => { const c0 = T.state.cash; document.getElementById('pe-join').click(); return c0 - T.state.cash; })()")
    page.wait_for_timeout(300)
    d = S("T.inv('partnerships').deal")
    ok(abs(spent - share) < 1 and d is not None and S("T.inv('partnerships').offer") is None, "joining takes your share and starts the deal")
    hold = (d["endsAt"] - d["startAt"]) / 60000
    ok(19.9 <= hold <= 30.1, f"the money is locked up 20 to 30 minutes ({hold:.1f})")
    ok("is worth about" in page.inner_text("#inv-partnerships") and "sale in" in page.inner_text("#inv-partnerships"), "the card shows what your share is worth and when it sells")
    J("T.inv('partnerships').nextOfferAt = 0; T.investTick(Date.now());")
    ok(S("T.inv('partnerships').offer") is None, "no new offers while you're in a deal (one at a time)")
    page.screenshot(path=os.path.join(SHOTS, "partnerships-deal.png"))

    # --- value along the way ---
    marks = S(f"""(() => {{ const d = T.inv('partnerships').deal, t = {P};
      return [0, 0.5, 1].map(f => t.markValue(Object.assign({{}}, d, {{ mult: 2 }}), d.startAt + (d.endsAt - d.startAt) * f) / d.invested); }})()""")
    ok(abs(marks[0] - 1) < 0.05 and 1.3 < marks[1] < 1.7 and abs(marks[2] - 2) < 1e-6, f"the share's value drifts from what you paid to the final result {[round(m, 2) for m in marks]}")
    bad = S(f"(() => {{ const d = T.inv('partnerships').deal; return {P}.markValue(Object.assign({{}}, d, {{ mult: 0.25 }}), d.startAt + (d.endsAt - d.startAt) * 0.8) / d.invested; }})()")
    ok(bad < 0.6, "a deal going bad shows up as a slide before the end")

    # --- capital call event ---
    ev = S("(() => { const e = T.MODULES.find(m => m.id === 'partnerships').events()[0](); window.__ev = e; return e.title; })()")
    ok(ev == "Capital call", "while in a deal, partners can ask for more money")
    m0 = S("T.inv('partnerships').deal.mult"); inv0 = S("T.inv('partnerships').deal.invested")
    J("T.state.cash = 1e12; window.__ev.options[0].act();")
    d = S("T.inv('partnerships').deal")
    ok(abs(d["invested"] - inv0 * 1.25) < inv0 * 0.06 and abs(d["mult"] - m0 - 0.15) < 1e-9, "putting in 25% more raises the whole deal's return by 0.15x")
    ok(S("T.MODULES.find(m => m.id === 'partnerships').events().length") == 0, "only one capital call per deal")
    c0 = S("T.state.cash"); J("window.__ev.options[0].act();")
    ok(S("T.state.cash") == c0, "pressing an old capital call again does nothing")

    # --- exit ---
    J("T.state.cash = 0;")
    r = S(f"(() => {{ const d = T.inv('partnerships').deal, c0 = T.state.cash, e0 = T.state.earnedRun; const r = {P}.exitDeal(2); r.cash = T.state.cash - c0; r.earned = T.state.earnedRun - e0; r.inv = d.invested; r.modal = document.getElementById('modalBack').classList.contains('on'); return r; }})()")
    ok(abs(r["cash"] - r["inv"] * 2) < 1, "at the exit you get your share of the sale (2x here)")
    ok(abs(r["earned"] - r["inv"]) < 1, "and only the profit counts as earned")
    ok(not r["modal"], "the pop-up waits a tick, so 'While you were out' can't cover it")
    page.wait_for_timeout(300)
    ok(page.locator("#modalBack.on").count() == 1 and "Deal closed" in page.text_content("#modalTitle"), "then the exit gets a pop-up")
    close_modal(); page.wait_for_timeout(300)
    ok("Last deal:" in page.inner_text("#inv-partnerships") and S("T.inv('partnerships').deal") is None, "the card shows the last deal's result")
    # a deal that went bad
    J("T.inv('partnerships').nextOfferAt = 0; T.investTick(Date.now()); T.state.cash = 1e12; T.invTests.partnerships.join();")
    J("T.inv('partnerships').deal.mult = 0.25; T.inv('partnerships').deal.endsAt = Date.now() - 1; T.investTick(Date.now());")
    page.wait_for_timeout(300)
    ok("Deal went badly" in page.text_content("#modalTitle") and S("T.inv('partnerships').deal") is None, "a deal that comes due while you're away is settled, even a bad one")
    close_modal()

    # --- odds (20,000 rolls per fund type) ---
    ev = S(f"""(() => {{ const t = {P}; return t.FUNDS.map((f, i) => {{ let s = 0, bad = 0; for (let k = 0; k < 20000; k++) {{ const m = t.rollMult(i); s += m; if (m < 1) bad++; }} return {{ ev: s / 20000, loss: bad / 20000 }}; }}); }})()""")
    w = S(f"{P}.FUNDS.map(f => f.weight)")
    avg = sum(e["ev"] * x for e, x in zip(ev, w))
    print("     odds: " + ", ".join(f"{n} {e['ev']:.2f}x (loss {e['loss']:.0%})" for n, e in zip(["proven", "steady", "first-time"], ev)) + f", average {avg:.2f}x")
    ok(1.4 < avg < 1.75, "a deal returns about 1.6x on average")
    ok(ev[2]["loss"] > ev[0]["loss"] * 2, "a first-time fund is riskier than a proven one")

    # --- saving ---
    J("T.inv('partnerships').nextOfferAt = 0; T.investTick(Date.now()); T.invTests.partnerships.join(); T.saveNow();")
    back = S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.partnerships")
    ok(back["deal"] is not None and back["deal"]["mult"] == S("T.inv('partnerships').deal.mult"), "a deal in progress is saved and loaded")
    junk = S("T.validState({ cash: 1, biz: [], inv: { partnerships: { offer: { ind: 'nope', share: 5 }, deal: { ind: 'hotel', share: 5, mult: 99, startAt: 1, endsAt: 0 }, record: 7 } } }).inv.partnerships")
    ok(junk["offer"] is None and junk["deal"]["mult"] <= 5 and junk["deal"]["endsAt"] > junk["deal"]["startAt"], "a broken save is cleaned up (unknown company dropped, impossible numbers clamped)")

    # --- stats and retire ---
    page.click("#tab-set"); page.wait_for_timeout(200)
    ok("Buyout deals joined" in page.inner_text("#stats"), "your deal record shows on the Stats tab")
    J("T.state.earnedAll = 4e9; T.retire();"); close_modal()
    ok(S("T.inv('partnerships').deal") is None and S("T.inv('partnerships').record.joined") == 0, "retiring starts partnerships over")

    # --- phone ---
    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []; phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(400)
    phone.evaluate("() => { T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 6e6; T.state.cash = 1e8; T.investTick(Date.now()); T.rebuildLists(); T.showTab('invest'); }")
    phone.wait_for_timeout(400)
    phone.locator("#inv-partnerships").scroll_into_view_if_needed()
    phone.locator("#inv-partnerships").screenshot(path=os.path.join(SHOTS, "partnerships-phone.png"))
    ok(phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"), "on a phone the card fits the screen (no sideways scrolling)")
    ok(not perr, f"no page errors on the phone {perr}")
    ok(not errors, f"no page errors {errors}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
