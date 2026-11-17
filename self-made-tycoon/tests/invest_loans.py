"""
invest_loans.py - Checks bank loans (src/js/30-investments/loans.js) in the
real page: the credit limit follows your businesses, borrowing, interest
building up and being paid on time, a missed payment and its grace period,
the bank taking a business, bankruptcy, paying back, saving, and retiring.
Screenshots of the card go to tests/shots/.

    python3 tests/invest_loans.py    (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file://" + os.path.abspath(os.path.join(HERE, "..", "index.html"))
SHOTS = os.path.join(HERE, "shots"); os.makedirs(SHOTS, exist_ok=True)
results = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); results.append(bool(cond))
def near(a, b, tol=1e-6):
    return abs(a - b) <= tol * max(1, abs(a), abs(b))

# A plain business in the shape the game stores
def biz_js(id, ind="laundry", level=1, paid=5000):
    return (f"{{ id: {id}, ind: '{ind}', name: 'Test {id}', city: 'Reno', loc: 1, quirk: 0, level: {level}, paid: {paid},"
            f" incMult: 1, hidden: null, fixing: null, selling: null, fixRetryAt: 0, viralUntil: 0, inspectUntil: 0 }}")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1280, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE); page.wait_for_timeout(500)
    S = lambda expr: page.evaluate("() => " + expr)
    L = "T.invTests.loans"
    def close_modal():
        if page.locator("#modalBack.on").count(): page.click("#modalOk"); page.wait_for_timeout(100)
    # No random events, and stop the clock: with lastTick in the future the
    # main loop pays no income and adds no interest, so every number below
    # stays put between steps. (Time is moved on by hand where needed.)
    FREEZE = "T.state.nextEventAt = Date.now() + 1e9; T.state.lastTick = Date.now() + 1e9;"
    page.evaluate("() => { " + FREEZE + " }")

    # --- locked until tier 1 ---
    page.click("#tab-invest"); page.wait_for_timeout(300)
    ok("Opens up once" in page.inner_text("#inv-loans"), "the loans card is locked at the start")
    page.evaluate("() => { T.state.earnedRun = 3000; T.rebuildLists(); }"); page.wait_for_timeout(300)
    ok(page.locator("#loanBorrow").count() == 1, "it opens at tier 1 ($2K earned)")

    # --- no businesses, nothing to lend against ---
    ok(page.locator("#loanBorrow").get_attribute("aria-disabled") == "true", "with no businesses, Borrow is greyed out")
    ok(not S(f"{L}.borrow()") and S("T.inv('loans').debt") == 0, "and borrowing does nothing")

    # --- credit limit follows your businesses ---
    page.evaluate(f"() => {{ T.state.biz = [{biz_js(1)}, {biz_js(2, 'coffee', 5)}]; T.state.nextBizId = 3; T.state.cash = 0; T.rebuildLists(); }}")
    coll = S("T.state.biz.reduce((s, b) => s + T.saleValue(b), 0)")
    ok(near(S(f"{L}.creditLimit()"), coll * 0.5), f"the bank lends up to half of what your businesses would sell for ({coll:.0f} -> {coll*0.5:.0f})")
    page.wait_for_timeout(300)
    step = S(f"{L}.borrowStep()")
    page.click("#loanBorrow"); page.wait_for_timeout(200)
    ok(near(S("T.state.cash"), step) and near(S("T.inv('loans').debt"), step), f"Borrow lends a quarter of the limit ({step:.0f}) as cash")
    ok(S("T.state.earnedRun") == 3000, "borrowed money doesn't count as earned")
    ok(S("T.inv('loans').dueAt") > S("Date.now()") + 100e3, "the first payment is due in 2 minutes")
    for _ in range(3): page.click("#loanBorrow"); page.wait_for_timeout(80)
    ok(near(S(f"{L}.available()"), 0, 1e-6) and page.locator("#loanBorrow").get_attribute("aria-disabled") == "true",
       "four presses use the whole limit, then Borrow greys out")
    debt = S("T.inv('loans').debt")
    ok(near(debt, coll * 0.5), "you owe exactly the limit")

    # --- interest ---
    rate = S(f"{L}.ratePerSec()")
    ok(near(rate, 0.35 / 300), "at tier 1 interest is 35% of what a plain tier 1 business earns per dollar")
    page.evaluate("() => { T.inv('loans').accrued = 0; T.investEarn(60); }")
    ok(near(S("T.inv('loans').accrued"), debt * rate * 60, 1e-4), "interest builds up over time")
    ok(near(S("T.investNet()"), -debt * rate, 1e-4), "and shows as a cost in the $/sec ticker")
    page.evaluate("() => { T.state.earnedRun = 2e5; }")
    ok(near(S(f"{L}.ratePerSec()"), 0.35 / 1500), "the rate drops as you grow (tier 2 pricing)")
    page.evaluate("() => { T.state.earnedRun = 3000; }")

    # --- an on-time payment ---
    page.evaluate("() => { const s = T.inv('loans'); s.accrued = 100; T.state.cash = 1000; s.dueAt = Date.now() - 1; T.investTick(Date.now()); }")
    ok(near(S("T.state.cash"), 900) and S("T.inv('loans').accrued") == 0, "a payment due is taken from cash by itself")
    ok(S("T.inv('loans').dueAt") > S("Date.now()") + 100e3, "and the next one is 2 minutes later")
    ok(near(S("T.inv('loans').interestPaid"), 100), "interest paid is counted")

    # --- a missed payment ---
    page.evaluate("() => { const s = T.inv('loans'); s.accrued = 100; T.state.cash = 30; s.dueAt = Date.now() - 1; T.investTick(Date.now()); }")
    ok(S("T.inv('loans').lateUntil") > S("Date.now()"), "can't pay: the payment is late")
    ok(near(S("T.inv('loans').accrued"), 110, 1e-4), "with a 10% late fee")
    ok("Payment missed" in page.text_content("#modalTitle") and S("T.state.cash") == 30, "a notice pops up, and no cash is taken yet")
    close_modal(); page.wait_for_timeout(300)
    ok(page.locator("#loanLate").is_visible() and "Payment late" in page.inner_text("#loanLate"), "the card shows the late payment and its countdown")
    ok(page.locator("#loanBorrow").get_attribute("aria-disabled") == "true", "no new borrowing while late")
    page.screenshot(path=os.path.join(SHOTS, "deck_loans_late.png"))
    page.evaluate("() => { T.state.cash = 500; }"); page.wait_for_timeout(300)
    ok(S("T.inv('loans').lateUntil") == 0 and near(S("T.state.cash"), 390, 1e-4), "it's paid the moment you have the cash")
    ok(page.locator("#loanLate").is_hidden(), "and the warning goes away")

    # --- the bank takes a business ---
    n0 = S("T.state.biz.length")
    page.evaluate("() => { const s = T.inv('loans'); s.accrued = 100; T.state.cash = 0; s.dueAt = Date.now() - 1; T.investTick(Date.now()); }")
    close_modal()
    # which business the bank should pick: cheapest one whose fire-sale price covers the debt, else the biggest.
    # Read in the same evaluate that ends the grace period: once it's over, the game's next frame
    # can take the business before a separate read gets to see it.
    owed, prices = S("""(() => { T.inv('loans').lateUntil = Date.now() - 1; T.state.cash = 0;
        return [T.inv('loans').debt + T.inv('loans').accrued, T.state.biz.map(b => ({ id: b.id, v: T.saleValue(b) * 0.75 }))]; })()""")
    enough = sorted([x for x in prices if x["v"] >= owed], key=lambda x: x["v"])
    expect = (enough[0] if enough else max(prices, key=lambda x: x["v"]))
    page.evaluate("() => T.investTick(Date.now())")
    ok(S("T.state.biz.length") == n0 - 1, "grace over and still short: the bank takes a business")
    ok(expect["id"] not in S("T.state.biz.map(b => b.id)"), "the one that covers the debt with the least left over")
    left = max(0, expect["v"] - owed)
    ok(near(S("T.state.cash"), left, 1e-4) and near(S("T.inv('loans').debt + T.inv('loans').accrued"), max(0, owed - expect["v"]), 1e-4),
       "its fire-sale price pays down the loan, and anything over comes back to you")
    ok("bank took" in page.text_content("#modalTitle").lower(), "a pop-up says what happened")
    ok(S("T.inv('loans').seized") == 1, "it's counted in the stats")
    close_modal()

    # --- over the limit: selling the collateral ---
    page.evaluate(f"() => {{ T.state.biz = [{biz_js(10, 'coffee', 5)}]; T.state.cash = 1e6; const s = T.inv('loans'); s.debt = 0; s.accrued = 0; s.dueAt = 0; T.rebuildLists(); }}")
    for _ in range(4): S(f"{L}.borrow()")
    debt = S("T.inv('loans').debt")
    page.evaluate("() => { T.state.biz = []; }")       # sold the business the loan rested on
    ok(near(S(f"{L}.overLimit()"), debt), "selling the business the loan rests on puts you over the limit")
    ok(near(S(f"{L}.dueNow()"), debt + S("T.inv('loans').accrued")), "and the whole extra is due with the next payment (a margin call)")
    page.evaluate("() => { T.inv('loans').dueAt = Date.now() - 1; T.investTick(Date.now()); }")
    ok(S("T.inv('loans').debt") == 0, "with the cash from the sale, that payment clears the loan")

    # --- bankruptcy: owing with nothing left to take ---
    page.evaluate(f"() => {{ T.state.biz = [{biz_js(11, 'coffee', 5)}]; T.state.cash = 0; }}")
    S(f"{L}.borrow()")
    page.evaluate("() => { T.state.biz = []; T.state.cash = 5; const s = T.inv('loans'); s.dueAt = Date.now() - 1; T.investTick(Date.now()); }")
    close_modal()
    page.evaluate("() => { T.inv('loans').lateUntil = Date.now() - 1; T.investTick(Date.now()); }")
    ok(S("T.inv('loans').frozen") and S("T.inv('loans').debt") == 0 and S("T.state.cash") == 0,
       "nothing left to take: the loan is written off, your last cash goes, and you're bankrupt")
    ok("Bankrupt" in page.text_content("#modalTitle"), "a pop-up says so")
    close_modal()
    page.evaluate(f"() => {{ T.state.biz = [{biz_js(12, 'coffee', 5)}]; T.rebuildLists(); }}"); page.wait_for_timeout(300)
    ok(not S(f"{L}.borrow()") and page.locator("#loanBorrow").get_attribute("aria-disabled") == "true", "no bank lends to you again this run")

    # --- retiring starts over (and lifts the ban) ---
    page.evaluate("() => { T.state.earnedAll = 4e9; T.retire(); " + FREEZE + " }"); close_modal()
    ok(not S("T.inv('loans').frozen") and S("T.inv('loans').debt") == 0, "retiring clears the loan and the ban")

    # --- paying back ---
    page.evaluate(f"() => {{ T.state.earnedRun = 3000; T.state.biz = [{biz_js(1, 'coffee', 5)}]; T.state.cash = 0; T.rebuildLists(); }}")
    S(f"{L}.borrow()"); page.evaluate("() => { T.inv('loans').accrued = 7; T.state.cash = 50; }"); page.wait_for_timeout(300)
    debt = S("T.inv('loans').debt")
    page.click("#loanRepay"); page.wait_for_timeout(100)
    ok(S("T.inv('loans').accrued") == 0 and near(S("T.inv('loans').debt"), debt - 43) and S("T.state.cash") == 0,
       "Pay back pays what you can: interest first, then the loan")
    page.evaluate("() => { T.state.cash = 1e6; }"); page.wait_for_timeout(300)
    ok("Pay it all off" in page.text_content("#loanRepay"), "with enough cash, the button offers to pay it all off")
    page.click("#loanRepay"); page.wait_for_timeout(100)
    ok(S("T.inv('loans').debt") == 0 and S("T.inv('loans').dueAt") == 0 and S("T.investNet()") == 0, "and then you owe nothing and no payment is due")

    # --- time away ---
    page.evaluate(f"() => {{ T.state.biz = [{biz_js(1, 'coffee', 5)}]; T.state.cash = 0; }}")
    S(f"{L}.borrow()")
    page.evaluate("() => { const s = T.inv('loans'); s.accrued = 0; s.dueAt = Date.now() - 19 * 3600e3; T.state.lastTick = Date.now() - 20 * 3600e3; T.catchUp(false); " + FREEZE + " }")
    d = S("T.inv('loans')")
    ok(d["lateUntil"] == 0 and d["accrued"] == 0, "after 20 hours away, the interest is paid from what your businesses earned")
    interest_cap = S("T.inv('loans').interestPaid")
    ok(interest_cap > 0, "interest built up over the time away was charged")

    # --- saving ---
    page.evaluate("() => { T.inv('loans').debt = 1234; T.saveNow(); }")
    ok(S("T.validState(JSON.parse(localStorage.getItem('selfMadeTycoon.save.v1'))).inv.loans.debt") == 1234, "the loan is saved and loaded")
    bad = S("T.validState({ cash: 1, biz: [], inv: { loans: { debt: -5, accrued: 'x', dueAt: NaN, frozen: 'yes' } } }).inv.loans")
    ok(bad["debt"] == 0 and bad["accrued"] == 0 and bad["frozen"] is False, "broken numbers in a save are cleaned up")
    owing = S("T.validState({ cash: 1, biz: [], inv: { loans: { debt: 500 } } }).inv.loans")
    ok(owing["dueAt"] > 0, "a save that owes money but has no due date gets one")

    # --- screenshots ---
    page.evaluate(f"() => {{ T.state.biz = [{biz_js(1, 'coffee', 5)}, {biz_js(2)}]; T.state.cash = 2500; const s = T.inv('loans'); s.debt = 0; s.accrued = 0; s.dueAt = 0; T.rebuildLists(); }}")
    S(f"{L}.borrow()"); page.wait_for_timeout(400)
    page.click("#tab-invest"); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(SHOTS, "deck_loans.png"))
    ok(not errors, f"no page errors {errors}")
    phone = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    perr = []
    phone.on("pageerror", lambda e: perr.append(str(e)))
    phone.goto(PAGE); phone.wait_for_timeout(500)
    phone.evaluate(f"() => {{ T.state.nextEventAt = Date.now() + 1e9; T.state.earnedRun = 3000; T.state.biz = [{biz_js(1, 'coffee', 5)}]; T.state.cash = 100; T.rebuildLists(); }}")
    phone.evaluate("() => T.invTests.loans.borrow()")
    phone.click("#tab-invest"); phone.wait_for_timeout(300)
    phone.locator("#inv-loans").scroll_into_view_if_needed(); phone.wait_for_timeout(200)
    phone.screenshot(path=os.path.join(SHOTS, "phone_loans.png"))
    wide = phone.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")
    ok(wide, "the card fits a phone screen (no sideways scrolling)")
    ok(not perr, f"no page errors on the phone {perr}")
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
