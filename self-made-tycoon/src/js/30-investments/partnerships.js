/* =====================================================================
   INVESTMENT: PARTNERSHIPS AND PRIVATE EQUITY
   Team up with a private equity fund and other partners to buy a big
   company together, help grow it, and cash out when it's sold.

   How it plays (one card, one decision):
     - One deal is on offer at a time: a made-up fund, the company it
       wants to buy, its plan for it, and how much your share costs.
     - The fund's TRACK RECORD is shown up front, like in real life:
       a proven fund is safer, a first-time fund is a wilder ride.
     - Decide: JOIN THE DEAL or PASS.
     - Once you're in, your money is locked up for PE.holdMin..holdMax
       real minutes while the partners work on the company. The card
       shows what your share is worth along the way (it wobbles).
     - When the company sells, you get your share of the sale price.

   The odds (hidden, rolled when you join): each fund type has a chance
   of the deal going bad (you get back PE.badMult, 25%) and otherwise a
   range of returns. Expected return: proven ~1.7x, steady ~1.45x,
   first-time ~1.7x but with a 1 in 5 chance of losing most of it.
   A share is about PE.shareSeconds (10 minutes) of your income and is
   tied up about 25 minutes, so a steady player in deals all the time
   earns roughly 20% more than from businesses alone: worth doing, not
   a replacement for building your empire.

   Money rules: your share leaves your cash when you join. At the exit,
   only the PROFIT counts as earned (see addProceeds in 06-fixsell.js).
   ===================================================================== */
