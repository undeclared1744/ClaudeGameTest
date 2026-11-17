/* =====================================================================
   INVESTMENT: STOCK MARKET
   Owning a small slice of other people's companies instead of running
   your own. It's passive (no fixing, no hustling), so on average it
   earns LESS than a business you run, but it's there for spare cash.

   How it plays (one card, one decision per row: buy or sell):
   - An INDEX FUND that holds a bit of everything: slow, steady, low risk.
   - Four made-up company stocks whose prices swing a lot more. On
     average they do a little better than the index, but any one of them
     can fall hard. Each one partly follows the whole market and partly
     does its own thing.
   - Now and then the market CRASHES: everything falls at once. After a
     crash an event offers to "buy the dip" (the index usually recovers,
     which is the classic lesson).
   - Buy puts a quarter of your cash into that row. Sell sells all of it.
     Only the PROFIT from a sale counts as "earned" (towards tiers and
     Legacy), the same rule as selling a business (addProceeds).

   Pace: prices move in "payback periods": TIER_PAYBACK for your current
   tier (tier 2 or higher), the time a plain business takes to pay for
   itself. Business = +100% per period; index fund about +25%; stocks
   +30% to +45%. So the market stays a side dish at every stage of the
   game, and prices move fast early on and slower later, like everything else.

   Prices move every frame in earn() and also cover time away (already
   capped at 8 hours), split into small steps so the chart still looks
   like a chart.
   ===================================================================== */
