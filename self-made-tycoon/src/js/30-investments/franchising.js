/* =====================================================================
   INVESTMENT: FRANCHISING
   Turn one of your businesses that's doing well into a franchise BRAND.
   Other people (franchisees) then pay to open their own locations under
   your name, and every location sends you a royalty.

   How it plays (one card, one decision):
     - The card lists your businesses that are ready to franchise: at
       least level FR.minLevel (the concept is proven) with no problems
       (nobody buys a franchise with bad reviews or messy books), in a
       kind of business that really gets franchised (diners and car
       washes do; hospitals and airlines don't).
     - Decide: LAUNCH THE BRAND. You pay once for the lawyers, the
       operations manual and training.
     - Franchisees then open locations by themselves, one every
       FR.openSeconds() (faster for small businesses). Each opening pays
       you a franchise fee, and each open location pays a royalty every
       second, forever.
     - How big the brand can grow depends on the flagship: FR.capPerLevel
       locations per level of the business you franchised. Expanding the
       flagship lets the brand grow further.

   The real-world numbers behind it: a royalty is usually around 6% of a
   franchisee's sales, which is roughly a third of what a small business
   keeps as profit. So each location pays you FR.royaltyShare (30%) of
   what a plain level-1 business of that kind earns.

   Pacing: the launch cost is set so a brand at its starting size pays
   for itself in about FR.paybackSeconds (50 minutes). That's in line with
   expanding a business at mid levels, but franchising keeps growing on
   its own while you do other things.

   If you sell the flagship, the brand stays yours (you own the name,
   not the store), but it can't grow past the size it had reached.
   ===================================================================== */
