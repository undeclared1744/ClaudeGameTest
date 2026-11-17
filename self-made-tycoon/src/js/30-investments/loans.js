/* =====================================================================
   INVESTMENT: BANK LOANS AND LEVERAGE
   The way most real entrepreneurs grow faster than their savings allow:
   borrow against what you already own, buy more with it, and hope the
   new businesses earn more than the interest.

   How it plays (one card, one decision: borrow or pay back):
   - The bank lends up to LOAN_LTV (half) of what your businesses would
     sell for today (saleValue in 06-fixsell.js). That's your COLLATERAL:
     grow your businesses and you can borrow more.
   - Interest piles up every second you owe money. Every LOAN_PAY_SECONDS
     a payment comes due, and the bank takes it from your cash by itself.
   - The rate is VARIABLE and follows your size: it's LOAN_COST_SHARE of
     what a plain business at your current tier earns on the same money
     (see TIER_PAYBACK). So leverage pays when you put the money to work,
     and costs you when it just sits there.
   - Owe more than your collateral allows (say you sold a business the
     loan was resting on)? The extra is added to your next payment. In
     real life that's a "margin call".
   - Can't cover a payment? You get a late notice, a LATE_FEE, and
     LOAN_GRACE_SECONDS to find the money (it's paid the moment you have
     it). Still short at the end: the bank takes a business, sells it at a
     fire-sale price, keeps what you owe and gives you what's left.
   - Nothing left to take? The bank writes the loan off, takes what cash
     you have, and won't lend to you again this run (bankruptcy).

   All the timing uses real clock times (Date.now()), so it carries on
   while you're away. Interest only builds up over the same capped time
   (8 hours) your businesses earn for, and after time away you get the
   same grace period before the bank acts.
   ===================================================================== */
