
/* =====================================================================
   INVESTMENT: CRYPTO  (pure speculation, made-up coins only)

   What a real owner learns here: crypto pays nothing and swings wildly.
   Most of the time you'd have done better leaving the money in your
   businesses. Once in a while a coin moons, and that's exactly what keeps
   people coming back. Hype usually fades, rug pulls happen, and the
   lesson is "only put in what you can afford to lose".

   Three coin slots, each a different kind (all names are made up; no real
   coins or brands):
     big  - Blockbarn (BARN): the "established" coin. Swings ~25% an hour,
            a small upward drift, never disappears.
     alt  - a mid-size coin. Swings ~45% an hour. Now and then its team
            vanishes and it goes to zero (a rug pull).
     meme - a joke coin. Swings ~90% an hour and gets rug-pulled often.
            A rare one goes 20x. When a coin dies, a new one launches in
            its slot with a new silly name.
   On top of that, about once every 10 hours the whole market crashes
   30-45% (sometimes it bounces back part way), and any coin that climbs
   past 30x its launch price is in a bubble that can pop.

   How a price moves (every STEP seconds, also while you're away, up to 8
   hours): a random walk in log price, with drift set so that the AVERAGE
   price stays put (the "-vol^2/2" term) apart from each coin's small
   built-in drift. News shocks are spread over a minute or two. The random
   numbers come from a seeded generator stored in the save, so reloading
   the page can't re-roll a crash.

   Why this can't be a money machine:
     * The expected value of holding a meme or alt coin is NEGATIVE (crash
       and rug-pull risk with no drift to make up for it). Only BARN
       expects a little growth, about +1.5% an hour after crash risk.
     * Every buy and sell costs FEE (2.5%), so flipping loses money.
     * You can only put in about 30 minutes of your business income
       (CAP_SECONDS), so even a 20x moonshot is a nice bonus, not a way
       to skip the game. The limit counts money put in, so gains don't
       block you, but you can't pile winnings back in past the limit.
     * Only the PROFIT part of a sale counts toward "earned" (unlocks and
       Legacy stars), the same as selling a business (addProceeds).

   One card, one decision per coin: buy a lot, or cash out.
   ===================================================================== */
