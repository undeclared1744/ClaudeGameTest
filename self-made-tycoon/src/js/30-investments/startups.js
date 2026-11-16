/* =====================================================================
   INVESTMENT: ANGEL AND STARTUP STAKES
   Being an "angel investor": you write a check to a tiny made-up startup
   for a small slice of the company, then wait to see what happens.

   How it plays (one card, one decision):
     - One founder pitch is on the card at a time: a made-up company, a
       one-line idea, how much they want and for what share.
     - Decide: FUND IT or PASS. Before deciding you can pay for DUE
       DILIGENCE (a small share of the check), which tells you how good
       the startup really is.
     - Funded startups sit in your portfolio (up to SU.slots at once).
       After SU.waitMin..waitMax real minutes the result comes in.

   The real-world lesson built into the numbers:
     - MOST STARTUPS FAIL. Even the good ones fail about half the time.
     - Returns come from rare big wins: about 1 in 230 blind checks (and
       about 1 in 50 standouts) becomes a "unicorn" paying 50x to 100x.
     - Funding blind is barely better than breaking even. Doing your
       homework and only funding the solid ones is what makes it pay,
       just like real angel investing.

   Every pitch has a hidden GRADE (0 weak, 1 solid, 2 standout). The grade
   sets the odds of each OUTCOME. Due diligence reveals the grade (as a
   plain-English finding, not a number).

   Money rules (same as selling a business, see addProceeds in
   06-fixsell.js): the check leaves your cash when you fund it, and only
   the PROFIT on a win counts as "earned" (toward tiers, upgrades and
   Legacy stars). Getting your own money back doesn't count twice.

   Everything lives inside one function so this file's names can't clash
   with the other investment files (they all share one script).
   ===================================================================== */