(() => {   // own scope: every file shares one <script>
  // ---- The things you can buy ----
  // mu: average growth per payback period. sigma: how wild the swings are
  // (standard deviation per period). beta: how much it follows the whole
  // market (1 = moves with it, 0 = ignores it). start: first share price.
  // All names are made up.
  const ASSETS = [
    { id: "index",  name: "Whole Market Index Fund", kind: "Index fund: a bit of every company", mu: 0.25, sigma: 0.12, beta: 1,   start: 100 },
    { id: "arcus",  name: "Arcus Robotics",          kind: "Factory robots",                     mu: 0.40, sigma: 0.45, beta: 1.2, start: 42 },
    { id: "bright", name: "Brightvale Foods",        kind: "Groceries and snacks",               mu: 0.30, sigma: 0.25, beta: 0.6, start: 65 },
    { id: "cobalt", name: "Cobalt Ridge Energy",     kind: "Oil, gas and wind farms",            mu: 0.35, sigma: 0.40, beta: 1.0, start: 28 },
    { id: "quill",  name: "Quillfeather Games",      kind: "Video games: hit or miss",           mu: 0.45, sigma: 0.65, beta: 1.1, start: 12 },
  ];
  const AS = Object.fromEntries(ASSETS.map(a => [a.id, a]));
  const MARKET_SIGMA = 0.12;          // swings of the market as a whole, per period
  const BUY_SHARE = 0.25;             // Buy puts this share of your cash in
  const MIN_BUY = 10;
  const HIST_SECONDS = 5;             // one chart point every 5 seconds
  const HIST_POINTS = 48;             // so the chart shows the last 4 minutes
  const CRASH_RATE = 0.25;            // crashes per payback period, on average
  const CRASH_DROP = [0.15, 0.25];    // a crash takes this much off the market (stocks: times beta)
  const DIP_WINDOW = 120e3;           // the "buy the dip" event can come up for 2 minutes after a crash

  // One payback period in seconds, at your tier (tier 2 at least: that's when the card opens)
  const period = () => TIER_PAYBACK[Math.max(2, tierUnlocked())];
  const M = () => inv("stocks");
  const value = id => M().hold[id].shares * M().price[id];
  const portfolio = () => ASSETS.reduce((sum, a) => sum + value(a.id), 0);
  const buyAmount = () => state.cash * BUY_SHARE;
  // A standard normal random number (Box-Muller): most are near 0, a few far out
  function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  // Move every price forward by dt periods. Each stock's move is part
  // market move (shared by all), part its own. The -sigma^2/2 term keeps
  // the AVERAGE growth equal to mu (a property of compounding swings), and
  // the crash term adds back what crashes take away on average.
  function step(dt) {
    const s = M();
    const zMarket = gauss();
    const crashLoss = CRASH_RATE * (CRASH_DROP[0] + CRASH_DROP[1]) / 2;
    for (const a of ASSETS) {
      const shared = Math.min(1, a.beta * MARKET_SIGMA / a.sigma);         // share of its swing that's the market's
      const z = shared * zMarket + Math.sqrt(1 - shared * shared) * gauss();
      const drift = a.mu + crashLoss * a.beta;
      s.price[a.id] = Math.max(0.01, s.price[a.id] * Math.exp((drift - a.sigma * a.sigma / 2) * dt + a.sigma * Math.sqrt(dt) * z));
    }
    // A crash in this step? (chance from the crash rate over dt periods)
    if (Math.random() < 1 - Math.exp(-CRASH_RATE * dt)) crash();
  }
  function crash(size = CRASH_DROP[0] + Math.random() * (CRASH_DROP[1] - CRASH_DROP[0])) {
    const s = M();
    for (const a of ASSETS) s.price[a.id] = Math.max(0.01, s.price[a.id] * (1 - Math.min(0.9, size * a.beta)));
    s.crashAt = Date.now();
    s.crashes++;
    if (investUnlocked(MOD)) toast(`Market crash! The index fund fell ${Math.round(size * 100)}%.`);
  }

  // ---- Actions ----
  function buy(id) {
    const s = M(), amount = buyAmount();
    if (!AS[id]) return false;
    if (amount < MIN_BUY) { toast(`You need at least ${money(MIN_BUY / BUY_SHARE)} in cash to buy`); return false; }
    state.cash -= amount;
    s.hold[id].shares += amount / s.price[id];
    s.hold[id].basis += amount;            // what you've paid in, for working out profit
    toast(`Bought ${money(amount)} of ${AS[id].name}`);
    dirty = true;
    render(true);
    return true;
  }
  function sell(id) {
    const s = M(), h = s.hold[id];
    if (!h || !h.shares) return false;
    const got = value(id);
    const profit = addProceeds(got, h.basis);   // only the profit counts as earned
    s.realized += profit;
    h.shares = 0; h.basis = 0;
    toast(`Sold ${AS[id].name} for ${money(got)}: ` + (profit >= 0 ? `${money(profit)} profit` : `${money(-profit)} loss`));
    dirty = true;
    render(true);
    return true;
  }

  // ---- Drawing the card ----
  const css = document.createElement("style");
  css.textContent = `
    .stk-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 14px var(--mono); }
    .stk-row { display: grid; grid-template-columns: 1fr 96px auto; gap: 2px 10px; align-items: center; border-top: 1px solid var(--rule); padding-top: 8px; }
    .stk-row h3 { margin: 0; font-size: 19px; line-height: 1.05; }
    .stk-row .sub { font-size: 12px; color: var(--muted); }
    .stk-row .num { font: 13px var(--mono); grid-column: 1 / 3; }
    .stk-row svg { grid-row: 1 / span 2; grid-column: 2; width: 96px; height: 34px; }
    .stk-row .btns { grid-row: 1 / span 3; grid-column: 3; display: grid; gap: 5px; }
    .stk-row .btns .smallbtn { padding: 4px 8px; font-size: 14px; min-width: 104px; }
    .stk-up { color: var(--money); } .stk-down { color: var(--loss); }`;
  document.head.appendChild(css);

  // A tiny line chart of the recent price history, as an SVG path
  function sparkPath(hist) {
    if (hist.length < 2) return "";
    const lo = Math.min(...hist), hi = Math.max(...hist), span = hi - lo || 1;
    return hist.map((p, i) => `${i ? "L" : "M"}${(i / (hist.length - 1) * 94 + 1).toFixed(1)},${(32 - (p - lo) / span * 30).toFixed(1)}`).join("");
  }
  const pct = (a, b) => (b > 0 ? (a / b - 1) * 100 : 0);
  const signed = n => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

  function drawCard(card, full) {
    const s = M();
    if (full && !card.querySelector(".stk-row")) {
      card.innerHTML = `<h2 class="cond">Stock market</h2>
        <p>Own a slice of other companies. The index fund is slow and steady; single stocks swing hard either way.
        On average it all earns less than running a business, but it puts spare cash to work. Buy puts in a quarter of your cash. Sell sells all of that one.</p>
        <div class="stk-head"><span id="stkTotal"></span><span id="stkGain"></span></div>` +
        ASSETS.map(a => `<div class="stk-row" data-id="${a.id}">
          <div><h3 class="cond">${esc(a.name)}</h3><div class="sub">${esc(a.kind)}</div></div>
          <svg viewBox="0 0 96 34" aria-hidden="true"><path fill="none" stroke-width="2" stroke-linejoin="round"/></svg>
          <div class="btns"><button class="smallbtn" id="stk-buy-${a.id}">Buy</button><button class="smallbtn" id="stk-sell-${a.id}">Sell</button></div>
          <div class="num"></div></div>`).join("") +
        `<p class="note" id="stkNote"></p>`;
      for (const a of ASSETS) {
        card.querySelector(`#stk-buy-${a.id}`).addEventListener("click", () => buy(a.id));
        card.querySelector(`#stk-sell-${a.id}`).addEventListener("click", () => sell(a.id));
      }
    }
    if (!card.querySelector(".stk-row") || !full) return;    // numbers change slowly: redraw 4x a second, not every frame
    const total = portfolio(), basis = ASSETS.reduce((sum, a) => sum + s.hold[a.id].basis, 0);
    card.querySelector("#stkTotal").textContent = `Your stocks: ${money(total)}`;
    const g = card.querySelector("#stkGain");
    g.textContent = basis ? `${total >= basis ? "Up" : "Down"} ${money(Math.abs(total - basis))} (${signed(pct(total, basis))})` : "";
    g.className = total >= basis ? "stk-up" : "stk-down";
    const amt = buyAmount();
    for (const row of card.querySelectorAll(".stk-row")) {
      const id = row.dataset.id, h = s.hold[id], hist = s.hist[id];
      const chartUp = s.price[id] >= (hist[0] ?? s.price[id]);
      const path = row.querySelector("path");
      path.setAttribute("d", sparkPath([...hist, s.price[id]]));
      path.setAttribute("stroke", chartUp ? "var(--money)" : "var(--loss)");
      const move = pct(s.price[id], hist[0] ?? s.price[id]);
      row.querySelector(".num").innerHTML = `${money(s.price[id])}/share <span class="${move >= 0 ? "stk-up" : "stk-down"}">${signed(move)}</span> lately` +
        (h.shares ? ` · you own ${money(value(id))} <span class="${value(id) >= h.basis ? "stk-up" : "stk-down"}">(${signed(pct(value(id), h.basis))})</span>` : "");
      const bb = row.querySelector(`#stk-buy-${id}`), sb = row.querySelector(`#stk-sell-${id}`);
      bb.textContent = amt >= MIN_BUY ? `Buy ${money(amt)}` : "Buy";
      bb.setAttribute("aria-disabled", String(amt < MIN_BUY));
      sb.textContent = h.shares ? `Sell ${money(value(id))}` : "Sell";
      sb.setAttribute("aria-disabled", String(!h.shares));
    }
    card.querySelector("#stkNote").textContent = s.realized
      ? `Profit from selling so far: ${money(s.realized)}. Crashes so far: ${s.crashes}.`
      : "Prices move whether you're watching or not, even while you're away.";
  }

  // A fresh market: starting prices, nothing owned, a flat chart
  const fresh = () => ({
    price: Object.fromEntries(ASSETS.map(a => [a.id, a.start])),
    hold: Object.fromEntries(ASSETS.map(a => [a.id, { shares: 0, basis: 0 }])),
    hist: Object.fromEntries(ASSETS.map(a => [a.id, []])),
    histClock: 0,                         // seconds since the last chart point
    crashAt: 0, crashes: 0, realized: 0,
  });

  const MOD = {
    id: "stocks", name: "Stock market", order: 30, unlockTier: 2,
    fresh,
    validate(saved) {
      const out = fresh();
      const pos = v => Number.isFinite(v) && v >= 0;
      for (const a of ASSETS) {
        const p = saved.price && saved.price[a.id];
        if (Number.isFinite(p) && p > 0) out.price[a.id] = Math.max(0.01, p);
        const h = saved.hold && saved.hold[a.id];
        if (h && pos(h.shares) && pos(h.basis)) out.hold[a.id] = { shares: h.shares, basis: h.basis };
        const hist = saved.hist && saved.hist[a.id];
        if (Array.isArray(hist)) out.hist[a.id] = hist.filter(v => Number.isFinite(v) && v > 0).slice(-HIST_POINTS);
      }
      for (const k of ["histClock", "crashAt", "crashes"]) if (pos(saved[k])) out[k] = saved[k];
      if (Number.isFinite(saved.realized)) out.realized = saved.realized;   // can be negative (losses)
      return out;
    },
    // Prices drift every frame, and for time away (in steps of at least
    // HIST_SECONDS, at most 200 of them, so 8 hours away is quick to work out).
    earn(seconds) {
      const s = M();
      const steps = Math.min(200, Math.max(1, Math.round(seconds / HIST_SECONDS)));
      const dt = seconds / steps;
      for (let i = 0; i < steps; i++) {
        step(dt / period());
        s.histClock += dt;
        if (s.histClock >= HIST_SECONDS) {      // time for a new chart point
          s.histClock = 0;
          for (const a of ASSETS) { const h = s.hist[a.id]; h.push(s.price[a.id]); if (h.length > HIST_POINTS) h.shift(); }
        }
      }
      return 0;                                  // price moves aren't cash until you sell
    },
    render: drawCard,
    // After a crash, a chance to buy the dip
    events: () => (Date.now() - M().crashAt < DIP_WINDOW && buyAmount() >= MIN_BUY ? [() => ({
      title: "Buy the dip?",
      text: `The market just crashed and the index fund is on sale. People who bought after crashes have usually done well, but nobody knows where the bottom is.`,
      options: [
        { label: `Buy ${money(buyAmount())} of the index`, yes: true, act: () => buy("index") },
        { label: "Stay out", act: () => {} },
      ] })] : []),
    stats: () => {
      const s = M();
      const owned = portfolio();
      return owned || s.realized ? [["Stocks owned", money(owned)], ["Profit from stocks", money(s.realized)], ["Market crashes seen", s.crashes]] : [];
    },
    test: { ASSETS, buy, sell, step, crash, period, portfolio, value, buyAmount, BUY_SHARE, CRASH_RATE, HIST_POINTS },
  };
  registerInvestment(MOD);
})();