(() => {
  const ID = "crypto";
  const STEP = 5;                  // seconds of market time per price step
  const HIST_EVERY = 6;            // chart point every 30 seconds
  const HIST_LEN = 40;             // chart shows the last 20 minutes
  const FEE = 0.025;               // 2.5% on every buy and every sell
  const CAP_SECONDS = 1800;        // can put in up to 30 minutes of business income...
  const CAP_FLOOR = 10000;         // ...but never less than this
  const MAX_CATCHUP = 8 * 3600;
  const CRASH_PER_HOUR = 0.1;      // whole-market crash, about once per 10 hours
  const BUBBLE_X = 30;             // past 30x its launch price a coin is in a bubble
  const DEAD_X = 1 / 1000;         // below 1/1000 of launch it's delisted (dead)

  // The three kinds of coin. vol = typical move per hour, drift = average
  // gain per hour (before crashes), rug = chance per hour that it dies.
  const KINDS = {
    big:  { vol: 0.25, drift: 0.04, rug: 0,     launch: [30000, 30000], label: "The big one. Wild, but it has never gone away." },
    alt:  { vol: 0.45, drift: 0.02, rug: 0.005, launch: [2, 20],        label: "A mid-size coin. Bigger swings, and it could vanish." },
    meme: { vol: 0.90, drift: 0,    rug: 0.04,  launch: [0.02, 0.1],    label: "A joke coin. Could 20x. Usually goes to zero." },
  };
  const SLOTS = ["big", "alt", "meme"];
  // Made-up names. Alts are word + word, memes are hype word + animal.
  const NAMES = {
    alt:  [["Ledger", "Vault", "Mint", "Node", "Copper", "Lattice", "Prism", "Harbor"], ["leaf", "stone", "ridge", "field", "brook", "spark", "forge", "wave"]],
    meme: [["Turbo", "Laser", "Disco", "Mega", "Rocket", "Hyper", "Cosmic", "Sir"], ["Moth", "Llama", "Toad", "Badger", "Walrus", "Goose", "Possum", "Yak", "Newt", "Otter"]],
  };

  // ---------- small helpers ----------
  const S = () => inv(ID);
  const num = (v, lo, hi, def) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  // Seeded random numbers (mulberry32), seed kept in the save
  function rand(st) {
    st.seed = (st.seed + 0x6D2B79F5) | 0;
    let t = st.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(st) {
    const u = Math.max(1e-12, rand(st)), v = rand(st);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const pickR = (st, list) => list[Math.floor(rand(st) * list.length)];
  // $31,250.00, $4.72, or $0.0381 for tiny meme prices
  const priceText = p => (p >= 1e4 ? money(p) : p >= 1 ? "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "$" + p.toPrecision(3));

  // ---------- coins ----------
  // A brand-new coin for a slot (kind). Avoids reusing a name on the board.
  function newCoin(kind, st) {
    let name, sym;
    if (kind === "big") { name = "Blockbarn"; sym = "BARN"; }
    else {
      const taken = new Set(Object.values(st.c || {}).map(c => c.name));
      for (let tries = 0; tries < 20; tries++) {
        const [a, b] = NAMES[kind];
        const x = pickR(st, a), y = pickR(st, b);
        name = kind === "alt" ? x + y : x + " " + y;
        sym = (kind === "alt" ? x : y).slice(0, 4).toUpperCase();
        if (!taken.has(name)) break;
      }
    }
    const [lo, hi] = KINDS[kind].launch;
    const launch = lo * Math.pow(hi / lo, rand(st));      // spread evenly on a log scale
    return { name, sym, launch, p: launch, units: 0, cost: 0, hist: [], shocks: [] };
  }
  function fresh() {
    const st = { seed: Math.floor(Math.random() * 2 ** 31), acc: 0, steps: 0, profit: 0, trades: 0, rugs: 0, best: 0, c: {} };
    for (const k of SLOTS) st.c[k] = newCoin(k, st);
    // Run 20 minutes of market before you arrive, so the charts aren't empty
    for (let i = 0; i < HIST_LEN * HIST_EVERY; i++) step(st, []);
    return st;
  }
  const cleanText = (v, max, def) => (typeof v === "string" && v.trim() ? v.replace(/[^\w ]/g, "").slice(0, max) || def : def);
  function validate(saved) {
    if (!saved || typeof saved !== "object" || !saved.c) throw new Error("bad crypto save");
    const st = fresh();
    st.seed = num(saved.seed, -(2 ** 31), 2 ** 31, st.seed) | 0;
    st.acc = num(saved.acc, 0, STEP, 0);
    st.steps = Math.floor(num(saved.steps, 0, 1e12, 0));
    st.profit = num(saved.profit, -1e300, 1e300, 0);
    st.trades = Math.floor(num(saved.trades, 0, 1e12, 0));
    st.rugs = Math.floor(num(saved.rugs, 0, 1e9, 0));
    st.best = num(saved.best, 0, 1e300, 0);
    for (const k of SLOTS) {
      const s = saved.c[k], c = st.c[k];
      if (!s || typeof s !== "object") continue;
      c.name = cleanText(s.name, 24, c.name);
      c.sym = cleanText(s.sym, 5, c.sym).toUpperCase();
      c.launch = num(s.launch, 1e-6, 1e9, c.launch);
      c.p = num(s.p, c.launch * DEAD_X, c.launch * 1000, c.launch);
      c.units = num(s.units, 0, 1e300, 0);
      c.cost = c.units > 0 ? num(s.cost, 0, 1e300, 0) : 0;
      c.hist = Array.isArray(s.hist) ? s.hist.filter(x => typeof x === "number" && x > 0 && Number.isFinite(x)).slice(-HIST_LEN) : [];
      c.shocks = Array.isArray(s.shocks) ? s.shocks.filter(q => q && Number.isFinite(q.m) && q.dur > 0 && q.left > 0).slice(0, 8)
        .map(q => ({ m: num(q.m, -5, 5, 0), dur: num(q.dur, 1, 3600, 60), left: num(q.left, 0, 3600, 0), wait: num(q.wait, 0, 3600, 0) })) : [];
    }
    return st;
  }

  // ---------- the market ----------
  // Move a coin's log price by m over dur seconds, starting after wait seconds
  function addShock(k, m, dur, wait = 0, st = S()) { st.c[k].shocks.push({ m, dur, left: dur, wait }); }

  // A coin dies (rug pull or delisted). Holders lose what they put in.
  function kill(k, st, why, msgs) {
    const c = st.c[k];
    if (c.units > 0) {
      st.profit -= c.cost;
      st.rugs++;
      msgs.push({ big: true, text: `${c.name} (${c.sym}) ${why}. The ${money(c.cost)} you put in is gone.` });
    }
    st.c[k] = newCoin(k, st);
    msgs.push({ text: `New coin listed: ${st.c[k].name} (${st.c[k].sym})` });
  }

  function step(st, msgs) {
    const dt = STEP, h = dt / 3600;
    // Whole-market crash: every coin drops 30-45%; half the time it bounces partly back
    if (rand(st) < CRASH_PER_HOUR * h) {
      const drop = Math.log(0.55 + rand(st) * 0.15), bounce = rand(st) < 0.5;
      for (const k of SLOTS) {
        addShock(k, drop, 60, 0, st);
        if (bounce) addShock(k, Math.log(1.25), 600, 60, st);
      }
      if (SLOTS.some(k => st.c[k].units > 0)) msgs.push({ text: "Crypto crash! Every coin is down hard." });
    }
    for (const k of SLOTS) {
      const K = KINDS[k], c = st.c[k];
      let lx = Math.log(c.p);
      // Random walk. drift - vol^2/2 keeps the AVERAGE price growing at
      // exactly `drift`, so the wild swings don't add free money.
      lx += (K.drift - K.vol * K.vol / 2) * h + K.vol * Math.sqrt(h) * gauss(st);
      for (const q of c.shocks) {
        if (q.wait > 0) { q.wait -= dt; continue; }
        lx += q.m * Math.min(dt, q.left) / q.dur; q.left -= dt;
      }
      c.shocks = c.shocks.filter(q => q.left > 0);
      lx = Math.min(Math.log(c.launch * 1000), lx);            // hard ceiling, just to keep numbers sane
      c.p = Math.exp(lx);
      if (!Number.isFinite(c.p) || c.p <= 0) c.p = c.launch * DEAD_X;
      // A bubble can pop
      if (c.p > c.launch * BUBBLE_X && rand(st) < 0.01 && !c.shocks.some(q => q.m < -1)) {
        addShock(k, Math.log(0.3), 60, 0, st);
        if (c.units > 0) msgs.push({ text: `The ${c.sym} bubble popped!` });
      }
      // Rug pull, or the price has fallen so far it's delisted
      if (rand(st) < K.rug * h) kill(k, st, "was a rug pull: its team vanished with the money", msgs);
      else if (c.p < c.launch * DEAD_X) kill(k, st, "crashed to nothing and was delisted", msgs);
    }
    st.steps++;
    if (st.steps % HIST_EVERY === 0) for (const k of SLOTS) {
      const hh = st.c[k].hist;
      hh.push(st.c[k].p);
      if (hh.length > HIST_LEN) hh.splice(0, hh.length - HIST_LEN);
    }
  }

  // ---------- money ----------
  const sellValue = c => c.units * c.p * (1 - FEE);
  const heldValue = st => SLOTS.reduce((t, k) => t + sellValue(st.c[k]), 0);
  const basis = st => SLOTS.reduce((t, k) => t + st.c[k].cost, 0);
  const cap = () => Math.max(CAP_FLOOR, baseIncome() * CAP_SECONDS);
  const room = () => Math.max(0, cap() - basis(S()));
  const lot = () => Math.max(0, Math.min(state.cash, room(), cap() / 4));

  function buy(k, amount = lot()) {
    const st = S(), c = st.c[k];
    if (!c) return false;
    amount = Math.min(amount, state.cash, room());
    if (!(amount >= 1)) {
      toast(room() < 1 ? "You've hit your crypto limit. Cash out first, or grow your income." : "Not enough cash yet");
      return false;
    }
    state.cash -= amount;
    c.units += amount * (1 - FEE) / c.p;
    c.cost += amount;
    st.trades++;
    toast(`Bought ${money(amount)} of ${c.sym} at ${priceText(c.p)}`);
    return true;
  }
  function sell(k) {
    const st = S(), c = st.c[k];
    if (!c || c.units <= 0) return false;
    const value = sellValue(c);
    const profit = addProceeds(value, c.cost);         // only the profit counts as earnings
    st.profit += profit;
    st.best = Math.max(st.best, profit);
    st.trades++;
    c.units = 0; c.cost = 0;
    toast(`Cashed out ${c.sym} for ${money(value)}: ` + (profit >= 0 ? `${money(profit)} profit` : `${money(-profit)} loss`));
    return true;
  }

  // ---------- pop-up events ----------
  // Like all events, ignoring one changes nothing. The news only happens
  // if you answer, and it's only offered for a coin you DON'T hold, so
  // ignoring can never be used to dodge bad news on your own coins.
  function events() {
    const st = S(), out = [];
    const free = SLOTS.filter(k => k !== "big" && st.c[k].units <= 0);
    if (free.length) out.push(() => {         // hype: usually a trap
      const k = pick(free), c = S().c[k], L = lot();
      const hype = () => {
        if (S().c[k] !== c) return;            // the coin died in the meantime
        if (Math.random() < 0.3) { addShock(k, Math.log(2.2), 60); addShock(k, Math.log(0.6), 300, 60); }   // pump, then a slow fade
        else addShock(k, Math.log(0.5), 90);                                                              // the dump
      };
      return { title: `${c.sym} is trending`, text: `Everyone online is shouting about ${c.name}. (Hype like this pumps about 3 times in 10. The rest of the time it dumps fast.)`,
        options: [
          { label: L >= 1 ? `Buy the hype: ${money(L)}` : "Buy the hype", yes: true, act: () => { buy(k); hype(); } },
          { label: "Stay out", act: hype },
        ] };
    });
    if (st.c.big.units <= 0) out.push(() => { // BARN "halving": a likelier rise
      const L = lot();
      const go = () => addShock("big", Math.log(Math.random() < 0.6 ? 1.15 + Math.random() * 0.1 : 0.9), 120);
      return { title: "Blockbarn halving", text: "New BARN coins are about to get scarcer, and holders expect the price to rise. (It works about 6 times in 10.)",
        options: [
          { label: L >= 1 ? `Buy BARN: ${money(L)}` : "Buy BARN", yes: true, act: () => { buy("big"); go(); } },
          { label: "Stay out", act: go },
        ] };
    });
    return out;
  }

  // ---------- time ----------
  // Crypto never pays income, so this returns 0. Long catch-ups show one
  // summary; a rug pull you're caught in during play gets a pop-up.
  function earn(seconds) {
    const st = S();
    st.acc = Math.min(MAX_CATCHUP, st.acc + seconds);
    const n = Math.floor(st.acc / STEP);
    if (!n) return 0;
    st.acc -= n * STEP;
    const before = heldValue(st), msgs = [];
    for (let i = 0; i < n; i++) step(st, msgs);
    const bad = msgs.filter(m => m.big);
    if (n > 20) {
      if (before > 0 || bad.length) toast(`While you were away your crypto went from ${money(before)} to ${money(heldValue(st))}` + (bad.length ? " (a coin you held was rug-pulled)" : ""));
    } else if (bad.length) showModal("Rug pull!", bad.map(m => m.text).join(" "), "");
    else if (msgs.length) toast(msgs[msgs.length - 1].text);
    return 0;
  }

  // ---------- the card ----------
  function addStyle() {
    if (document.getElementById("cry-style")) return;
    const s = document.createElement("style");
    s.id = "cry-style";
    s.textContent = `
      #inv-crypto .mkt { display: grid; grid-template-columns: 1fr 110px; gap: 4px 12px; align-items: center; border-top: 1px solid var(--rule); padding-top: 8px; }
      #inv-crypto .mkt h3 { margin: 0; font-size: 20px; }
      #inv-crypto .mkt .px { font: 600 15px var(--mono); margin-left: 6px; }
      #inv-crypto .mkt .chg { font: 13px var(--mono); margin-left: 6px; }
      #inv-crypto .mkt .px, #inv-crypto .mkt .chg { white-space: nowrap; display: inline-block; }   /* keep '▲ 2.0%' together on phones */
      #inv-crypto .up { color: var(--money); } #inv-crypto .down { color: var(--loss); }
      #inv-crypto .mkt .sub { font-size: 13px; color: var(--muted); }
      #inv-crypto .mkt svg { width: 110px; height: 34px; grid-row: span 2; }
      #inv-crypto .mkt .hold { font: 13px var(--mono); grid-column: 1 / -1; }
      #inv-crypto .mkt .acts { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
      #inv-crypto .mkt .acts .smallbtn { padding: 5px 10px; font-size: 14px; }`;
    document.head.appendChild(s);
  }
  function sparkPoints(c) {
    const pts = [...c.hist, c.p].map(Math.log);          // log scale: crypto moves are too big for a straight scale
    if (pts.length < 2) return "0,15 100,15";
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    return pts.map((v, i) => `${(i / (pts.length - 1) * 100).toFixed(1)},${(30 - (v - lo) / span * 28 - 1).toFixed(1)}`).join(" ");
  }
  let builtNames = "";     // rebuild the rows when a coin is replaced
  function render(card, full) {
    const st = S();
    const names = SLOTS.map(k => st.c[k].name).join("|");
    if (card.dataset.built !== "1" || names !== builtNames) {
      addStyle();
      card.dataset.built = "1";
      builtNames = names;
      card.innerHTML = `<h2 class="cond">Crypto</h2>
        <p class="note">Pure speculation: coins pay nothing and swing wildly. Most lose money, a rare one moons. Every trade costs ${FEE * 100}%. Only put in what you can afford to lose.</p>
        ${SLOTS.map(k => `<div class="mkt" data-k="${k}">
          <div><h3 class="cond">${esc(st.c[k].name)} <small>(${esc(st.c[k].sym)})</small><span class="px"></span><span class="chg"></span></h3><div class="sub">${esc(KINDS[k].label)}</div></div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
          <div class="hold"></div>
          <div class="acts"><button class="smallbtn" id="cry-buy-${k}"></button><button class="smallbtn" id="cry-sell-${k}"></button></div>
        </div>`).join("")}
        <p class="note" id="cry-room"></p>`;
      for (const k of SLOTS) {
        card.querySelector(`#cry-buy-${k}`).addEventListener("click", () => { buy(k); render(card, true); });
        card.querySelector(`#cry-sell-${k}`).addEventListener("click", () => { sell(k); render(card, true); });
      }
      full = true;
    }
    const L = lot();
    for (const row of card.querySelectorAll(".mkt")) {
      const k = row.dataset.k, c = st.c[k];
      row.querySelector(".px").textContent = priceText(c.p);
      const old = c.hist[0], chg = old ? (c.p / old - 1) * 100 : 0;
      const el = row.querySelector(".chg");
      el.textContent = old ? `${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}%` : "new";
      el.className = "chg " + (chg >= 0 ? "up" : "down");
      const v = sellValue(c);
      row.querySelector(".hold").textContent = c.units > 0
        ? `You hold ${money(v)} (put in ${money(c.cost)}, ${v >= c.cost ? "+" : ""}${((v / c.cost - 1) * 100).toFixed(1)}%)`
        : "You hold none.";
      if (full) {
        row.querySelector("polyline").setAttribute("points", sparkPoints(c));
        row.querySelector("svg").setAttribute("class", chg >= 0 ? "up" : "down");
      }
      const bb = row.querySelector(`#cry-buy-${k}`), sb = row.querySelector(`#cry-sell-${k}`);
      bb.textContent = L >= 1 ? `Buy · ${money(L)}` : "Buy";
      bb.setAttribute("aria-disabled", String(!(L >= 1)));
      sb.textContent = c.units > 0 ? `Cash out · ${money(v)}` : "Cash out";
      sb.setAttribute("aria-disabled", String(!(c.units > 0)));
    }
    card.querySelector("#cry-room").textContent =
      `You can put up to ${money(cap())} into crypto (about 30 minutes of your business income). Room left: ${money(room())}.`;
  }

  registerInvestment({
    id: ID, name: "Crypto", order: 90, unlockTier: 2,
    fresh, validate, earn, render, events,
    stats: () => [["Crypto held", money(heldValue(S()))], ["Crypto profit", money(S().profit)], ["Coins rug-pulled on you", S().rugs]],
    // Handles for tests/invest_crypto.py
    test: { KINDS, FEE, STEP, cap, room, lot, buy, sell, addShock: (k, m, dur, wait) => addShock(k, m, dur, wait),
            steps: n => { const st = S(), msgs = []; for (let i = 0; i < n; i++) step(st, msgs); return msgs; },
            kill: k => { const msgs = []; kill(k, S(), "was a rug pull", msgs); return msgs; },
            validate, fresh, newCoin: k => newCoin(k, S()), events },
  });
})();
