/* =====================================================================
   INVESTMENT: REAL ESTATE
   Buy property for the rent, borrow to buy it, fix it up, and sell when
   the market's high. It plays like the real thing, boiled down to one
   card on the Invest tab and one decision at a time:

   - ONE PROPERTY FOR SALE at a time. The decision is: pass on it, buy it
     with cash, or buy it with a mortgage. A new one comes up by itself
     every few minutes, or sooner if you ask to see another.
   - RENT comes in every second. Property pays back slower than a
     business of the same size (RENT_PAYBACK is twice as long), but it
     runs itself and its value rises with the market over time.
   - A MORTGAGE: put 20% down and the bank lends the rest. You pay the
     bank a fixed amount every second (interest, plus a little of the
     loan) until it's paid off. Borrowing lets you own more with the same
     cash (leverage), but the payment doesn't drop when the market (and
     so the rent) does. That is the real risk of real estate.
   - FORECLOSURE: if you can't make the payments (your cash hits zero),
     the bank takes the property that's costing you the most and sells
     it fast and cheap. Whatever's left after the loan is yours.
   - CONDITION: Fixer-upper, Dated, Good, Renovated. Fixer-uppers are
     cheap and rent for less. Renovating moves a property up one step
     (money + time), raising its rent and its value: buy low, fix, flip.
   - SELLING takes time (you wait for a buyer) and costs 6% in agent and
     closing fees. The price is set by the market on the day it sells.
   - THE MARKET: one number (1.00x at the start) that every rent and
     value follows. Each minute it takes a random step, up a little on
     average, with swings. A sparkline on the card shows the last half
     hour.
   - A "Tenant's offer" event: your tenant offers above market for the
     place, with no agent fees.

   Everything here lives inside one function scope, so names like
   CONDITIONS or DOWN_PAYMENT can't clash with another investment's file
   (all the game's files share one scope once they're bundled). The only
   things this file uses from the core are listed in 20-invest.js
   (registerInvestment, inv, addCash, money, duration, toast, showModal,
   armOrRun, priceMult, globalMult, tierUnlocked, TIER_PAYBACK,
   FIX_SECONDS, SELL_SECONDS, NAME_PARTS, pick, esc, initials, modalOpen).

   Ported from the half-built version written before the game was split
   into files (real-estate-wip.patch). Changes from that version are
   marked "Changed from the WIP" below.
   ===================================================================== */