(() => {
  // ---------- Tuning ----------
  const FR = {
    minLevel: 10,            // a business must reach its first doubling to be franchised
    capPerLevel: 3,          // locations the brand can reach per flagship level...
    maxCap: 300,             // ...up to this many
    royaltyShare: 0.3,       // each location pays 30% of a plain level-1 unit's income
    paybackSeconds: 3000,    // launch cost = this many seconds of royalties at the starting cap
    feeSeconds: 120,         // each opening pays a fee worth 2 minutes of its royalty
    // Seconds between openings: a thirtieth of the tier's payback time,
    // kept between 20 seconds and 2 minutes.
    openSeconds: tier => Math.min(120, Math.max(20, TIER_PAYBACK[tier] / 30)),
    rogueSeconds: 180,       // "rogue franchisee" event: enforcing costs 3 minutes of the brand's royalties
    rogueClose: 0.2,         // ignoring it closes 20% of locations...
    roguePause: 600,         // ...and stops new openings for 10 minutes
  };
  // Kinds of business that really get franchised (ids from INDUSTRIES)
  const FRANCHISABLE = new Set(["lawn", "detail", "phonefix", "foodtruck", "laundry", "coffee", "diner", "carwash", "garage",
                                "gym", "hvac", "hardware", "grocery", "insure", "hotel", "storage"]);

  // ---------- Helpers ----------
  const me = () => inv("franchising");
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  // Royalty one open location pays per second. Your income upgrades and
  // Legacy stars count, the same way they do for your own businesses.
  const royaltyPer = indId => IND[indId].income * FR.royaltyShare * sectorMult(IND[indId].sector) * globalMult();
  const brandIncome = br => br.locs * royaltyPer(br.ind);
  const startCap = b => Math.min(FR.maxCap, b.level * FR.capPerLevel);
  // Launch cost: based on the base income (no upgrades), so buying an
  // upgrade doesn't make launching pricier.
  const launchCost = b => roundNice(IND[b.ind].income * FR.royaltyShare * startCap(b) * FR.paybackSeconds);
  const hasBrand = indId => me().brands.some(br => br.ind === indId);
  // Why business b can't be franchised yet ("" = it can)
  function notReady(b) {
    if (!FRANCHISABLE.has(b.ind)) return "not a franchise kind of business";
    if (hasBrand(b.ind)) return "you already franchise this kind";
    if (b.level < FR.minLevel) return `needs level ${FR.minLevel}`;
    if (problemsOf(b).length) return "fix its problems first";
    if (b.selling) return "it's up for sale";
    return "";
  }
  // Businesses ready to franchise, best first (biggest brand you could make)
  const ready = () => state.biz.filter(b => !notReady(b)).sort((a, b) => launchCost(b) - launchCost(a));
  // A brand's cap follows its flagship while you still own it
  function capOf(br) {
    const flag = state.biz.find(b => b.id === br.flagId);
    if (flag) br.cap = Math.max(br.cap, startCap(flag));
    return br.cap;
  }

  // ---------- The one decision: launch a brand ----------
  function launch(bizId) {
    const b = state.biz.find(x => x.id === bizId);
    if (!b || notReady(b)) { toast(b ? `Can't franchise it: ${notReady(b)}` : "You don't own it any more"); return false; }
    const cost = launchCost(b);
    if (cost > state.cash) { toast("Not enough cash to launch the brand"); return false; }
    state.cash -= cost;
    me().brands.push({ flagId: b.id, ind: b.ind, name: b.name, locs: 0, cap: startCap(b), prog: 0, pausedUntil: 0, cost, earned: 0 });
    me().record.launched++;
    toast(`${b.name} is now a franchise brand. The first franchisee opens in ${duration(FR.openSeconds(IND[b.ind].tier) * 1000)}.`);
    dirty = true; render(true);
    return true;
  }

  // ---------- Earning ----------
  // Walk through `seconds` of time for every brand: royalties from the
  // locations open so far, and new locations opening (each with a fee)
  // as their timers fill. Works the same for one frame or 8 hours away.
  function earn(seconds) {
    let total = 0;
    const now = Date.now();
    for (const br of me().brands) {
      const cap = capOf(br), every = FR.openSeconds(IND[br.ind].tier), per = royaltyPer(br.ind);
      // Openings are paused for part of this stretch after a rogue franchisee
      const paused = Math.min(seconds, Math.max(0, (br.pausedUntil - now) / 1000));
      let left = seconds;
      if (paused > 0) { total += br.locs * per * paused; left -= paused; }
      // At most one step per opening, so this loop ends quickly even after 8 hours
      while (left > 0) {
        if (br.locs >= cap) { total += br.locs * per * left; br.prog = 0; break; }
        const step = Math.min(left, every - br.prog);
        total += br.locs * per * step;
        br.prog += step; left -= step;
        if (br.prog >= every - 1e-9) {
          br.prog = 0; br.locs++;
          total += per * FR.feeSeconds;              // the new franchisee's fee
          me().record.opened++;
        }
      }
    }
    if (total > 0) addCash(total);
    return total;
  }
  // Each brand's "earned so far" (for the card's "paid back" chip): the
  // total from earn() is split by each brand's share of royalty income at
  // the start of the stretch. Approximate, which is fine for a progress chip.
  function earnAndTrack(seconds) {
    const before = me().brands.map(br => brandIncome(br));
    const sum = before.reduce((a, x) => a + x, 0);
    const total = earn(seconds);
    me().brands.forEach((br, i) => { br.earned += sum > 0 ? total * before[i] / sum : total / me().brands.length; });
    return total;
  }

  // ---------- Event: a franchisee cutting corners ----------
  // The real headache of franchising: one bad operator can hurt the name.
  function rogueEvent() {
    const big = me().brands.filter(br => br.locs >= 5);
    if (!big.length) return [];
    return [() => {
      const br = pick(big);
      const fixCost = Math.max(100, brandIncome(br) * FR.rogueSeconds);
      const close = Math.max(1, Math.ceil(br.locs * FR.rogueClose));
      return { title: "Franchisee cutting corners", text: `One of your ${br.name} franchisees is skipping your standards and customers are posting about it. ` +
          `Send in a training team for ${money(fixCost)}, or look the other way (about ${close} locations close and new openings stop for ${FR.roguePause / 60} minutes)?`,
        options: [
          { label: `Send the team: ${money(fixCost)}`, yes: true, act: () => {
              if (state.cash < fixCost) { toast("Couldn't afford it: the bad press spread"); hurt(br, close); return; }
              state.cash -= fixCost; toast(`${br.name}'s standards are back on track`); } },
          { label: "Look the other way", act: () => hurt(br, close) },
        ] };
    }];
  }
  function hurt(br, close) {
    if (!me().brands.includes(br)) return;
    br.locs = Math.max(0, br.locs - close);
    br.prog = 0;
    br.pausedUntil = Date.now() + FR.roguePause * 1000;
    me().record.closed += close;
    toast(`${close} ${br.name} location${close > 1 ? "s" : ""} closed. New openings are on hold.`);
  }

  // ---------- Drawing the card ----------
  // Rebuilt only when what's listed changes; numbers update in place.
  let drawnKey = "", drawnCard = null;
  function structure() {
    const s = me();
    let html = `<h2 class="cond">Franchising</h2>
      <p class="note">Turn a business that's doing well into a brand. Franchisees open their own locations and pay you a fee plus a royalty from each one.</p>`;
    for (const br of s.brands) {
      html += `<div class="biz" data-brand="${br.flagId}">${logoHtml(br.name, IND[br.ind].sector)}
          <div><h3 class="cond">${esc(br.name)} franchise</h3><div class="sub">${esc(IND[br.ind].name)} brand · launched for ${money(br.cost)}</div></div>
          <div class="chips"></div><div class="line"></div></div>`;
    }
    const list = ready().slice(0, 3);
    if (list.length) {
      html += `<h3 class="cond" style="margin:4px 0 0">Ready to franchise</h3>`;
      for (const b of list) {
        const cap = startCap(b);
        html += `<div class="biz" data-ready="${b.id}">${logoHtml(b.name, IND[b.ind].sector)}
            <div><h3 class="cond">${esc(b.name)}</h3><div class="sub">${esc(IND[b.ind].name)} · Lv ${b.level} · room for ${cap} locations</div></div>
            <button class="buy" id="fr-launch-${b.id}"><span class="pr">${money(launchCost(b))}</span><small>launch brand</small></button>
            <div class="line"></div></div>`;
      }
    } else {
      html += `<p class="note">${s.brands.length ? "Nothing else is ready yet. " : ""}To franchise a business, get it to level ${FR.minLevel} with no problems.
        Food, services, auto, retail, hotels and storage franchise well; one brand per kind of business.</p>`;
    }
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
        for (const btn of card.querySelectorAll("[id^='fr-launch-']")) btn.addEventListener("click", () => launch(Number(btn.id.slice(10))));
        if (focusId && card.querySelector("#" + focusId)) $(focusId).focus();
      }
    }
    const now = Date.now();
    for (const row of card.querySelectorAll("[data-brand]")) {
      const br = me().brands.find(x => x.flagId === Number(row.dataset.brand));
      if (!br) continue;
      const cap = capOf(br), every = FR.openSeconds(IND[br.ind].tier);
      let next;
      if (now < br.pausedUntil) next = `openings on hold for ${duration(br.pausedUntil - now + 999)}`;
      else if (br.locs >= cap) next = state.biz.some(b => b.id === br.flagId) ? "full: expand the flagship to grow" : "full (you sold the flagship)";
      else next = `next opens in ${duration((every - br.prog) * 1000 + 999)}`;
      row.querySelector(".line").textContent = `${money(brandIncome(br))}/sec in royalties · ${next}`;
      const chips = `<span class="chip ${br.locs ? "good" : ""}">${br.locs} / ${cap} locations</span>` +
        (br.earned >= br.cost ? `<span class="chip great">Paid for itself</span>` : `<span class="chip">${Math.floor(br.earned / br.cost * 100)}% paid back</span>`);
      const box = row.querySelector(".chips");
      if (box.innerHTML !== chips) box.innerHTML = chips;
    }
    for (const row of card.querySelectorAll("[data-ready]")) {
      const b = state.biz.find(x => x.id === Number(row.dataset.ready));
      if (!b) continue;
      const can = launchCost(b) <= state.cash;
      row.classList.toggle("affordable", can);
      row.querySelector(".buy").setAttribute("aria-disabled", String(!can));
      row.querySelector(".line").textContent = `${money(royaltyPer(b.ind) * startCap(b))}/sec in royalties once it's full · a location every ${duration(FR.openSeconds(IND[b.ind].tier) * 1000)}`;
    }
  }

  // ---------- Register ----------
  const fresh = () => ({ brands: [], record: { launched: 0, opened: 0, closed: 0 } });
  registerInvestment({
    id: "franchising", name: "Franchising", order: 60, unlockTier: 2,
    fresh,
    validate(saved) {
      const out = fresh();
      const seen = new Set();
      if (Array.isArray(saved.brands)) for (const br of saved.brands) {
        // one brand per kind of business, and only kinds we know
        if (!br || !IND[br.ind] || !FRANCHISABLE.has(br.ind) || seen.has(br.ind)) continue;
        seen.add(br.ind);
        const cap = Math.min(FR.maxCap, Math.max(1, num(br.cap, FR.minLevel * FR.capPerLevel) | 0));
        out.brands.push({ flagId: num(br.flagId) | 0, ind: br.ind, name: String(br.name || IND[br.ind].name),
          locs: Math.min(cap, Math.max(0, num(br.locs) | 0)), cap, prog: Math.max(0, num(br.prog)),
          pausedUntil: Math.max(0, num(br.pausedUntil)), cost: Math.max(1, num(br.cost, 1)), earned: Math.max(0, num(br.earned)) });
      }
      for (const k in out.record) out.record[k] = Math.max(0, num(saved.record?.[k]));
      return out;
    },
    earn: earnAndTrack,
    netIncome: () => me().brands.reduce((a, br) => a + brandIncome(br), 0),
    render: drawCard,
    events: rogueEvent,
    stats() {
      const s = me();
      if (!s.brands.length) return [];
      return [["Franchise brands", s.brands.length], ["Franchise locations open", s.brands.reduce((a, br) => a + br.locs, 0)],
              ["Franchise royalties", money(s.brands.reduce((a, br) => a + brandIncome(br), 0)) + "/sec"]];
    },
    test: { FR, FRANCHISABLE, launch, launchCost, notReady, ready, royaltyPer, capOf, earn: earnAndTrack, hurt, rogueEvent },
  });
})();
