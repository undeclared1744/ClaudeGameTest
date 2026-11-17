
/* =====================================================================
   INVESTMENT: COMMODITIES  (gold, oil and grain)

   What a real owner learns here: raw materials don't pay you anything
   while you hold them. There's no rent and no dividend. You make money
   only by buying low and selling high, and the one thing gold is good for
   is holding its value when everything else gets scary.

   The three markets each have a personality:
     Gold  - barely moves and creeps up slowly. When bad news hits oil or
             grain, scared money runs to gold and it jumps a little.
     Oil   - swings with the economy. The "Hot economy" event pushes it
             up, and supply news can move it 15-25% in a minute or two.
     Grain - follows the seasons (a slow up-and-down wave, one "year" per
             real hour) and jumps on weather news.

   How a price moves (every STEP seconds, also while you're away):
     * It drifts back toward a "fair" price (mean reversion), so a spike
       fades over the next 15-30 minutes, the way news does.
     * It wiggles randomly around that (volatility).
     * News "shocks" push it up or down over a minute or two.
   The random numbers come from a seeded generator stored in the save, so
   reloading the page can't re-roll a bad price.

   Why this can't be a money machine:
     * Prices have no built-in growth except gold's slow, LINEAR creep
       (no compounding), so holding forever doesn't snowball.
     * Every buy and sell costs FEE (1%), so rapid flipping loses money.
     * You can only put in about an hour of your business income
       (cap(): CAP_SECONDS of income, at least CAP_FLOOR). The best
       possible timing of the grain seasons adds roughly +8% to your
       income, and only if you watch it every hour.
     * Only the PROFIT part of a sale counts toward "earned" (unlocks and
       Legacy stars), the same as selling a business (addProceeds).

   One card, one decision per market: buy a lot, or sell what you hold.
   ===================================================================== */