(() => {
  const ID = "real-estate";

  // ---------------------------------------------------------------
  // Numbers that set the feel. Tweak these to rebalance.
  // ---------------------------------------------------------------
  // Property types. tier = which game tier unlocks it (see TIERS).
  // cost = price of a Good one when the market is at 1.00x.
  const TYPES = [
    { id: "house",  name: "Rental house",       tier: 1, cost: 8000,  streets: ["Maple St", "Elm Ave", "Birch Ln", "Cypress Ct", "Willow Way", "Dogwood Dr"] },
    { id: "duplex", name: "Duplex",             tier: 1, cost: 20e3,  streets: ["Oak St", "Pecan Ave", "Hickory Rd", "Laurel Ln"] },
    { id: "apts",   name: "Apartment building", tier: 2, cost: 500e3, streets: ["Main St", "Church St", "Market St", "Front St"] },
    { id: "strip",  name: "Strip mall",         tier: 3, cost: 20e6,  streets: ["Highway 17", "Commerce Blvd", "Route 9", "Industrial Pkwy"] },
    { id: "office", name: "Office tower",       tier: 4, cost: 2e9,   streets: ["Broad St", "Center Plaza", "Bay St", "Capitol Ave"] },
    { id: "tower",  name: "Skyscraper",         tier: 5, cost: 300e9, streets: ["Financial Row", "Harbor Point", "Skyline Blvd"] },
  ];
  const TYPE = Object.fromEntries(TYPES.map(t => [t.id, t]));
  // Seconds of rent to pay back a Good property, by tier: twice as long
  // as a business of the same tier (TIER_PAYBACK).
  const RENT_PAYBACK = TIER_PAYBACK.map(s => s * 2);
  // Condition: rent and price multipliers, and the chip color.
  const CONDITIONS = [
    { name: "Fixer-upper", rent: 0.6,  price: 0.55, tone: "bad"  },
    { name: "Dated",       rent: 0.85, price: 0.8,  tone: ""     },
    { name: "Good",        rent: 1.0,  price: 1.0,  tone: "good" },
    { name: "Renovated",   rent: 1.15, price: 1.2,  tone: "good" },
  ];
  const TOP = CONDITIONS.length - 1;
  const DOWN_PAYMENT = 0.2;        // share of the price you pay up front with a mortgage
  const CLOSING_COSTS = 0.03;      // fees on top of the price when you buy
  const SELL_COSTS = 0.06;         // agent + closing fees when you sell
  const FORECLOSE_PRICE = 0.8;     // a foreclosed property sells for this share of its value
  const RENOVATE_COST = 0.15;      // each renovation step costs this share of the type's price
  // The mortgage. At the start, interest takes 60% of a property's fair
  // rent and the whole payment 90%, so a fresh mortgage still leaves a
  // little rent over. That works out to the loan being paid off in about
  // 1.5x the property's payback time (15 minutes for a rental house).
  const MORTGAGE_INTEREST_SHARE = 0.6;
  const MORTGAGE_PAYMENT_SHARE = 0.9;
  // The market: every MARKET_STEP seconds it's multiplied by
  // e^(DRIFT + SWING * a bell-curve random number).
  // Changed from the WIP: DRIFT 0.002 -> 0.001. At 0.002 the market
  // roughly tripled in 10 hours and sat at the 6x cap after a day of
  // play, so the swings stopped mattering. 0.001 is about +6% an hour.
  const MARKET_STEP = 60;
  const MARKET_DRIFT = 0.001;
  const MARKET_SWING = 0.015;
  const MARKET_MIN = 0.4, MARKET_MAX = 6;
  const MARKET_HIST = 30;          // steps kept for the sparkline (30 minutes)
  // Listings (Changed from the WIP: one at a time instead of three, so
  // there's one clear decision on the card).
  const LISTING_SECONDS = 240;     // a new property comes up by itself this often
  const ANOTHER_WAIT = 20;         // "Show me another" can be pressed this often

  // ---------------------------------------------------------------
  // State. inv(ID) is this module's slice of the save:
  //   props:    properties you own, each
  //             { id, type, name, city, cond (0-3), invested ($ you've put in),
  //               loan: null | { balance, rate (per sec), pay ($/sec) },
  //               fixing: null | { until }, selling: null | { until } }
  //   nextId:   id for the next property you buy
  //   listing:  the one property for sale { key, type, name, city, cond, noise } or null
  //   listingAt:    when a new listing comes up by itself
  //   anotherAt:    when "Show me another" works again
  //   market:   { value, nextAt (time of next step), hist: [last values] }
  //   arrears:  mortgage payments you couldn't make (see earn and tick)
  //   bought, sold, foreclosed, profit: for the Stats tab (this run)
  // ---------------------------------------------------------------
  const S = () => inv(ID);
  const fresh = () => ({
    props: [], nextId: 1, listing: null, listingAt: 0, anotherAt: 0,
    market: { value: 1, nextAt: Date.now() + MARKET_STEP * 1000, hist: [1] },
    arrears: 0, bought: 0, sold: 0, foreclosed: 0, profit: 0,
  });

  // A save is never trusted: rebuild every field, dropping anything that
  // isn't a real property type and any number that isn't a real number.
  function validate(s) {
    if (!s || typeof s !== "object") throw new Error("not an object");
    const base = fresh();
    const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
    const cond = c => Math.min(TOP, Math.max(0, Math.floor(Number(c)) || 0));
    const time = t => (t && Number.isFinite(t.until) ? { until: t.until } : null);
    const props = (Array.isArray(s.props) ? s.props : []).filter(p => p && TYPE[p.type]).map(p => ({
      id: Math.floor(num(p.id)), type: p.type, name: String(p.name || TYPE[p.type].name), city: String(p.city || ""),
      cond: cond(p.cond), invested: num(p.invested),
      // A loan must have a payment bigger than its interest, or it could
      // never be paid off (and the payoff maths would take the log of a
      // negative number). A broken loan is dropped, not kept.
      loan: p.loan && num(p.loan.balance) > 0 && num(p.loan.rate) > 0 && num(p.loan.pay) > p.loan.rate * p.loan.balance
        ? { balance: p.loan.balance, rate: p.loan.rate, pay: p.loan.pay } : null,
      fixing: p.cond >= TOP ? null : time(p.fixing),
      selling: time(p.selling),
    }));
    // Two properties with the same id would make the buttons act on the
    // wrong one: give any repeat a new id.
    const seen = new Set();
    let next = Math.max(1, Math.floor(num(s.nextId, 1)), ...props.map(p => p.id + 1));
    for (const p of props) { if (!p.id || seen.has(p.id)) p.id = next++; seen.add(p.id); }
    const l = s.listing;
    const listing = l && TYPE[l.type] && num(l.noise) > 0
      ? { key: String(l.key || Math.random()), type: l.type, name: String(l.name || ""), city: String(l.city || ""), cond: cond(l.cond), noise: l.noise }
      : null;
    const m = s.market || {};
    const value = Math.min(MARKET_MAX, Math.max(MARKET_MIN, num(m.value, 1) || 1));
    const hist = (Array.isArray(m.hist) ? m.hist : []).filter(v => Number.isFinite(v) && v > 0).slice(-MARKET_HIST);
    return {
      props, nextId: next, listing, listingAt: num(s.listingAt), anotherAt: num(s.anotherAt),
      // a step time far in the future (a changed clock) would freeze the market: pull it back
      market: { value, nextAt: Math.min(num(m.nextAt, base.market.nextAt), Date.now() + MARKET_STEP * 1000), hist: hist.length ? hist : [value] },
      arrears: num(s.arrears), bought: num(s.bought), sold: num(s.sold), foreclosed: num(s.foreclosed),
      profit: Number.isFinite(s.profit) ? s.profit : 0,     // can be negative
    };
  }

  // ---------------------------------------------------------------
  // Prices and rents
  // ---------------------------------------------------------------
  const mkt = () => S().market.value;
  // What a property (or listing) of this type and condition is worth today
  const value = p => TYPE[p.type].cost * CONDITIONS[p.cond].price * mkt();
  // Asking price of a listing: its own haggle noise and your Negotiator upgrades
  const price = l => value(l) * l.noise * priceMult();
  // Rent per second. Your global upgrades and Legacy stars count (good
  // management), sector upgrades don't.
  const rent = p => TYPE[p.type].cost / RENT_PAYBACK[TYPE[p.type].tier] * CONDITIONS[p.cond].rent * mkt() * globalMult();
  // Mortgage payment per second while a loan is open
  const payment = p => (p.loan && p.loan.balance > 0 ? p.loan.pay : 0);
  const net = p => rent(p) - payment(p);
  const totalRent = () => S().props.reduce((t, p) => t + rent(p), 0);
  const totalPay = () => S().props.reduce((t, p) => t + payment(p), 0);
  const renovateCost = p => TYPE[p.type].cost * RENOVATE_COST * mkt() * priceMult();
  const renovateSeconds = p => FIX_SECONDS[TYPE[p.type].tier] * 2;
  const sellSeconds = p => SELL_SECONDS[TYPE[p.type].tier];
  // What selling today would put in your pocket: value minus fees minus the loan
  const proceeds = p => value(p) * (1 - SELL_COSTS) - (p.loan ? p.loan.balance : 0);
  // Cash it takes to buy: the whole price, or the down payment, plus closing costs
  const cashNeeded = (l, mortgage) => price(l) * ((mortgage ? DOWN_PAYMENT : 1) + CLOSING_COSTS);
  // The loan you'd get on a listing. The payment is set from the
  // listing's fair rent per dollar of its price, so a cheap fixer-upper
  // gets a small payment and a pricey renovated one a bigger one.
  // (rent of a Good one / its value = 1 / RENT_PAYBACK, whatever the market.)
  function loanFor(l) {
    const borrowed = price(l) * (1 - DOWN_PAYMENT);
    const perDollar = 1 / (RENT_PAYBACK[TYPE[l.type].tier] * (1 - DOWN_PAYMENT));
    return { balance: borrowed, rate: perDollar * MORTGAGE_INTEREST_SHARE, pay: borrowed * perDollar * MORTGAGE_PAYMENT_SHARE };
  }
  // A quick read on the asking price, from the listing's haggle noise
  const dealRating = l => (l.noise < 0.95 ? { text: "Good deal", tone: "good" } : l.noise > 1.05 ? { text: "Overpriced", tone: "bad" } : { text: "Fair price", tone: "" });
  const findProp = id => S().props.find(p => p.id === id);

  // ---------------------------------------------------------------
  // The market
  // ---------------------------------------------------------------
  // A bell-curve random number (mean 0, spread about 1)
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73;
  // Take every step that's due by `now`. After time away that's up to 480
  // steps (8 hours); a longer gap (an old save) stops at 600 and skips the rest.
  function stepMarket(now) {
    const m = S().market;
    let steps = 0;
    while (now >= m.nextAt && steps < 600) {
      m.value = Math.min(MARKET_MAX, Math.max(MARKET_MIN, m.value * Math.exp(MARKET_DRIFT + MARKET_SWING * gauss())));
      m.hist.push(m.value);
      if (m.hist.length > MARKET_HIST) m.hist.shift();
      m.nextAt += MARKET_STEP * 1000;
      steps++;
    }
    if (now >= m.nextAt) m.nextAt = now + MARKET_STEP * 1000;
    return steps;
  }

  // ---------------------------------------------------------------
  // Listings
  // ---------------------------------------------------------------
  function makeListing() {
    const top = tierUnlocked();
    const types = TYPES.filter(t => t.tier <= top);
    if (!types.length) return null;
    // mostly the biggest type you've unlocked, sometimes an older, cheaper one
    const biggest = Math.max(...types.map(t => t.tier));
    const type = Math.random() < 0.6 ? pick(types.filter(t => t.tier === biggest)) : pick(types);
    return {
      key: Math.random().toString(36).slice(2, 9), type: type.id,
      name: `${10 + Math.floor(Math.random() * 989)} ${pick(type.streets)}`, city: pick(NAME_PARTS.city),
      cond: [0, 0, 1, 1, 1, 2, 2, 2, 3][Math.floor(Math.random() * 9)],    // fixer-uppers and dated ones are common
      noise: 0.9 + Math.random() * 0.2,
    };
  }
  function newListing(now = Date.now()) {
    const s = S();
    s.listing = makeListing();
    s.listingAt = now + LISTING_SECONDS * 1000;
  }
  // "Show me another": pass on this one (with a short wait, so you can't
  // flick through hundreds to find a steal)
  function another() {
    const s = S(), now = Date.now();
    if (now < s.anotherAt) { toast(`Your agent's still looking: ${duration(s.anotherAt - now)}`); return false; }
    newListing(now);
    s.anotherAt = now + ANOTHER_WAIT * 1000;
    dirty = true;
    return true;
  }

  // ---------------------------------------------------------------
  // Buying
  // ---------------------------------------------------------------
  function buy(mortgage) {
    const s = S(), l = s.listing;
    if (!l) return false;
    const cash = cashNeeded(l, mortgage);
    if (cash > state.cash) { toast(mortgage ? "Not enough cash for the down payment" : "Not enough cash to buy it outright"); return false; }
    const p = { id: s.nextId++, type: l.type, name: l.name, city: l.city, cond: l.cond,
      loan: mortgage ? loanFor(l) : null, invested: cash, fixing: null, selling: null };
    state.cash -= cash;
    s.props.push(p);
    s.bought++;
    newListing();
    toast(mortgage ? `You bought ${p.name} with a mortgage: ${money(p.loan.pay)}/sec to the bank` : `You bought ${p.name} outright`);
    dirty = true;
    return true;
  }

  // ---------------------------------------------------------------
  // The mortgage over time
  // ---------------------------------------------------------------
  // Pay the bank for a stretch `seconds` long. The balance B follows
  //   dB/dt = -(pay - rate * B)       (payment minus the interest)
  // whose exact answer is B(t) = k + (B0 - k) * e^(rate t), k = pay/rate.
  // That works out a long time away in one go, exactly, and stops
  // charging the moment the loan hits zero. Returns the cash paid.
  function payMortgage(p, seconds) {
    const L = p.loan;
    if (!L || L.balance <= 0 || seconds <= 0) return 0;
    const k = L.pay / L.rate;                               // balance where interest alone would eat the payment
    const tZero = Math.log(k / (k - L.balance)) / L.rate;   // seconds until it's paid off
    const t = Math.min(seconds, tZero);
    const after = t >= tZero ? 0 : Math.max(0, k + (L.balance - k) * Math.exp(L.rate * t));
    p.invested += L.balance - after;                        // the part of the payments that bought you the house
    L.balance = after;
    if (after === 0) { p.loan = null; toast(`${p.name} is paid off. All the rent is yours now.`); }
    return L.pay * t;
  }
  // Rent in (counts as earnings), mortgage payments out.
  // Changed from the WIP: payments never take your cash below zero. What
  // you can't pay is recorded as arrears, and tick() then forecloses. The
  // WIP let cash go negative, which other parts of the game don't expect.
  function earn(seconds) {
    const s = S();
    let rentIn = 0, owed = 0;
    for (const p of s.props) { rentIn += rent(p) * seconds; owed += payMortgage(p, seconds); }
    if (rentIn) addCash(rentIn);
    const paid = Math.min(owed, Math.max(0, state.cash));
    state.cash -= paid;
    if (owed > paid) s.arrears += owed - paid;
    return rentIn - owed;
  }
  // Behind on payments: the bank takes the property that's costing you
  // the most (lowest net rent), sells it fast and cheap, and keeps what
  // it's owed plus the missed payments. Anything left is yours. If it sold
  // for less, the bank takes the loss: no debt follows you around.
  function foreclose() {
    const s = S();
    if (s.arrears <= 0) return false;
    const owing = s.props.filter(p => p.loan);
    if (!owing.length) { s.arrears = 0; return false; }     // loans already paid off: nothing to take
    const p = owing.sort((a, b) => net(a) - net(b))[0];
    const sale = value(p) * FORECLOSE_PRICE;
    const left = Math.max(0, sale - p.loan.balance - s.arrears);
    state.cash += left;
    s.arrears = 0;
    s.props = s.props.filter(x => x !== p);
    s.foreclosed++;
    s.profit += left - p.invested;
    showModal("Foreclosed", `You ran out of cash for the mortgage payments, so the bank took ${p.name} and sold it fast. ` +
      (left > 0 ? "After paying off the loan and the missed payments, this was left for you." : "It didn't even cover what you owed. The bank ate the difference."),
      "+" + money(left));
    dirty = true;
    return true;
  }
  function payOff(id) {
    const p = findProp(id);
    if (!p || !p.loan) return false;
    if (p.loan.balance > state.cash) { toast("Not enough cash to pay it all off"); return false; }
    state.cash -= p.loan.balance;
    p.invested += p.loan.balance;
    p.loan = null;
    toast(`${p.name} is paid off. All the rent is yours now.`);
    dirty = true;
    return true;
  }

  // ---------------------------------------------------------------
  // Renovating and selling
  // ---------------------------------------------------------------
  function renovate(id) {
    const p = findProp(id);
    if (!p || p.cond >= TOP || p.fixing) return false;
    if (p.selling) { toast("Take it off the market first"); return false; }
    const cost = renovateCost(p);
    if (cost > state.cash) { toast("Not enough cash for the renovation"); return false; }
    state.cash -= cost;
    p.invested += cost;
    p.fixing = { until: Date.now() + renovateSeconds(p) * 1000 };
    toast(`Renovating ${p.name}: done in ${duration(renovateSeconds(p) * 1000)}`);
    dirty = true;
    return true;
  }
  function list(id) {
    const p = findProp(id);
    if (!p || p.selling) return false;
    if (p.fixing) { toast("Finish the renovation first"); return false; }
    p.selling = { until: Date.now() + sellSeconds(p) * 1000 };
    toast(`${p.name} is on the market: a buyer in about ${duration(sellSeconds(p) * 1000)}`);
    dirty = true;
    return true;
  }
  function unlist(id) {
    const p = findProp(id);
    if (!p || !p.selling) return false;
    p.selling = null;
    dirty = true;
    return true;
  }
  // Close a sale at `salePrice` (after fees). The bank is paid first.
  // Changed from the WIP: if the sale doesn't cover the loan (the market
  // fell) and you can't cover the rest, it's a "short sale": the bank
  // takes what there is. Before, your cash could go negative.
  function closeSale(p, salePrice = value(p) * (1 - SELL_COSTS)) {
    const s = S();
    const owed = p.loan ? p.loan.balance : 0;
    const cashBefore = state.cash;
    const netIn = Math.max(salePrice - owed, -cashBefore);     // never below zero cash
    const short = salePrice - owed < -cashBefore;
    const toBank = short ? salePrice + cashBefore : owed;      // in a short sale the bank gets all there is
    state.cash += netIn;
    const profit = netIn - p.invested;
    if (profit > 0) { state.earnedRun += profit; state.earnedAll += profit; }  // only profit counts as earnings
    s.props = s.props.filter(x => x !== p);
    s.sold++;
    s.profit += profit;
    showModal(short ? "Short sale" : "Sold!", `${p.name} sold for ${money(salePrice)} after fees` +
      (owed ? `, and ${money(toBank)} went to the bank for the mortgage` : "") +
      (short ? ". It didn't cover the loan, so the bank took the loss on the rest" : "") +
      `. You'd put ${money(p.invested)} into it, so that's a ${profit >= 0 ? "profit" : "loss"} of ${money(Math.abs(profit))}.`,
      (netIn >= 0 ? "+" : "") + money(netIn));
    dirty = true;
  }

  // ---------------------------------------------------------------
  // Every frame, and after time away
  // ---------------------------------------------------------------
  function tick(now) {
    const s = S();
    stepMarket(now);
    if (s.arrears > 0 && !modalOpen()) foreclose();         // one at a time, so each gets its own note
    for (const p of [...s.props]) {
      if (p.fixing && now >= p.fixing.until) {
        p.fixing = null;
        p.cond = Math.min(TOP, p.cond + 1);
        toast(`${p.name} is now ${CONDITIONS[p.cond].name.toLowerCase()}: higher rent, higher value`);
        dirty = true;
      }
      if (p.selling && now >= p.selling.until && !modalOpen()) closeSale(p);
    }
    // a new listing when it's due, but only once real estate is open
    if (tierUnlocked() >= 1 && (!s.listing || now >= s.listingAt)) newListing(now);
  }

  // The tenant's offer event (only offered when you own a property that
  // isn't already being sold or renovated)
  function tenantOffer() {
    const ok = S().props.filter(p => !p.fixing);
    if (!ok.length) return null;
    const p = pick(ok), id = p.id;
    const offer = value(p) * (1.05 + Math.random() * 0.15);
    return { title: "Tenant's offer", text: `Your tenant at ${p.name} loves the place and offers ${money(offer)} for it, no agent fees. It's worth about ${money(value(p))} on today's market.`,
      options: [
        { label: `Sell for ${money(offer)}`, yes: true, act: () => {
            // Look it up again by id: it may have been sold meanwhile, and
            // after a reload it's a different object (the WIP compared objects).
            const q = findProp(id);
            if (!q) { toast("You don't own it any more"); return; }
            if (q.fixing) { toast("It's being renovated: the tenant will wait"); return; }
            closeSale(q, offer); } },
        { label: "Keep it", act: () => {} },
      ] };
  }

  // ---------------------------------------------------------------
  // The card on the Invest tab
  // ---------------------------------------------------------------
  // Built once (and again whenever the list of what you own changes),
  // then its numbers are updated every frame.
  let builtKey = "";
  const ownKey = () => S().props.map(p => [p.id, p.cond, !!p.loan, !!p.fixing, !!p.selling].join(":")).join(",") + "|" + (S().listing ? S().listing.key : "");
  const pctText = c => `${c >= 0 ? "▲" : "▼"} ${Math.abs(c * 100).toFixed(1)}%`;

  function build(card) {
    const s = S();
    card.innerHTML = `
      <div class="re-head"><h2 class="cond">Real estate</h2>
        <span class="re-mkt"><span class="re-mval"></span>
          <svg class="re-spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke-width="2"/></svg></span></div>
      <p class="note re-sum"></p>
      <div class="re-sect">For sale</div>
      <div class="re-listing"></div>
      <div class="re-sect">Your properties</div>
      <div class="re-props"></div>`;
    // --- the one listing: pass, buy with cash, or buy with a mortgage ---
    const lbox = card.querySelector(".re-listing");
    const l = s.listing;
    if (!l) lbox.innerHTML = `<p class="note">Nothing for sale right now. Your agent's looking.</p>`;
    else {
      const t = TYPE[l.type], c = CONDITIONS[l.cond], r = dealRating(l);
      lbox.innerHTML = `<div class="biz" id="re-listing">
        <div class="logo" style="background:#8a5a44;border-radius:10px">${esc(initials(t.name))}</div>
        <div><h3 class="cond">${esc(l.name)}</h3><div class="sub">${esc(t.name)} · ${esc(l.city)}</div></div>
        <button class="buy" id="re-cash"><span class="pr"></span><small>buy outright</small></button>
        <div class="chips"><span class="chip ${c.tone}">${c.name}</span><span class="chip ${r.tone}">${r.text}</span></div>
        <div class="line l1"></div><div class="line l2"></div>
        <div class="acts"><button class="smallbtn" id="re-mort"></button><button class="smallbtn" id="re-next">Show me another</button></div></div>`;
      lbox.querySelector("#re-cash").addEventListener("click", () => { buy(false); render(true); });
      lbox.querySelector("#re-mort").addEventListener("click", () => { buy(true); render(true); });
      lbox.querySelector("#re-next").addEventListener("click", () => { another(); render(true); });
    }
    // --- what you own ---
    const own = card.querySelector(".re-props");
    if (!s.props.length) own.innerHTML = `<p class="note">You don't own any property yet. Rent pays you every second, and a mortgage lets you buy one with 20% down.</p>`;
    for (const p of s.props) {
      const t = TYPE[p.type], c = CONDITIONS[p.cond];
      const row = document.createElement("div");
      row.className = "biz"; row.dataset.id = p.id;
      row.innerHTML = `<div class="logo" style="background:#8a5a44;border-radius:10px">${esc(initials(t.name))}</div>
        <div><h3 class="cond">${esc(p.name)}</h3><div class="sub">${esc(t.name)} · ${esc(p.city)}</div></div>
        <button class="buy" id="re-reno-${p.id}"><span class="pr"></span><small>${p.cond >= TOP ? "fully renovated" : p.fixing ? "renovating" : "renovate"}</small></button>
        <div class="chips"><span class="chip ${c.tone}">${c.name}</span>${p.loan ? `<span class="chip">Mortgage</span>` : `<span class="chip good">Owned outright</span>`}${p.selling ? `<span class="chip great">For sale</span>` : ""}<span class="chip bad re-neg" hidden>Losing money</span></div>
        <div class="line l1"></div><div class="line l2"></div>
        <div class="acts">${p.selling ? `<button class="smallbtn" id="re-unl-${p.id}">Take off the market</button>` : `<button class="smallbtn" id="re-sell-${p.id}">Sell</button>`}${p.loan ? `<button class="smallbtn" id="re-pay-${p.id}"></button>` : ""}</div>`;
      row.querySelector(".buy").addEventListener("click", () => { renovate(p.id); render(true); });
      // selling is a big step: two presses, like retiring
      row.querySelector(`#re-sell-${p.id}`)?.addEventListener("click", e => armOrRun(e.currentTarget, "Tap again to list it", () => list(p.id)));
      row.querySelector(`#re-unl-${p.id}`)?.addEventListener("click", () => { unlist(p.id); render(true); });
      row.querySelector(`#re-pay-${p.id}`)?.addEventListener("click", () => { payOff(p.id); render(true); });
      own.appendChild(row);
    }
  }

  function draw(card, full) {
    if (!card.querySelector(".re-head") || ownKey() !== builtKey) { builtKey = ownKey(); build(card); }
    const s = S(), now = Date.now(), m = s.market, h = m.hist;
    // market: value, change over the last 10 minutes, sparkline
    const back = h[Math.max(0, h.length - 11)], change = m.value / back - 1;
    card.querySelector(".re-mval").innerHTML = `Market ${m.value.toFixed(2)}x <small class="${change >= 0 ? "re-up" : "re-down"}">${pctText(change)}</small>`;
    if (full) {
      const lo = Math.min(...h), hi = Math.max(...h), span = hi - lo || 1;
      const line = card.querySelector(".re-spark polyline");
      line.setAttribute("points", h.map((v, i) => `${(h.length === 1 ? 120 : i / (h.length - 1) * 120).toFixed(1)},${(28 - (v - lo) / span * 26).toFixed(1)}`).join(" "));
      line.setAttribute("stroke", change >= 0 ? "var(--money)" : "var(--loss)");
    }
    const r = totalRent(), pay = totalPay();
    card.querySelector(".re-sum").textContent = s.props.length
      ? `Rent ${money(r)}/sec` + (pay ? ` · mortgages ${money(pay)}/sec · net ${money(r - pay)}/sec` : "") + `. Next market move in ${duration(Math.max(0, m.nextAt - now))}.`
      : `Rents and values follow the market. It drifts up over time, with swings. Next move in ${duration(Math.max(0, m.nextAt - now))}.`;
    // the listing
    const l = s.listing, lrow = card.querySelector("#re-listing");
    if (l && lrow) {
      const pr = price(l), all = cashNeeded(l, false), down = cashNeeded(l, true), rn = rent(l), loan = loanFor(l);
      lrow.classList.toggle("affordable", down <= state.cash);
      const cb = lrow.querySelector("#re-cash");
      cb.setAttribute("aria-disabled", String(all > state.cash));
      cb.querySelector(".pr").textContent = money(all);
      const mb = lrow.querySelector("#re-mort");
      mb.textContent = `Mortgage: ${money(down)} down`;
      mb.setAttribute("aria-disabled", String(down > state.cash));
      const nb = lrow.querySelector("#re-next");
      nb.setAttribute("aria-disabled", String(now < s.anotherAt));
      nb.textContent = now < s.anotherAt ? `Another in ${duration(s.anotherAt - now)}` : "Show me another";
      lrow.querySelector(".l1").textContent = `Price ${money(pr)} · rents ${money(rn)}/sec · pays back in ${duration(pr / rn * 1000)}`;
      // Overpaying for a renovated place can make the payment bigger than
      // the rent: say so plainly, since that's how foreclosures start.
      const left = rn - loan.pay;
      const l2 = lrow.querySelector(".l2");
      l2.textContent = left >= 0 ? `Mortgage: ${money(loan.pay)}/sec to the bank, ${money(left)}/sec left over`
        : `Mortgage: ${money(loan.pay)}/sec to the bank. That's more than the rent: you'd lose ${money(-left)}/sec`;
      l2.classList.toggle("re-down", left < 0);
    }
    // what you own
    for (const row of card.querySelectorAll(".re-props .biz")) {
      const p = findProp(Number(row.dataset.id));
      if (!p) continue;
      const rc = renovateCost(p);
      const canReno = p.cond < TOP && !p.fixing && !p.selling && rc <= state.cash;
      row.classList.toggle("affordable", canReno);
      const btn = row.querySelector(".buy");
      btn.setAttribute("aria-disabled", String(!canReno));
      btn.querySelector(".pr").textContent = p.cond >= TOP ? "★" : p.fixing ? duration(p.fixing.until - now) : money(rc);
      const n = net(p);
      row.querySelector(".re-neg").hidden = n >= 0;
      row.querySelector(".l1").textContent = `Rent ${money(rent(p))}/sec` + (p.loan ? ` · mortgage ${money(payment(p))}/sec · net ${money(n)}/sec` : "");
      row.querySelector(".l2").textContent = `Worth ${money(value(p))}` + (p.loan ? ` · you owe ${money(p.loan.balance)}` : "") +
        (p.selling ? ` · buyer in ${duration(p.selling.until - now)}` : ` · selling now nets ${money(proceeds(p))}`);
      const po = row.querySelector(`#re-pay-${p.id}`);
      if (po) { po.textContent = `Pay off loan · ${money(p.loan.balance)}`; po.setAttribute("aria-disabled", String(p.loan.balance > state.cash)); }
    }
  }

  // A few styles for the card, added once. (The module keeps its own
  // styles here so it doesn't need to edit the shared stylesheet.)
  const style = document.createElement("style");
  style.textContent = `
    .re-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .re-mkt { display: flex; align-items: center; gap: 8px; font: 600 15px var(--mono); }
    .re-spark { width: 120px; height: 30px; display: block; }
    .re-up { color: var(--money); } .re-down { color: var(--loss); }
    .re-sect { font: 700 13px var(--body); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 4px 2px 0; }
    .re-listing, .re-props { display: grid; gap: 8px; }`;
  document.head.appendChild(style);

  registerInvestment({
    id: ID, name: "Real estate", order: 10, unlockTier: 1,
    fresh, validate, earn, tick,
    netIncome: () => totalRent() - totalPay(),
    render: draw,
    // only when there's a property the tenant could buy (not mid-renovation)
    events: () => (S().props.some(p => !p.fixing) ? [tenantOffer] : []),
    stats: () => {
      const s = S();
      if (!s.bought) return [];
      return [["Properties", `${s.props.length} owned · ${s.bought} bought · ${s.sold} sold` + (s.foreclosed ? ` · ${s.foreclosed} foreclosed` : "")],
              ["Property market", mkt().toFixed(2) + "x"], ["Profit from property sales", money(s.profit)]];
    },
    // Handles for tests/invest_real_estate.py: T.invTests["real-estate"]
    test: { TYPE, CONDITIONS, RENT_PAYBACK, value, price, rent, payment, net, proceeds, cashNeeded, loanFor, renovateCost,
            makeListing, newListing, another, buy, payMortgage, earn, foreclose, payOff, renovate, list, unlist, closeSale,
            stepMarket, tick, tenantOffer, validate, fresh },
  });
})();
