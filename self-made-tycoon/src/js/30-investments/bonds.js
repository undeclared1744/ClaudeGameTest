/* =====================================================================
   INVESTMENT: BONDS AND CDS
   The safe end of investing: lend your money to a bank, the government
   or a big company for a set time, and get it back with interest.
   The catch is that it's LOCKED UP until the day it matures.

   How it plays (one card, one decision: which one to buy):
   - Bank CD: short, lowest rate. The only one you can get out of early,
     and that costs you all the interest plus CD_BREAK_FEE of what you put in.
   - Government bond: longer, a bit more, can't be cashed early.
   - Corporate bond: longest and best rate, but CORP_DEFAULT_CHANCE of the
     company going bust, which pays back only CORP_RECOVERY of your money.
     (A higher rate always means more risk somewhere. That's the lesson.)
   - Shares are set so the order is the real one: CD < government bond <
     corporate bond (even after busts) < index fund < single stocks <
     running a business. Safer means less.
   - Buy puts a quarter of your cash in. The interest is fixed the moment
     you buy, and paid with your money back on the day it matures.
     Interest counts as earned; getting your own money back doesn't.

   Pace: the rate follows the game's pacing table. Interest over the term
   = rate share x (term / one payback period at your tier), with the
   payback period from TIER_PAYBACK (tier 2 at the lowest, so the first
   bonds don't pay silly numbers). A business would earn 100% per period,
   so bonds always earn less than running a business: they're for cash
   you're saving up and don't want sitting idle.

   Maturity uses real clock times, so a bond you buy before bed is
   waiting for you in the morning, however long you were gone.
   ===================================================================== */