(() => {
  const ID = "commodities";
  const STEP = 5;                  // seconds of market time per price step
  const HIST_EVERY = 6;            // record the price for the chart every 6 steps (30s)
  const HIST_LEN = 40;             // chart shows the last 40 points (20 minutes)
  const FEE = 0.01;                // 1% on every buy and every sell
  const CAP_SECONDS = 3600;        // can hold up to 1 hour of business income...
  const CAP_FLOOR = 25000;         // ...but never less than this
  const MAX_CATCHUP = 8 * 3600;    // same 8-hour cap as away earnings
  const NEWS_PER_HOUR = 0.25;      // random oil/grain news while you hold (about once per 4 hours each)

  // The three markets. base = starting fair price, vol = typical random
  // move per hour (as a fraction), half = seconds for half of a gap to the
  // fair price to close (mean reversion).
  const ASSETS = {
    gold:  { name: "Gold",  unit: "oz",     base: 1800, vol: 0.03, half: 1800,
             blurb: "Barely moves and creeps up slowly. Jumps when bad news scares everyone." },
    oil:   { name: "Oil",   unit: "barrel", base: 80,   vol: 0.10, half: 900,
             blurb: "Swings with the economy: a hot economy pushes it up. Supply news moves it fast." },
    grain: { name: "Grain", unit: "bushel", base: 6.5,  vol: 0.07, half: 1200,
             blurb: "Follows the seasons: cheap after harvest, dear before it. Weather news moves it." },
  };
  const IDS = Object.keys(ASSETS);

  // Headlines for the random news that happens on its own (not the pop-up events)
  const NEWS = {
    oil:   { up: ["A refinery fire shuts down a big plant", "Pipeline repairs slow deliveries", "Shipping lanes are jammed"],
             down: ["Drivers are buying fewer gallons", "A huge new tanker fleet arrives", "Factories cut back on fuel"] },
    grain: { up: ["Hail flattens fields out west", "A late frost hits the wheat", "Export orders pour in"],
             down: ["Perfect weather: a bumper crop is coming", "Buyers overseas cancel orders", "Silos are overflowing"] },
  };

  // ---------- small helpers ----------
  const S = () => inv(ID);
  // A number from a save, forced into [lo, hi]; def if it isn't a number
  const num = (v, lo, hi, def) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

  // Seeded random numbers (mulberry32). The seed lives in the save, so the
  // same save always produces the same future prices.
  function rand(st) {
    st.seed = (st.seed + 0x6D2B79F5) | 0;
    let t = st.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // A bell-curve random number (mean 0, spread 1), Box-Muller method
  function gauss(st) {
    const u = Math.max(1e-12, rand(st)), v = rand(st);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Prices like $1,812.40 or $6.52 (money() rounds small numbers too much)
  const priceText = p => (p < 1e4 ? "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : money(p));

  // The price a market drifts toward right now
  function fair(id, st) {
    const A = ASSETS[id], hours = st.t / 3600;
    if (id === "gold") return A.base * (1 + 0.04 * hours) * (isBoom() ? 0.97 : 1);   // +4% of base per hour, in a straight line
    if (id === "oil") return A.base * (isBoom() ? 1.12 : 1);                          // hot economy = more fuel burned
    return A.base * (1 + 0.05 * Math.sin(2 * Math.PI * st.t / 3600));                 // grain: one "year" per hour, +-5%
  }

  // ---------- state ----------
  function freshAsset(id) {
    return { p: ASSETS[id].base, units: 0, cost: 0, hist: [], shocks: [] };
  }
  function fresh() {
    const st = { seed: Math.floor(Math.random() * 2 ** 31), t: 0, acc: 0, steps: 0, profit: 0, trades: 0, a: {} };
    for (const id of IDS) st.a[id] = freshAsset(id);
    // Run 20 minutes of market before you arrive, so the charts aren't empty
    for (let i = 0; i < HIST_LEN * HIST_EVERY; i++) step(st, []);
    return st;
  }
  // Clean up a loaded save: keep only sane numbers, rebuild anything odd
  function validate(saved) {
    if (!saved || typeof saved !== "object") throw new Error("bad commodities save");
    const st = fresh();
    st.seed = num(saved.seed, -(2 ** 31), 2 ** 31, st.seed) | 0;
    st.t = num(saved.t, 0, 1e9, 0);
    st.acc = num(saved.acc, 0, STEP, 0);
    st.steps = Math.floor(num(saved.steps, 0, 1e12, 0));
    st.profit = num(saved.profit, -1e300, 1e300, 0);
    st.trades = Math.floor(num(saved.trades, 0, 1e12, 0));
    for (const id of IDS) {
      const s = saved.a && saved.a[id], a = st.a[id];
      if (!s || typeof s !== "object") continue;
      const f = fair(id, st);
      a.p = num(s.p, f / 5, f * 5, f);
      a.units = num(s.units, 0, 1e300, 0);
      a.cost = a.units > 0 ? num(s.cost, 0, 1e300, 0) : 0;   // no units = nothing paid in
      a.hist = Array.isArray(s.hist) ? s.hist.filter(x => typeof x === "number" && x > 0 && Number.isFinite(x)).slice(-HIST_LEN) : [];
      a.shocks = Array.isArray(s.shocks) ? s.shocks.filter(k => k && Number.isFinite(k.m) && k.dur > 0 && k.left > 0)
        .slice(0, 8).map(k => ({ m: num(k.m, -3, 3, 0), dur: num(k.dur, 1, 3600, 60), left: num(k.left, 0, 3600, 0) })) : [];
    }
    return st;
  }

  // ---------- the market ----------
  // Push a price by m (a change in log price: Math.log(1.2) = +20%) spread
  // over dur seconds.
  function addShock(id, m, dur, st = S()) {
    st.a[id].shocks.push({ m, dur, left: dur });
  }
  // One STEP of market time. msgs collects headlines for holders.
  function step(st, msgs) {
    const dt = STEP;
    for (const id of IDS) {
      const A = ASSETS[id], a = st.a[id];
      const lf = Math.log(fair(id, st));
      let lx = Math.log(a.p);
      lx += (Math.LN2 / A.half) * (lf - lx) * dt;            // drift back toward fair
      lx += A.vol * Math.sqrt(dt / 3600) * gauss(st);         // random wiggle
      for (const k of a.shocks) { lx += k.m * Math.min(dt, k.left) / k.dur; k.left -= dt; }
      a.shocks = a.shocks.filter(k => k.left > 0);
      lx = Math.min(lf + 1.2, Math.max(lf - 1.2, lx));        // never more than ~3.3x away from fair
      a.p = Math.exp(lx);
      if (!Number.isFinite(a.p) || a.p <= 0) a.p = Math.exp(lf);
    }
    // Random news for oil and grain. Bad news for them sends gold up a bit:
    // that's gold "steadying" a portfolio.
    for (const id of ["oil", "grain"]) {
      if (rand(st) >= NEWS_PER_HOUR * dt / 3600) continue;
      const up = rand(st) < 0.5, size = Math.log(1.1 + rand(st) * 0.1);   // 10-20%
      addShock(id, up ? size : -size, 60, st);
      if (!up) addShock("gold", Math.log(1.02 + rand(st) * 0.02), 60, st);
      const list = NEWS[id][up ? "up" : "down"];
      if (st.a[id].units > 0) msgs.push(`${list[Math.floor(rand(st) * list.length)]}: ${ASSETS[id].name.toLowerCase()} ${up ? "jumps" : "drops"}`);
    }
    st.t += dt;
    st.steps++;
    if (st.steps % HIST_EVERY === 0) for (const id of IDS) {
      const h = st.a[id].hist;
      h.push(st.a[id].p);
      if (h.length > HIST_LEN) h.splice(0, h.length - HIST_LEN);
    }
  }

  // ---------- money ----------
  const sellValue = a => a.units * a.p * (1 - FEE);                   // what selling it all pays now
  const heldValue = st => IDS.reduce((t, id) => t + sellValue(st.a[id]), 0);
  const basis = st => IDS.reduce((t, id) => t + st.a[id].cost, 0);  // money put in and not yet taken out
  const cap = () => Math.max(CAP_FLOOR, baseIncome() * CAP_SECONDS);
  const room = () => Math.max(0, cap() - basis(S()));
  // One press of Buy: a quarter of your limit, or whatever room / cash is left
  const lot = () => Math.max(0, Math.min(state.cash, room(), cap() / 4));

  function buy(id, amount = lot()) {
    const st = S(), a = st.a[id];
    if (!a) return false;
    amount = Math.min(amount, state.cash, room());
    if (!(amount >= 1)) {
      toast(room() < 1 ? "You've hit your commodities limit. Sell something first, or grow your income." : "Not enough cash yet");
      return false;
    }
    state.cash -= amount;
    a.units += amount * (1 - FEE) / a.p;
    a.cost += amount;
    st.trades++;
    toast(`Bought ${money(amount)} of ${ASSETS[id].name.toLowerCase()} at ${priceText(a.p)}`);
    return true;
  }
  function sell(id) {
    const st = S(), a = st.a[id];
    if (!a || a.units <= 0) return false;
    const value = sellValue(a);
    const profit = addProceeds(value, a.cost);          // only the profit counts as earnings
    st.profit += profit;
    st.trades++;
    a.units = 0; a.cost = 0;
    toast(`Sold your ${ASSETS[id].name.toLowerCase()} for ${money(value)}: ` + (profit >= 0 ? `${money(profit)} profit` : `${money(-profit)} loss`));
    return true;
  }

  // ---------- pop-up events (opportunities) ----------
  // The news only happens if you answer (either button). Ignoring an event
  // changes nothing, so these are all chances to make money, never
  // "dodge the bad news by ignoring it" traps. Forecasts can be wrong.
  function newsEvent(id, title, text, odds, upRange, downRange) {
    const name = ASSETS[id].name.toLowerCase();
    const hit = () => {                      // the forecast comes true (or not)
      const right = Math.random() < odds;
      const [lo, hi] = right ? upRange : downRange;
      addShock(id, Math.log(lo + Math.random() * (hi - lo)), right ? 90 : 60);
      return right;
    };
    return () => {
      const L = lot();
      return { title, text: `${text} (Forecasts like this are right about ${Math.round(odds * 10)} times in 10.)`,
        options: [
          { label: L >= 1 ? `Buy ${name}: ${money(L)}` : `Buy ${name}`, yes: true, act: () => { buy(id); hit(); } },
          { label: "Stay out", act: () => { hit(); } },
        ] };
    };
  }
  const events = () => [
    newsEvent("grain", "Drought warning", "Forecasters say the grain belt is drying out. Prices could jump.", 0.7, [1.2, 1.3], [0.9, 0.95]),
    newsEvent("oil", "Oil supply cut", "Big producers say they'll pump less next month. Oil could climb.", 0.65, [1.15, 1.25], [0.9, 0.95]),
    () => {                                  // jitters: gold up, oil a little down
      const L = lot();
      return { title: "Market jitters", text: "Investors are nervous and money is running to gold. (Gold usually gains 6-10% when this happens.)",
        options: [
          { label: L >= 1 ? `Buy gold: ${money(L)}` : "Buy gold", yes: true, act: () => { buy("gold"); jitters(); } },
          { label: "Stay out", act: () => { jitters(); } },
        ] };
    },
  ];
  function jitters() {
    const big = Math.random() < 0.75;
    addShock("gold", Math.log(big ? 1.06 + Math.random() * 0.04 : 1 + Math.random() * 0.02), 90);
    addShock("oil", Math.log(0.95), 90);
  }

  // ---------- time ----------
  // Runs every frame with a tiny `seconds`, and once with up to 8 hours
  // after time away. Commodities never pay income, so it returns 0.
  function earn(seconds) {
    const st = S();
    st.acc = Math.min(MAX_CATCHUP, st.acc + seconds);
    const n = Math.floor(st.acc / STEP);
    if (!n) return 0;
    st.acc -= n * STEP;
    const before = heldValue(st), msgs = [];
    for (let i = 0; i < n; i++) step(st, msgs);
    if (n > 20 && before > 0) {               // a long catch-up: one summary instead of a pile of headlines
      const after = heldValue(st);
      toast(`While you were away your commodities went from ${money(before)} to ${money(after)}`);
    } else if (msgs.length) toast(msgs[msgs.length - 1]);
    return 0;
  }

  // ---------- the card ----------
  // Scoped styles, added once (only this card uses them)
  function addStyle() {
    if (document.getElementById("cmd-style")) return;
    const s = document.createElement("style");
    s.id = "cmd-style";
    s.textContent = `
      #inv-commodities .mkt { display: grid; grid-template-columns: 1fr 110px; gap: 4px 12px; align-items: center; border-top: 1px solid var(--rule); padding-top: 8px; }
      #inv-commodities .mkt h3 { margin: 0; font-size: 20px; }
      #inv-commodities .mkt .px { font: 600 15px var(--mono); margin-left: 6px; }
      #inv-commodities .mkt .chg { font: 13px var(--mono); margin-left: 6px; }
      #inv-commodities .mkt .px, #inv-commodities .mkt .chg { white-space: nowrap; display: inline-block; }   /* keep '▲ 2.0%' together on phones */
      #inv-commodities .up { color: var(--money); } #inv-commodities .down { color: var(--loss); }
      #inv-commodities .mkt .sub { font-size: 13px; color: var(--muted); }
      #inv-commodities .mkt svg { width: 110px; height: 34px; grid-row: span 2; }
      #inv-commodities .mkt .hold { font: 13px var(--mono); grid-column: 1 / -1; }
      #inv-commodities .mkt .acts { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
      #inv-commodities .mkt .acts .smallbtn { padding: 5px 10px; font-size: 14px; }`;
    document.head.appendChild(s);
  }
  // Points for the little price chart
  function sparkPoints(a) {
    const pts = [...a.hist, a.p];
    if (pts.length < 2) return "0,15 100,15";
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    return pts.map((v, i) => `${(i / (pts.length - 1) * 100).toFixed(1)},${(30 - (v - lo) / span * 28 - 1).toFixed(1)}`).join(" ");
  }
  function render(card, full) {
    const st = S();
    if (card.dataset.built !== "1") {
      addStyle();
      card.dataset.built = "1";
      card.innerHTML = `<h2 class="cond">Commodities</h2>
        <p class="note">Gold, oil and grain pay nothing while you hold them. You profit by buying low and selling high, and gold holds up when bad news hits. Every trade costs ${FEE * 100}%.</p>
        ${IDS.map(id => `<div class="mkt" data-id="${id}">
          <div><h3 class="cond">${ASSETS[id].name}<span class="px"></span><span class="chg"></span></h3><div class="sub">${esc(ASSETS[id].blurb)}</div></div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
          <div class="hold"></div>
          <div class="acts"><button class="smallbtn" id="cmd-buy-${id}"></button><button class="smallbtn" id="cmd-sell-${id}"></button></div>
        </div>`).join("")}
        <p class="note" id="cmd-room"></p>`;
      for (const id of IDS) {
        card.querySelector(`#cmd-buy-${id}`).addEventListener("click", () => { buy(id); render(card, true); });
        card.querySelector(`#cmd-sell-${id}`).addEventListener("click", () => { sell(id); render(card, true); });
      }
      full = true;
    }
    const L = lot();
    for (const row of card.querySelectorAll(".mkt")) {
      const id = row.dataset.id, a = st.a[id];
      row.querySelector(".px").textContent = priceText(a.p) + "/" + ASSETS[id].unit;
      const old = a.hist[0], chg = old ? (a.p / old - 1) * 100 : 0;
      const c = row.querySelector(".chg");
      c.textContent = old ? `${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}%` : "";
      c.className = "chg " + (chg >= 0 ? "up" : "down");
      row.querySelector(".hold").textContent = a.units > 0
        ? `You hold ${money(sellValue(a))} (put in ${money(a.cost)}, ${sellValue(a) >= a.cost ? "+" : ""}${((sellValue(a) / a.cost - 1) * 100).toFixed(1)}%)`
        : "You hold none.";
      if (full) {
        row.querySelector("polyline").setAttribute("points", sparkPoints(a));
        row.querySelector("svg").setAttribute("class", chg >= 0 ? "up" : "down");
      }
      const bb = row.querySelector(`#cmd-buy-${id}`), sb = row.querySelector(`#cmd-sell-${id}`);
      bb.textContent = L >= 1 ? `Buy · ${money(L)}` : "Buy";
      bb.setAttribute("aria-disabled", String(!(L >= 1)));
      sb.textContent = a.units > 0 ? `Sell all · ${money(sellValue(a))}` : "Sell all";
      sb.setAttribute("aria-disabled", String(!(a.units > 0)));
    }
    card.querySelector("#cmd-room").textContent =
      `You can have up to ${money(cap())} in commodities (about an hour of your business income). Room left: ${money(room())}.`;
  }

  registerInvestment({
    id: ID, name: "Commodities", order: 70, unlockTier: 2,
    fresh, validate, earn, render, events,
    stats: () => [["Commodities held", money(heldValue(S()))], ["Commodities profit", money(S().profit)]],
    // Handles for tests/invest_commodities.py
    test: { ASSETS, FEE, STEP, fair: id => fair(id, S()), cap, room, lot, buy, sell, addShock: (id, m, dur) => addShock(id, m, dur),
            steps: n => { const st = S(), msgs = []; for (let i = 0; i < n; i++) step(st, msgs); return msgs; },
            validate, fresh, events, rand: () => rand(S()) },
  });
})();