(() => {   // everything in its own scope: the build puts every file in one <script>
  // ---- Tuning ----
  const LOAN_LTV = 0.5;              // lend up to this share of your businesses' sale value
  const LOAN_PAY_SECONDS = 120;      // a payment comes due this often
  const LOAN_GRACE_SECONDS = 60;     // time to find the money after missing a payment
  const LOAN_COST_SHARE = 0.35;      // interest = this share of what a plain business earns per $
  const LATE_FEE = 0.10;             // share of a missed payment added on as a fee
  const FIRE_SALE = 0.75;            // the bank sells a business it takes for 75% of its sale value
  const BORROW_STEP = 0.25;          // each Borrow press takes this share of your credit limit
  const MIN_BORROW = 50;             // smallest loan the bank bothers with

  // Interest per second on each $1 owed. Tier 0 borrowers get tier 1
  // pricing: the card only opens at tier 1, but this keeps it safe anyway.
  const ratePerSec = () => LOAN_COST_SHARE / TIER_PAYBACK[Math.max(1, tierUnlocked())];
  // What the bank thinks your businesses are worth (what you could sell them for)
  const collateral = () => state.biz.reduce((sum, b) => sum + saleValue(b), 0);
  const L = () => inv("loans");
  // Most the bank will lend in total, and how much of that is still free
  const creditLimit = () => (L().frozen ? 0 : collateral() * LOAN_LTV);
  const available = () => Math.max(0, creditLimit() - L().debt);
  // Owed above the limit: due with the next payment
  const overLimit = () => Math.max(0, L().debt - collateral() * LOAN_LTV);
  // The payment the bank wants right now: interest so far + anything over the limit
  const dueNow = () => L().accrued + overLimit();
  // What one press of Borrow takes
  const borrowStep = () => Math.min(available(), Math.max(MIN_BORROW, creditLimit() * BORROW_STEP));
  const roundUp = n => Math.ceil(n * 100) / 100;      // never leave a fraction of a cent owing

  // ---- Actions ----
  function borrow() {
    const s = L(), amount = borrowStep();
    if (s.frozen) { toast("No bank will lend to you again this run"); return false; }
    if (s.lateUntil) { toast("Catch up on your late payment first"); return false; }
    if (amount < MIN_BORROW) { toast(state.biz.length ? "You've borrowed all the bank will lend. Grow your businesses to borrow more." : "Banks lend against businesses. Buy one first."); return false; }
    s.debt += amount;
    state.cash += amount;                 // borrowed money is cash to spend, but it isn't "earned"
    s.borrowed += amount;
    if (!s.dueAt) s.dueAt = Date.now() + LOAN_PAY_SECONDS * 1000;   // first payment in one period
    toast(`The bank lent you ${money(amount)}. Put it to work!`);
    dirty = true;
    render(true);
    return true;
  }
  // Pay off as much as your cash allows: interest first, then the loan itself
  function repay() {
    const s = L();
    const owed = s.accrued + s.debt;
    const pay = Math.min(state.cash, owed);
    if (pay <= 0) { toast(owed > 0 ? "No cash to pay with" : "You don't owe anything"); return false; }
    state.cash -= pay;
    const toInterest = Math.min(pay, s.accrued);
    s.accrued -= toInterest;
    s.interestPaid += toInterest;
    s.debt -= pay - toInterest;
    if (s.debt < 0.01 && s.accrued < 0.01) clearLoan(s);
    else if (s.lateUntil && dueNow() < 0.01) s.lateUntil = 0;   // that covered the late payment
    toast(s.debt ? `Paid ${money(pay)}. You still owe ${money(s.debt)}.` : `Paid off! You're debt-free.`);
    dirty = true;
    render(true);
    return true;
  }
  function clearLoan(s) { s.debt = 0; s.accrued = 0; s.dueAt = 0; s.lateUntil = 0; }

  // A payment is due: take it from cash, or send a late notice
  function collect(now) {
    const s = L(), due = roundUp(dueNow());
    if (state.cash >= due) {
      const extra = overLimit();
      state.cash -= due;
      s.interestPaid += s.accrued;
      s.accrued = 0;
      s.debt -= extra;
      s.lateUntil = 0;
      s.dueAt = now + LOAN_PAY_SECONDS * 1000;
      if (s.debt < 0.01) clearLoan(s);
      return true;
    }
    if (!s.lateUntil) {                    // first miss: fee and a grace period
      s.accrued += due * LATE_FEE;
      s.lateUntil = now + LOAN_GRACE_SECONDS * 1000;
      s.lates++;
      showModal("Payment missed", `You were ${money(due - state.cash)} short on your loan payment. The bank added a ${money(due * LATE_FEE)} late fee. ` +
        `Have ${money(roundUp(dueNow()))} in cash within ${LOAN_GRACE_SECONDS} seconds (it's taken the moment you do), or the bank takes one of your businesses.`, "");
    }
    return false;
  }

  // Grace is over and you still can't pay: the bank takes collateral.
  function foreclose(now) {
    const s = L();
    const owed = s.accrued + s.debt;          // a default makes the whole loan due at once
    if (!state.biz.length) {                  // nothing to take: write it off, no more loans this run
      const taken = Math.min(state.cash, owed);
      state.cash -= taken;
      s.interestPaid += Math.min(taken, s.accrued);
      clearLoan(s);
      s.frozen = true;
      showModal("Bankrupt", `You had nothing left for the bank to take, so it wrote off your loan` +
        (taken > 0 ? ` after taking your last ${money(taken)}` : "") + `. No bank will lend to you again until you retire.`, "");
      return;
    }
    // Take the business that covers the debt with the least left over: the
    // cheapest one whose fire-sale price is enough, else the most valuable.
    const price = b => saleValue(b) * FIRE_SALE;
    const enough = state.biz.filter(b => price(b) >= owed).sort((a, b) => price(a) - price(b));
    const b = enough[0] || [...state.biz].sort((a, c) => price(c) - price(a))[0];
    const proceeds = price(b);
    state.biz = state.biz.filter(x => x !== b);
    if (typeof sheetBizId !== "undefined" && sheetBizId === b.id) closeSheet();
    s.seized++;
    const toInterest = Math.min(proceeds, s.accrued);
    s.accrued -= toInterest;
    s.interestPaid += toInterest;
    s.debt = Math.max(0, s.debt - (proceeds - toInterest));
    const leftover = Math.max(0, proceeds - owed);
    state.cash += leftover;                   // your equity comes back to you (not "earned")
    s.lateUntil = 0;
    if (s.debt < 0.01 && s.accrued < 0.01) clearLoan(s);
    else s.dueAt = now + LOAN_PAY_SECONDS * 1000;
    showModal("The bank took a business", `You couldn't make your loan payment, so the bank took ${b.name} and sold it for ${money(proceeds)}. ` +
      (s.debt ? `You still owe ${money(s.debt)}.` : `That paid off the loan` + (leftover > 0 ? ` and you got the ${money(leftover)} left over.` : ".")),
      leftover > 0 ? "+" + money(leftover) : "");
    dirty = true;
  }

  // ---- Drawing the card ----
  // Styles for this card only (style.css belongs to the core).
  const css = document.createElement("style");
  css.textContent = `
    .loan-nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 12px; }
    .loan-nums div { display: grid; }
    .loan-nums span { font-size: 13px; color: var(--muted); }
    .loan-nums b { font: 600 20px var(--mono); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .loan-nums small { font: 12px var(--mono); color: var(--muted); }
    @media (max-width: 760px) { .loan-nums b { font-size: 16px; } }
    .loan-late { background: #f3d6d2; color: #8f2d25; border-radius: 8px; padding: 8px 10px; font-weight: 700; }
    .loan-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .loan-btns .bigbtn { font-size: 18px; padding: 9px 14px; }`;
  document.head.appendChild(css);

  // (named drawCard, not render: render() is the game's own redraw)
  function drawCard(card, full) {
    if (full && !card.querySelector(".loan-nums")) {
      card.innerHTML = `<h2 class="cond">Bank loans</h2>
        <p>Borrow against your businesses to buy more, sooner. The bank lends up to half of what your businesses would sell for.
        Interest is due every ${LOAN_PAY_SECONDS / 60} minutes and comes out of your cash by itself. <strong>Miss a payment and the bank takes a business.</strong></p>
        <div class="loan-late" id="loanLate" hidden></div>
        <div class="loan-nums">
          <div><span>You owe</span><b id="loanDebt"></b></div>
          <div><span>Bank will lend</span><b id="loanAvail"></b></div>
          <div><span id="loanNextLbl">Next payment</span><b id="loanNext"></b><small id="loanWhen"></small></div>
        </div>
        <div class="loan-btns">
          <button class="bigbtn go cond" id="loanBorrow"></button>
          <button class="bigbtn cond" id="loanRepay"></button>
        </div>
        <p class="note" id="loanNote"></p>`;
      card.querySelector("#loanBorrow").addEventListener("click", borrow);
      card.querySelector("#loanRepay").addEventListener("click", repay);
    }
    if (!card.querySelector(".loan-nums")) return;
    const s = L(), now = Date.now(), q = sel => card.querySelector(sel);
    const step = borrowStep(), canBorrow = !s.frozen && !s.lateUntil && step >= MIN_BORROW;
    q("#loanDebt").textContent = money(s.debt);
    q("#loanAvail").textContent = s.frozen ? "Nothing" : money(available());
    // Next payment: interest so far + what the rest of the period will add + any over-limit part
    const left = Math.max(0, s.dueAt - now);
    const projected = s.debt ? s.accrued + s.debt * ratePerSec() * left / 1000 + overLimit() : 0;
    q("#loanNext").textContent = s.lateUntil ? money(dueNow()) : s.debt ? money(projected) : "None";
    q("#loanWhen").textContent = s.lateUntil ? "overdue" : s.debt ? `due in ${duration(left)}` : "";
    q("#loanNextLbl").textContent = s.lateUntil ? "Late payment" : "Next payment";
    const late = q("#loanLate");
    late.hidden = !s.lateUntil;
    if (s.lateUntil) late.textContent = `Payment late! Have ${money(roundUp(dueNow()))} in cash within ${duration(Math.max(0, s.lateUntil - now) + 999)} or the bank takes a business.`;
    const bb = q("#loanBorrow"), rb = q("#loanRepay");
    bb.textContent = canBorrow ? `Borrow ${money(step)}` : "Borrow";
    bb.setAttribute("aria-disabled", String(!canBorrow));
    const owed = s.debt + s.accrued;
    rb.textContent = !owed ? "Pay back" : state.cash >= owed ? `Pay it all off: ${money(owed)}` : `Pay back ${money(state.cash)}`;
    rb.setAttribute("aria-disabled", String(!owed || state.cash <= 0));
    q("#loanNote").textContent = s.frozen
      ? "You went bankrupt this run. Banks will lend to you again after you retire."
      : !state.biz.length ? "Banks lend against businesses. Buy one first."
      : (s.debt ? `Interest right now: ${money(s.debt * ratePerSec() * LOAN_PAY_SECONDS)} every ${LOAN_PAY_SECONDS / 60} minutes. ` : "") +
        (overLimit() > 0 ? `You owe ${money(overLimit())} more than your businesses support, so that's added to your next payment. ` : "") +
        "Borrowing pays off when the money buys businesses that earn more than the interest.";
  }

  registerInvestment({
    id: "loans", name: "Bank loans", order: 20, unlockTier: 1,
    fresh: () => ({ debt: 0, accrued: 0, dueAt: 0, lateUntil: 0, frozen: false, borrowed: 0, interestPaid: 0, seized: 0, lates: 0 }),
    // Never trust a save: every number must be a finite, non-negative number
    validate(saved) {
      const num = k => (Number.isFinite(saved[k]) && saved[k] >= 0 ? saved[k] : 0);
      const out = { debt: num("debt"), accrued: num("accrued"), dueAt: num("dueAt"), lateUntil: num("lateUntil"), frozen: saved.frozen === true,
        borrowed: num("borrowed"), interestPaid: num("interestPaid"), seized: Math.floor(num("seized")), lates: Math.floor(num("lates")) };
      if (out.debt > 0 && !out.dueAt) out.dueAt = Date.now() + LOAN_PAY_SECONDS * 1000;   // owing but no due date: give one
      if (!out.debt && !out.accrued) { out.dueAt = 0; out.lateUntil = 0; }
      return out;
    },
    // Interest builds up over time (also for time away, already capped at 8 hours)
    earn(seconds) {
      const s = L();
      if (s.debt > 0) s.accrued += s.debt * ratePerSec() * seconds;
      return 0;                              // nothing is paid here: payments happen in tick()
    },
    tick(now) {
      const s = L();
      if (!s.debt && !s.accrued) return;
      // While a modal is up (a missed-payment notice, "while you were out",
      // a sale...) the bank waits, so two pop-ups never land on each other.
      if (modalOpen()) return;
      if (s.lateUntil) {
        if (state.cash >= roundUp(dueNow())) { collect(now); toast("Late payment made. The bank is happy again."); }
        else if (now >= s.lateUntil) foreclose(now);
        return;
      }
      if (s.dueAt && now >= s.dueAt) collect(now);
    },
    netIncome: () => -L().debt * ratePerSec(),    // interest shows as a cost in the $/sec ticker
    render: drawCard,
    stats: () => {
      const s = L();
      if (!s.borrowed) return [];
      return [["Bank loan owed", money(s.debt)], ["Interest paid", money(s.interestPaid)], ["Businesses lost to the bank", s.seized]];
    },
    // Handles for tests/invest_loans.py
    test: { borrow, repay, collect, foreclose, creditLimit, available, collateral, ratePerSec, dueNow, overLimit, borrowStep,
      LOAN_LTV, LOAN_PAY_SECONDS, LOAN_GRACE_SECONDS, LOAN_COST_SHARE, LATE_FEE, FIRE_SALE },
  });
})();