(() => {   // own scope: every file shares one <script>
  // term: seconds until it matures. share: interest as a share of what a
  // plain business would earn on the same money in that time.
  const PRODUCTS = [
    { id: "cd",   name: "Bank CD",         term: 180,  share: 0.10, desc: "Short and safe. You can break it early, but you lose the interest and a 5% fee." },
    { id: "gov",  name: "Government bond", term: 600,  share: 0.15, desc: "Safe as it gets. Locked until it matures." },
    { id: "corp", name: "Corporate bond",  term: 1800, share: 0.25, desc: "Best rate, but about 1 in 20 companies go bust and pay back only half." },
  ];
  const PR = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const BUY_SHARE = 0.25;           // Buy puts this share of your cash in
  const MIN_BUY = 10;
  const MAX_HOLD = 8;               // keeps the list short on a phone
  const CD_BREAK_FEE = 0.05;
  const CORP_DEFAULT_CHANCE = 0.05;
  const CORP_RECOVERY = 0.5;

  const B = () => inv("bonds");
  const period = () => TIER_PAYBACK[Math.max(2, tierUnlocked())];
  // Interest rate for the whole term if you bought product p right now
  const rateFor = p => p.share * p.term / period();
  const buyAmount = () => state.cash * BUY_SHARE;
  const termText = p => `${p.term / 60} min`;     // terms are whole minutes
  const pctText = r => (r * 100 >= 10 ? Math.round(r * 100) : (r * 100).toFixed(1)) + "%";

  // ---- Actions ----
  function buy(id) {
    const p = PR[id], s = B(), amount = buyAmount();
    if (!p) return false;
    if (s.held.length >= MAX_HOLD) { toast(`You can hold ${MAX_HOLD} at a time. Wait for one to mature.`); return false; }
    if (amount < MIN_BUY) { toast(`You need at least ${money(MIN_BUY / BUY_SHARE)} in cash to buy`); return false; }
    state.cash -= amount;
    const now = Date.now();
    s.held.push({ id: s.nextId++, p: id, amount, interest: amount * rateFor(p), boughtAt: now, matures: now + p.term * 1000 });
    toast(`Bought a ${p.name.toLowerCase()} for ${money(amount)}. It pays ${money(amount * rateFor(p))} in ${termText(p)}.`);
    dirty = true;
    render(true);
    return true;
  }
  // Only CDs can be broken: you get your money back minus the fee, no interest
  function breakCd(holdId) {
    const s = B(), h = s.held.find(x => x.id === holdId);
    if (!h || h.p !== "cd") return false;
    const back = h.amount * (1 - CD_BREAK_FEE);
    state.cash += back;                      // your own money coming back isn't "earned"
    s.held = s.held.filter(x => x !== h);
    toast(`CD broken early: ${money(back)} back (${money(h.amount - back)} fee, no interest)`);
    dirty = true;
    render(true);
    return true;
  }
  // Pay out everything that has matured by `now`. Several at once (after
  // time away) get one combined message.
  function matureDue(now) {
    const s = B();
    const due = s.held.filter(h => now >= h.matures);
    if (!due.length) return 0;
    let paid = 0, busts = 0;
    for (const h of due) {
      if (h.p === "corp" && Math.random() < CORP_DEFAULT_CHANCE) {   // the company went bust
        state.cash += h.amount * CORP_RECOVERY;
        s.lost += h.amount * (1 - CORP_RECOVERY);
        s.defaults++;
        busts++;
        paid += h.amount * CORP_RECOVERY;
      } else {
        state.cash += h.amount;              // your money back
        addCash(h.interest);                 // the interest is real earnings
        s.interestEarned += h.interest;
        paid += h.amount + h.interest;
      }
    }
    s.held = s.held.filter(h => now < h.matures);
    toast(busts ? `A company you lent to went bust and paid back only half. Bonds paid ${money(paid)} in all.`
                : `${due.length > 1 ? due.length + " bonds" : "Your " + PR[due[0].p].name.toLowerCase()} matured: +${money(paid)}`);
    dirty = true;
    return paid;
  }

  // ---- Drawing the card ----
  const css = document.createElement("style");
  css.textContent = `
    .bnd-prod { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; border-top: 1px solid var(--rule); padding-top: 8px; }
    .bnd-prod h3 { margin: 0; font-size: 19px; line-height: 1.05; }
    .bnd-prod .sub { font-size: 12px; color: var(--muted); }
    .bnd-prod .rate { font: 13px var(--mono); }
    .bnd-prod .smallbtn { grid-row: 1 / span 3; grid-column: 2; min-width: 104px; }
    .bnd-held { display: grid; gap: 6px; }
    .bnd-h { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 8px; font: 13px var(--mono); background: var(--paper); border-radius: 8px; padding: 6px 10px; }
    .bnd-h .left { color: var(--muted); grid-column: 1; }
    .bnd-h .smallbtn { grid-row: 1 / span 2; grid-column: 2; }
    .bnd-h .smallbtn { padding: 2px 8px; font: 700 13px var(--body); }`;
  document.head.appendChild(css);

  let heldKey = "";
  function drawCard(card, full) {
    const s = B(), now = Date.now();
    if (full && !card.querySelector(".bnd-prod")) {
      heldKey = "";
      card.innerHTML = `<h2 class="cond">Bonds and CDs</h2>
        <p>Lend your money out for a set time and get it back with interest. Safe and steady, but it's locked up until it matures,
        and it earns less than running a business. Good for cash you're saving up. Buy puts in a quarter of your cash.</p>` +
        PRODUCTS.map(p => `<div class="bnd-prod" data-id="${p.id}">
          <h3 class="cond">${esc(p.name)}</h3>
          <button class="smallbtn" id="bnd-buy-${p.id}">Buy</button>
          <div class="sub">${esc(p.desc)}</div><div class="rate"></div></div>`).join("") +
        `<div class="bnd-held" id="bndHeld"></div><p class="note" id="bndNote"></p>`;
      for (const p of PRODUCTS) card.querySelector(`#bnd-buy-${p.id}`).addEventListener("click", () => buy(p.id));
    }
    if (!card.querySelector(".bnd-prod")) return;
    const amt = buyAmount(), full8 = s.held.length >= MAX_HOLD;
    if (full) for (const row of card.querySelectorAll(".bnd-prod")) {
      const p = PR[row.dataset.id], r = rateFor(p);
      row.querySelector(".rate").textContent = `+${pctText(r)} in ${termText(p)}` + (amt >= MIN_BUY ? ` · ${money(amt)} becomes ${money(amt * (1 + r))}` : "");
      const btn = row.querySelector(".smallbtn");
      btn.textContent = amt >= MIN_BUY ? `Buy ${money(amt)}` : "Buy";
      btn.setAttribute("aria-disabled", String(amt < MIN_BUY || full8));
    }
    // What you hold: rebuilt only when the list changes; the countdowns update every frame
    const box = card.querySelector("#bndHeld");
    const key = s.held.map(h => h.id).join(",");
    if (key !== heldKey) {
      heldKey = key;
      box.innerHTML = s.held.map(h => `<div class="bnd-h" data-id="${h.id}"><span>${esc(PR[h.p].name)}: ${money(h.amount)} + ${money(h.interest)}</span>` +
        `<span class="left"></span>${h.p === "cd" ? `<button class="smallbtn" id="bnd-break-${h.id}">Break</button>` : ""}</div>`).join("");
      for (const h of s.held) box.querySelector(`#bnd-break-${h.id}`)?.addEventListener("click", () => breakCd(h.id));
    }
    for (const row of box.children) {
      const h = s.held.find(x => x.id === Number(row.dataset.id));
      if (h) row.querySelector(".left").textContent = `matures in ${duration(Math.max(0, h.matures - now) + 999)}`;
    }
    card.querySelector("#bndNote").textContent = full8 ? `That's the most you can hold (${MAX_HOLD}). More can be bought as these mature.`
      : s.interestEarned ? `Interest earned so far: ${money(s.interestEarned)}.` + (s.defaults ? ` Companies gone bust on you: ${s.defaults}.` : "") : "";
  }

  registerInvestment({
    id: "bonds", name: "Bonds and CDs", order: 40, unlockTier: 1,
    fresh: () => ({ held: [], nextId: 1, interestEarned: 0, lost: 0, defaults: 0 }),
    validate(saved) {
      const pos = v => Number.isFinite(v) && v >= 0;
      const held = (Array.isArray(saved.held) ? saved.held : [])
        .filter(h => h && PR[h.p] && pos(h.amount) && pos(h.interest) && pos(h.matures) && pos(h.boughtAt))
        // a bond can't mature later than its own term allows (guards against a hand-edited save)
        .map(h => ({ id: Math.floor(Number(h.id)) || 0, p: h.p, amount: h.amount, interest: h.interest, boughtAt: h.boughtAt,
                     matures: Math.min(h.matures, h.boughtAt + PR[h.p].term * 1000) }))
        .slice(0, MAX_HOLD);
      held.forEach((h, i) => { if (!h.id) h.id = 1e6 + i; });
      return { held, nextId: Math.max(pos(saved.nextId) ? Math.floor(saved.nextId) : 1, ...held.map(h => h.id + 1), 1),
        interestEarned: pos(saved.interestEarned) ? saved.interestEarned : 0, lost: pos(saved.lost) ? saved.lost : 0,
        defaults: pos(saved.defaults) ? Math.floor(saved.defaults) : 0 };
    },
    tick(now) { matureDue(now); },
    render: drawCard,
    stats: () => {
      const s = B();
      const held = s.held.reduce((sum, h) => sum + h.amount, 0);
      return held || s.interestEarned || s.defaults ? [["Bonds and CDs held", money(held)], ["Interest from bonds", money(s.interestEarned)]] : [];
    },
    test: { PRODUCTS, buy, breakCd, matureDue, rateFor, buyAmount, period, MAX_HOLD, CD_BREAK_FEE, CORP_DEFAULT_CHANCE, CORP_RECOVERY },
  });
})();