(() => {
  // ---------- Tuning ----------
  const PE = {
    shareSeconds: 600,       // your share costs about 10 minutes of your steady income...
    shareFloor: 0.2,         // ...but at least 20% of your current tier's unlock amount
    holdMin: 20 * 60,        // seconds your money is locked up
    holdMax: 30 * 60,
    nextOffer: 60,           // seconds until a new deal after you pass or cash out
    staleAfter: 360,         // an offer you leave alone is replaced after 6 minutes
    badMult: 0.25,           // a deal gone bad returns this much
    addOnShare: 0.25,        // "capital call" event: put in 25% more...
    addOnBoost: 0.15,        // ...and the whole deal's return goes up by 0.15x
  };
  // Fund types. bad = chance the deal goes bad; otherwise the return is
  // somewhere between lo and hi (even odds across the range).
  const FUNDS = [
    { name: "Proven fund",     weight: 0.3, bad: 0.05, lo: 1.3, hi: 2.3, tone: "good", says: "Every deal in their last fund made money." },
    { name: "Steady fund",     weight: 0.5, bad: 0.08, lo: 1.1, hi: 2.0, tone: "",     says: "A long, solid track record. Few surprises." },
    { name: "First-time fund", weight: 0.2, bad: 0.20, lo: 0.9, hi: 3.2, tone: "bad",  says: "Big promises, no track record yet." },
  ];
  // The partners' plan for the company (flavor; every plan is equally good)
  const PLANS = ["Buy up smaller rivals and merge them in", "Cut waste and fix the books", "Open in new cities",
                 "Bring in a new CEO", "Sell off the weak divisions", "Modernize everything and raise prices"];
  // Made-up fund names, built from the game's generic surname list
  const fundName = () => pick([
    () => `${pick(NAME_PARTS.surname)} & ${pick(NAME_PARTS.surname)} Capital`,
    () => `${pick(NAME_PARTS.surname)} Equity Group`,
    () => `${pick(NAME_PARTS.surname)} Partners`,
  ])();

  // ---------- Helpers ----------
  const me = () => inv("partnerships");
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  const rand = (a, b) => a + Math.random() * (b - a);
  function weighted(weights) {
    let roll = Math.random() * weights.reduce((a, w) => a + w, 0);
    for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll < 0) return i; }
    return weights.length - 1;
  }

  // A new deal: a big company from tier 3 up (or your top tier, if higher),
  // sized to your income.
  function makeOffer() {
    const top = tierUnlocked();
    const kinds = INDUSTRIES.filter(i => i.tier >= 3 && i.tier <= Math.max(3, top));
    const ind = pick(kinds);
    const share = roundNice(Math.max(TIERS[top].unlock * PE.shareFloor, 1000, baseIncome() * PE.shareSeconds * rand(0.8, 1.2)));
    // The whole company is worth many times a single business of its kind
    const worth = ind.cost * rand(30, 80);
    return {
      key: Math.random().toString(36).slice(2, 9),
      company: makeName(ind), ind: ind.id, fund: fundName(), fq: weighted(FUNDS.map(f => f.weight)),
      plan: Math.floor(Math.random() * PLANS.length), share,
      pct: Math.max(0.1, Math.round(share / worth * 1000) / 10),     // your % of the company (flavor)
      madeAt: Date.now(),
    };
  }
  // Roll how a deal turns out, from its fund type
  function rollMult(fq) {
    const f = FUNDS[fq];
    return Math.random() < f.bad ? PE.badMult : Math.round(rand(f.lo, f.hi) * 100) / 100;
  }
  // What your share is "marked at" partway through: it drifts from what
  // you put in toward the final result, with a small wobble, the way a
  // fund's quarterly reports do. (So a deal going bad shows up as a slide.)
  function markValue(d, now = Date.now()) {
    const t = Math.min(1, Math.max(0, (now - d.startAt) / (d.endsAt - d.startAt)));
    const ease = t * t * (3 - 2 * t);                                   // slow start, slow finish
    const wobble = 1 + 0.04 * Math.sin(now / 9000 + d.startAt % 97) * (1 - t);
    return d.invested * (1 + (d.mult - 1) * ease) * wobble;
  }

  // ---------- The one decision: join or pass ----------
  function join() {
    const s = me(), o = s.offer;
    if (!o) return false;
    if (s.deal) { toast("You're already in a deal. Wait for it to sell."); return false; }
    if (o.share > state.cash) { toast("Not enough cash for your share"); return false; }
    state.cash -= o.share;
    const now = Date.now();
    s.deal = Object.assign({}, o, { invested: o.share, mult: rollMult(o.fq), startAt: now,
                                    endsAt: now + rand(PE.holdMin, PE.holdMax) * 1000, addOn: false });
    s.offer = null;
    s.record.joined++;
    toast(`You're a partner in ${o.company}. The fund plans to sell it in about ${Math.round((PE.holdMin + PE.holdMax) / 120)} minutes.`);
    dirty = true; render(true);
    return true;
  }
  function pass() {
    const s = me();
    if (!s.offer) return false;
    s.offer = null;
    s.nextOfferAt = Date.now() + PE.nextOffer * 1000;
    dirty = true; render(true);
    return true;
  }

  // ---------- The exit ----------
  const news = [];             // exit pop-ups waiting for the screen to be free (not saved: the money is already paid)
  function exitDeal(force) {
    const s = me(), d = s.deal;
    if (!d) return null;
    if (force !== undefined) d.mult = force;           // tests only
    const pay = d.invested * d.mult;
    addProceeds(pay, d.invested);
    s.deal = null;
    s.nextOfferAt = Date.now() + PE.nextOffer * 1000;
    s.record.exits++;
    s.record.profit += pay - d.invested;
    s.record.best = Math.max(s.record.best, d.mult);
    s.last = { company: d.company, invested: d.invested, mult: d.mult };
    const good = d.mult >= 1;
    news.push({ title: good ? "Deal closed!" : "Deal went badly",
      text: good ? `The partners sold ${d.company} to a bigger company. Your ${money(d.invested)} share came back as ${money(pay)} (${d.mult}x).`
                 : `${d.company} struggled and was sold off cheap. You got back ${money(pay)} of your ${money(d.invested)}. That's the risk of a buyout.`,
      amount: (good ? "+" : "") + money(pay) });
    dirty = true;
    return { mult: d.mult, pay };
  }

  // ---------- Event: a capital call ----------
  // The partners want more money to buy a rival. Putting it in makes the
  // whole deal a bit better; saying no is always safe.
  function capitalCallEvent() {
    const d = me().deal, now = Date.now();
    if (!d || d.addOn || now > d.startAt + (d.endsAt - d.startAt) * 0.7) return [];
    return [() => {
      const extra = roundNice(d.invested * PE.addOnShare);
      return { title: "Capital call", text: `The ${d.fund} partners found a rival to buy and fold into ${d.company}. ` +
          `They're asking every partner for 25% more. Put in ${money(extra)}?`,
        options: [
          { label: `Put in ${money(extra)}`, yes: true, act: () => {
              const cur = me().deal;
              if (cur !== d) { toast("That deal already closed"); return; }
              if (d.addOn) return;                     // already answered (stops a double press paying twice)
              if (state.cash < extra) { toast("Not enough cash: you sat this one out"); return; }
              state.cash -= extra;
              d.invested += extra; d.addOn = true; d.mult = Math.round((d.mult + PE.addOnBoost) * 100) / 100;
              toast(`You put in ${money(extra)}. ${d.company} just got bigger.`); } },
          { label: "Sit it out", act: () => { if (me().deal === d) d.addOn = true; } },
        ] };
    }];
  }

  // ---------- Drawing the card ----------
  let drawnKey = "", drawnCard = null;
  function structure() {
    const s = me(), o = s.offer, d = s.deal;
    let html = `<h2 class="cond">Partnerships and private equity</h2>
      <p class="note">Go in with a buyout fund and other partners on a big company. Your money is locked up while they grow it, then you share in the sale.</p>`;
    if (d) {
      const f = FUNDS[d.fq];
      html += `<div class="biz" id="pe-deal">${logoHtml(d.company, IND[d.ind].sector)}
          <div><h3 class="cond">${esc(d.company)}</h3><div class="sub">${esc(IND[d.ind].name)} · with ${esc(d.fund)} · you own ${d.pct}%</div></div>
          <div class="chips"><span class="chip ${f.tone}">${f.name}</span><span class="chip">Plan: ${esc(PLANS[d.plan])}</span>${d.addOn && d.invested > d.share ? `<span class="chip good">Bought a rival</span>` : ""}</div>
          <div class="line" id="pe-mark"></div></div>`;
    } else if (o) {
      const f = FUNDS[o.fq];
      html += `<div class="biz" id="pe-offer">${logoHtml(o.company, IND[o.ind].sector)}
          <div><h3 class="cond">${esc(o.company)}</h3><div class="sub">${esc(IND[o.ind].name)} · led by ${esc(o.fund)}</div></div>
          <button class="buy" id="pe-join"><span class="pr">${money(o.share)}</span><small>join for ${o.pct}%</small></button>
          <div class="chips"><span class="chip ${f.tone}">${f.name}: ${esc(f.says)}</span></div>
          <div class="line">Plan: ${esc(PLANS[o.plan])} · sells in about ${Math.round((PE.holdMin + PE.holdMax) / 120)} min</div>
          <div class="acts"><button class="smallbtn" id="pe-pass">Pass</button></div></div>`;
    } else html += `<p class="note" id="pe-wait"></p>`;
    if (s.last) html += `<p class="note">Last deal: ${esc(s.last.company)} <strong style="color:var(${s.last.mult >= 1 ? "--money" : "--loss"})">${s.last.mult}x</strong> on ${money(s.last.invested)}</p>`;
    return html;
  }
  function drawCard(card, full) {
    if (full) {
      const html = structure();
      // Also redraw when the host hands us a brand-new, empty card (it
      // rebuilds every card when another investment unlocks).
      if (html !== drawnKey || card !== drawnCard) {
        drawnKey = html; drawnCard = card;
        const focusId = document.activeElement?.id;
        card.innerHTML = html;
        card.querySelector("#pe-join")?.addEventListener("click", join);
        card.querySelector("#pe-pass")?.addEventListener("click", pass);
        if (focusId && card.querySelector("#" + focusId)) $(focusId).focus();
      }
    }
    const s = me(), now = Date.now();
    const btn = card.querySelector("#pe-join");
    if (btn && s.offer) {
      const can = s.offer.share <= state.cash;
      btn.setAttribute("aria-disabled", String(!can));
      card.querySelector("#pe-offer").classList.toggle("affordable", can);
    }
    const mark = card.querySelector("#pe-mark");
    if (mark && s.deal) {
      const v = markValue(s.deal, now), left = s.deal.endsAt - now;
      mark.textContent = `Your ${money(s.deal.invested)} is worth about ${money(v)} (${(v / s.deal.invested).toFixed(2)}x) · ` +
        (left > 0 ? `sale in ${duration(left + 999)}` : "closing the sale...");
    }
    const wait = card.querySelector("#pe-wait");
    if (wait) wait.textContent = `The next deal comes your way in ${duration(Math.max(0, s.nextOfferAt - now) + 999)}.`;
  }

  // ---------- Register ----------
  const fresh = () => ({ offer: null, nextOfferAt: 0, deal: null, last: null, record: { joined: 0, exits: 0, best: 0, profit: 0 } });
  // Clean one saved offer or deal (null if it's broken)
  function cleanOffer(o) {
    if (!o || typeof o !== "object" || !IND[o.ind] || !Number.isFinite(o.share) || o.share <= 0) return null;
    return { key: String(o.key || "o"), company: String(o.company || IND[o.ind].name), ind: o.ind, fund: String(o.fund || "The fund"),
      fq: FUNDS[o.fq] ? o.fq : 1, plan: PLANS[o.plan] ? o.plan : 0, share: o.share, pct: Math.max(0.1, num(o.pct, 1)),
      madeAt: num(o.madeAt, Date.now()) };
  }
  registerInvestment({
    id: "partnerships", name: "Partnerships and private equity", order: 80, unlockTier: 3,
    fresh,
    validate(saved) {
      const out = fresh();
      out.offer = cleanOffer(saved.offer);
      out.nextOfferAt = Math.max(0, num(saved.nextOfferAt));
      const d = cleanOffer(saved.deal);
      if (d && Number.isFinite(saved.deal.mult) && Number.isFinite(saved.deal.startAt) && Number.isFinite(saved.deal.endsAt)) {
        out.deal = Object.assign(d, { invested: Math.max(d.share, num(saved.deal.invested, d.share)),
          mult: Math.min(5, Math.max(0, saved.deal.mult)), startAt: saved.deal.startAt,
          endsAt: Math.max(saved.deal.startAt + 1000, saved.deal.endsAt), addOn: !!saved.deal.addOn });
      }
      if (saved.last && Number.isFinite(saved.last.mult)) out.last = { company: String(saved.last.company || ""), invested: num(saved.last.invested), mult: saved.last.mult };
      for (const k in out.record) out.record[k] = num(saved.record?.[k]);
      return out;
    },
    tick(now) {
      if (!investUnlocked(this)) return;
      const s = me();
      if (news.length && !modalOpen()) { const n = news.shift(); showModal(n.title, n.text, n.amount); }   // shown a tick later (see startups.js)
      if (s.deal && now >= s.deal.endsAt) exitDeal();
      if (s.offer && now - s.offer.madeAt > PE.staleAfter * 1000) { s.offer = null; s.nextOfferAt = now; }
      if (!s.deal && !s.offer && now >= s.nextOfferAt) { s.offer = makeOffer(); dirty = true; }
    },
    render: drawCard,
    events: capitalCallEvent,
    stats() {
      const r = me().record;
      if (!r.joined) return [];
      return [["Buyout deals joined", r.joined], ["Deals sold", r.exits + (r.exits ? ` (best ${r.best}x)` : "")], ["Profit from deals", money(r.profit)]];
    },
    test: { PE, FUNDS, makeOffer, rollMult, markValue, join, pass, exitDeal, capitalCallEvent, news },
  });
})();