(() => {
  // ---------- Tuning ----------
  const SU = {
    slots: 2,                   // startups you can hold at once (keeps it a choice, not a firehose)
    checkSeconds: 240,          // a check is about 4 minutes of your steady income...
    checkFloor: 0.1,            // ...but at least 10% of your current tier's unlock amount
    ddShare: 0.05,              // due diligence costs 5% of the check
    nextPitch: 20,              // seconds until the next pitch after you fund or pass
    staleAfter: 300,            // an untouched pitch is replaced after 5 minutes (so check sizes keep up)
    waitMin: 12 * 60,           // seconds until a funded startup's result comes in
    waitMax: 20 * 60,
    keepResults: 4,             // recent results shown on the card
  };

  // OUTCOMES: what a startup can turn into. mult = what your check turns into.
  // The unicorn's mult is a range (50x to 100x), rolled when it happens.
  const OUTCOMES = [
    { id: "fail",    mult: 0,   title: "Shut down",      text: n => `${n} ran out of money and shut down.` },
    { id: "acqui",   mult: 1,   title: "Bought for the team", text: n => `A bigger company hired ${n}'s team and bought the leftovers. You got your money back.` },
    { id: "acquired",mult: 3,   title: "Acquired!",      text: n => `${n} was bought by a bigger company.` },
    { id: "bigexit", mult: 10,  title: "Big exit!",      text: n => `${n} took off and sold for a fortune.` },
    { id: "unicorn", mult: [50, 100], title: "Unicorn!", text: n => `${n} became a household name. Your tiny early check is now worth a mint.` },
  ];
  // GRADES: how good a startup really is. weight = how often a pitch has
  // this grade. odds = chance of each outcome above, in the same order.
  // Expected return per $1 (worked out by hand, checked by the test):
  //   weak ~0.18x, solid ~1.25x, standout ~3.1x; blind average ~1.1x;
  //   funding only solid + standout after due diligence ~1.7x.
  const GRADES = [
    { name: "Weak",     weight: 0.40, tone: "bad",  odds: [0.88, 0.09, 0.03, 0,     0],
      finds: ["No paying customers yet", "The founders are fighting over who owns what", "Burning cash with nothing to show",
              "It's a copy of three other apps"] },
    { name: "Solid",    weight: 0.45, tone: "",     odds: [0.622, 0.18, 0.155, 0.04, 0.003],
      finds: ["Real customers, but money runs out in 9 months", "Growing steadily, nothing flashy", "Good team in a crowded market"] },
    { name: "Standout", weight: 0.15, tone: "good", odds: [0.50, 0.18, 0.22, 0.08,  0.02],
      finds: ["Sales are doubling every quarter", "The founders sold their last company", "Customers are begging for it"] },
  ];

  // Made-up startups. sector picks the logo color (SECTORS in 01-data.js).
  const IDEAS = [
    ["Scheduling app for dog groomers", "tech"], ["A robot that folds laundry", "tech"], ["Plant-based beef jerky", "food"],
    ["Drone delivery for farm parts", "transport"], ["Smart locks for storage units", "property"], ["Payroll app for small restaurants", "finance"],
    ["Rent-a-tool marketplace", "retail"], ["Solar carports for parking lots", "property"], ["Office coffee by subscription", "food"],
    ["Sensors that warn of roof leaks", "tech"], ["Marketplace for used restaurant gear", "retail"], ["Oil changes in your office parking lot", "auto"],
    ["Late-night taco delivery kitchen", "food"], ["Booking app for youth sports leagues", "fun"], ["Same-day courier for pharmacies", "transport"],
    ["Food truck insurance you buy by text", "finance"], ["Indoor mini golf with arcade games", "fun"], ["Self-serve dog wash stations", "services"],
    ["Software that routes HVAC crews", "services"], ["EV chargers for apartment buildings", "auto"],
  ];
  const NAME_ENDS = [" Labs", " Loop", " Nest", " Works", " Stack", "ly", " Base", " Kit", "ify", " Hub"];
  // What every founder says before you look closer (shown until due diligence)
  const HYPE = ["\"This market is huge.\"", "\"Nobody else is doing this.\"", "\"Our users love us.\"",
                "\"We'll be everywhere in a year.\"", "\"We just need a little runway.\""];

  // ---------- Helpers ----------
  const me = () => inv("startups");
  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  const rand = (a, b) => a + Math.random() * (b - a);
  // Pick an index from a list of weights that add up to about 1
  function weighted(weights) {
    let roll = Math.random() * weights.reduce((a, w) => a + w, 0);
    for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll < 0) return i; }
    return weights.length - 1;
  }
  const ddCostOf = p => Math.max(1, p.check * SU.ddShare);

  // A new founder pitch, sized to how much you earn right now
  function makePitch() {
    const [idea, sector] = pick(IDEAS);
    const floor = TIERS[tierUnlocked()].unlock * SU.checkFloor;
    const check = roundNice(Math.max(floor, 50, baseIncome() * SU.checkSeconds * rand(0.7, 1.3)));
    const pct = Math.round(rand(3, 12));                 // share of the company you'd get
    return {
      key: Math.random().toString(36).slice(2, 9),
      name: pick(NAME_PARTS.tech) + pick(NAME_ENDS), idea, sector, check, pct,
      grade: weighted(GRADES.map(g => g.weight)),       // hidden until due diligence
      find: 0,                                           // which finding due diligence reports (picked below)
      hype: pick(HYPE),
      checked: false,
      madeAt: Date.now(),
    };
  }

  // ---------- The one decision: fund, pass (and the optional homework) ----------
  function checkPitch() {
    const s = me(), p = s.pitch;
    if (!p || p.checked) return false;
    const cost = ddCostOf(p);
    if (cost > state.cash) { toast("Not enough cash for due diligence"); return false; }
    state.cash -= cost;
    p.checked = true;
    p.find = Math.floor(Math.random() * GRADES[p.grade].finds.length);
    s.record.checks++;
    toast(`Due diligence: ${GRADES[p.grade].finds[p.find].toLowerCase()}.`);
    dirty = true; render(true);
    return true;
  }
  function fund() {
    const s = me(), p = s.pitch;
    if (!p) return false;
    if (s.stakes.length >= SU.slots) { toast(`You can back ${SU.slots} startups at a time. Wait for a result first.`); return false; }
    if (p.check > state.cash) { toast("Not enough cash to fund it"); return false; }
    state.cash -= p.check;
    s.stakes.push({ key: p.key, name: p.name, idea: p.idea, sector: p.sector, check: p.check, pct: p.pct, grade: p.grade,
                    checked: p.checked, endsAt: Date.now() + rand(SU.waitMin, SU.waitMax) * 1000 });
    s.record.funded++;
    s.pitch = null;
    s.nextPitchAt = Date.now() + SU.nextPitch * 1000;
    toast(`You own ${p.pct}% of ${p.name}. Results in about ${Math.round((SU.waitMin + SU.waitMax) / 120)} minutes.`);
    dirty = true; render(true);
    return true;
  }
  function pass() {
    const s = me();
    if (!s.pitch) return false;
    s.pitch = null;
    s.nextPitchAt = Date.now() + SU.nextPitch * 1000;
    dirty = true; render(true);
    return true;
  }

  // ---------- Results ----------
  // Roll a stake's outcome from its grade's odds and pay it out.
  // `force` (tests only) picks the outcome index instead of rolling.
  const news = [];                 // big wins waiting to be shown in a pop-up (not saved: the money is already paid)
  function resolve(stake, force) {
    const s = me();
    const o = force ?? weighted(GRADES[stake.grade].odds);
    const out = OUTCOMES[o];
    const mult = Array.isArray(out.mult) ? Math.round(rand(out.mult[0], out.mult[1])) : out.mult;
    const pay = stake.check * mult;
    if (pay > 0) addProceeds(pay, stake.check);
    s.stakes = s.stakes.filter(x => x !== stake);
    s.record.profit += pay - stake.check;
    if (mult >= 3) { s.record.exits++; s.record.best = Math.max(s.record.best, mult); }
    s.results.unshift({ name: stake.name, check: stake.check, mult, o });
    s.results.length = Math.min(s.results.length, SU.keepResults);
    // Losses and money-back are quiet toasts; real wins get a pop-up.
    if (mult >= 3) news.push({ title: out.title, text: `${out.text(stake.name)} Your ${money(stake.check)} check paid ${mult}x.`, amount: "+" + money(pay) });
    else toast(`${out.text(stake.name)}${mult === 0 ? ` Your ${money(stake.check)} is gone.` : ""}`);
    dirty = true;
    return { o, mult, pay };
  }

  // A rival investor offers to buy one of your stakes early (a
  // "secondary sale"): take a sure profit now, or hold for the real result.
  // Only promising startups attract offers, so an offer is a hint, not proof.
  function secondaryEvent() {
    const now = Date.now();
    const ok = me().stakes.filter(x => x.grade > 0 && now < x.endsAt);
    if (!ok.length) return [];
    return [() => {
      const st = pick(ok);
      const offer = roundNice(st.check * rand(1.6, 3));
      return { title: "Someone wants your stake", text: `A bigger fund wants to buy your ${st.pct}% of ${st.name} for ${money(offer)} now. You put in ${money(st.check)}. Sell, or hold out for the real result?`,
        options: [
          { label: `Sell for ${money(offer)}`, yes: true, act: () => {
              const s = me();
              if (!s.stakes.includes(st)) { toast(`${st.name}'s result already came in`); return; }   // it finished while the offer was up
              s.stakes = s.stakes.filter(x => x !== st);
              addProceeds(offer, st.check);
              s.record.profit += offer - st.check;
              s.record.sold++;
              s.results.unshift({ name: st.name, check: st.check, mult: Math.round(offer / st.check * 10) / 10, o: -1 });
              s.results.length = Math.min(s.results.length, SU.keepResults);
              toast(`Sold your stake in ${st.name}`);
            } },
          { label: "Hold", act: () => {} },
        ] };
    }];
  }

  // ---------- Drawing the card ----------
  // The card is rebuilt only when what's on it changes (a new pitch, a
  // result...). Numbers that tick (countdowns, can-I-afford-it) are
  // updated in place every frame, so a button never vanishes under your
  // finger and controller focus stays put.
  let drawnKey = "", drawnCard = null;
  function structure() {
    const s = me(), p = s.pitch;
    let html = `<h2 class="cond">Startup stakes</h2>
      <p class="note">Back a founder with a check for a slice of their company. Most startups fail; a rare one pays 50x or more. Due diligence shows you which ones are worth it.</p>`;
    if (p) {
      const g = GRADES[p.grade];
      const finding = p.checked ? `<span class="chip ${g.tone}">${esc(g.name)}: ${esc(g.finds[p.find])}</span>`
                                : `<span class="chip">Founder says ${esc(p.hype)}</span>`;
      html += `<div class="biz" id="su-pitch">${logoHtml(p.name, p.sector)}
          <div><h3 class="cond">${esc(p.name)}</h3><div class="sub">${esc(p.idea)} · ${SECTORS[p.sector].name}</div></div>
          <button class="buy" id="su-fund"><span class="pr">${money(p.check)}</span><small>fund it for ${p.pct}%</small></button>
          <div class="chips">${finding}</div>
          <div class="line">Values the company at ${money(p.check / p.pct * 100)}</div>
          <div class="acts">${p.checked ? "" : `<button class="smallbtn" id="su-dd">Due diligence · ${money(ddCostOf(p))}</button>`}
            <button class="smallbtn" id="su-pass">Pass</button></div></div>`;
    } else html += `<p class="note" id="su-wait"></p>`;
    if (s.stakes.length) {
      html += `<h3 class="cond" style="margin:4px 0 0">Your startups (${s.stakes.length} of ${SU.slots})</h3>`;
      for (const st of s.stakes) {
        html += `<div class="biz">${logoHtml(st.name, st.sector)}
            <div><h3 class="cond">${esc(st.name)}</h3><div class="sub">${esc(st.idea)} · ${st.pct}% for ${money(st.check)}</div></div>
            <div class="line" data-ends="${st.endsAt}"></div></div>`;
      }
    }
    if (s.results.length) {
      html += `<p class="note">Recent results: ` + s.results.map(r =>
        `${esc(r.name)} <strong style="color:var(${r.mult >= 1 ? "--money" : "--loss"})">${r.o === -1 ? "sold at " : ""}${r.mult}x</strong>`).join(" · ") + `</p>`;
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
        card.querySelector("#su-fund")?.addEventListener("click", fund);
        card.querySelector("#su-dd")?.addEventListener("click", checkPitch);
        card.querySelector("#su-pass")?.addEventListener("click", pass);
        if (focusId && card.querySelector("#" + focusId)) $(focusId).focus();
      }
    }
    // live bits
    const s = me(), p = s.pitch, now = Date.now();
    const fundBtn = card.querySelector("#su-fund");
    if (fundBtn && p) {
      const can = p.check <= state.cash && s.stakes.length < SU.slots;
      fundBtn.setAttribute("aria-disabled", String(!can));
      card.querySelector("#su-pitch").classList.toggle("affordable", can);
      fundBtn.querySelector("small").textContent = s.stakes.length >= SU.slots ? "portfolio full" : `fund it for ${p.pct}%`;
    }
    const dd = card.querySelector("#su-dd");
    if (dd && p) dd.setAttribute("aria-disabled", String(ddCostOf(p) > state.cash));
    const wait = card.querySelector("#su-wait");
    if (wait) wait.textContent = `Next founder pitch in ${duration(Math.max(0, s.nextPitchAt - now) + 999)}.`;
    for (const el of card.querySelectorAll("[data-ends]")) {
      const left = Number(el.dataset.ends) - now;
      el.textContent = left > 0 ? `Results in ${duration(left + 999)}` : "Results are in...";
    }
  }

  // ---------- Register ----------
  const fresh = () => ({ pitch: null, nextPitchAt: 0, stakes: [], results: [],
                         record: { funded: 0, checks: 0, exits: 0, sold: 0, best: 0, profit: 0 } });
  registerInvestment({
    id: "startups", name: "Startup stakes", order: 50, unlockTier: 2,
    fresh,
    // Never trust a save: rebuild every field from known-good pieces.
    validate(saved) {
      const out = fresh();
      const okGrade = g => Number.isInteger(g) && g >= 0 && g < GRADES.length;
      const okPitch = p => p && typeof p === "object" && Number.isFinite(p.check) && p.check > 0 && okGrade(p.grade) && SECTORS[p.sector];
      if (okPitch(saved.pitch)) {
        const p = saved.pitch;
        out.pitch = { key: String(p.key || "p"), name: String(p.name || "Startup"), idea: String(p.idea || ""), sector: p.sector,
          check: p.check, pct: Math.min(50, Math.max(1, num(p.pct, 5))), grade: p.grade,
          find: Math.min(GRADES[p.grade].finds.length - 1, Math.max(0, num(p.find) | 0)), hype: String(p.hype || HYPE[0]),
          checked: !!p.checked, madeAt: num(p.madeAt, Date.now()) };
      }
      out.nextPitchAt = Math.max(0, num(saved.nextPitchAt));
      if (Array.isArray(saved.stakes)) out.stakes = saved.stakes.filter(okPitch).slice(0, SU.slots).map(st => ({
        key: String(st.key || "s"), name: String(st.name || "Startup"), idea: String(st.idea || ""), sector: st.sector,
        check: st.check, pct: Math.min(50, Math.max(1, num(st.pct, 5))), grade: st.grade, checked: !!st.checked,
        endsAt: num(st.endsAt, Date.now()) }));
      if (Array.isArray(saved.results)) out.results = saved.results.filter(r => r && Number.isFinite(r.mult)).slice(0, SU.keepResults)
        .map(r => ({ name: String(r.name || "Startup"), check: num(r.check), mult: r.mult, o: num(r.o) | 0 }));
      for (const k in out.record) out.record[k] = num(saved.record?.[k]);
      return out;
    },
    // No steady income: money only moves on fund / result. Results that
    // came due while you were away are paid out by tick() below.
    tick(now) {
      if (!investUnlocked(this)) return;
      const s = me();
      // Show a big win from an earlier tick once no other pop-up is up
      // (so it isn't hidden behind "While you were out", which opens right
      // after the first tick on load).
      if (news.length && !modalOpen()) { const n = news.shift(); showModal(n.title, n.text, n.amount); }
      for (const st of [...s.stakes]) if (now >= st.endsAt) resolve(st);
      // A pitch left alone too long goes stale (another founder calls), so
      // check sizes keep up with your income.
      if (s.pitch && !s.pitch.checked && now - s.pitch.madeAt > SU.staleAfter * 1000) { s.pitch = null; s.nextPitchAt = now; }
      if (!s.pitch && now >= s.nextPitchAt) { s.pitch = makePitch(); dirty = true; }
    },
    render: drawCard,
    events: secondaryEvent,
    stats() {
      const r = me().record;
      if (!r.funded) return [];
      return [["Startups funded", r.funded], ["Startup exits (3x or more)", r.exits + (r.best ? ` (best ${r.best}x)` : "")],
              ["Profit from startups", money(r.profit)]];
    },
    // Handles for tests/invest_startups.py
    test: { SU, GRADES, OUTCOMES, makePitch, checkPitch, fund, pass, resolve, news,
            odds: g => GRADES[g].odds, outcomeMults: () => OUTCOMES.map(o => o.mult) },
  });
})();
