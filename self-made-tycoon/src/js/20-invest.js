

/* =====================================================================
   20. INVESTMENTS: the plug-in point for every other way to make money
   (real estate, loans, stocks, bonds, startups, franchising,
   commodities, partnerships, crypto).

   Each kind of investment lives in its own file in 30-investments/ and
   calls registerInvestment() once. It then gets its own card on the
   Invest tab, its own slice of the save, and a say in the main loop,
   all without editing the core files. That's what lets several people
   build different investments at the same time.

   A module is an object like this (every field but id/name is optional):

   registerInvestment({
     id: "bonds",                 // unique, used as the save key: state.inv.bonds
     name: "Bonds and CDs",       // heading on its Invest card
     order: 30,                   // cards are shown smallest order first
     unlockTier: 1,               // card is locked until this tier (see TIERS)
     fresh: () => ({ holdings: [] }),        // a new player's state for this module
     validate: saved => ({ ... }),           // clean up a loaded save: never trust
                                             // it, return a fresh-looking object.
                                             // If it throws, fresh() is used.
     earn(seconds) { ... },       // money in / out for a stretch of time (also
                                  // covers long times away, up to 8 hours in
                                  // one call). Use addCash() for income that
                                  // should count as earnings, or change
                                  // state.cash directly for spending. Return the
                                  // net amount for the "while you were out" total.
     tick(now) { ... },           // every frame and after time away: finish
                                  // timers, check for trouble, etc.
     netIncome: () => 0,          // $/sec it adds right now (shown in the ticker)
     render(card, full) { ... },  // draw into its card. full = false is every
                                  // frame (update numbers only), true is ~4x a
                                  // second and after actions (rebuild if needed).
     events: () => [ () => ({ title, text, options: [...] }) ],
                                  // extra pop-up events, same shape as makeEvent()
     stats: () => [["Bonds owned", 3]],      // extra rows on the Stats tab
     test: { ... },               // handles for automated tests: T.invTests.bonds
   });

   Read and change a module's state with inv("bonds"). It's created from
   fresh() the first time, so it's always there. Retiring and wiping the
   save start every module over from fresh().
   ===================================================================== */
const MODULES = [];
function registerInvestment(m) {
  if (!m || !m.id || MODULES.some(x => x.id === m.id)) throw new Error("registerInvestment: missing or duplicate id " + (m && m.id));
  MODULES.push(m);
  MODULES.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}
// A module's slice of the save (created on first use)
function inv(id) {
  if (!state.inv) state.inv = {};
  if (!state.inv[id]) {
    const m = MODULES.find(x => x.id === id);
    state.inv[id] = m && m.fresh ? m.fresh() : {};
  }
  return state.inv[id];
}
// Clean up every module's part of a loaded save (called from validState)
function validInvestments(saved) {
  const out = {};
  for (const m of MODULES) {
    const raw = saved && typeof saved === "object" ? saved[m.id] : undefined;
    try { out[m.id] = raw === undefined ? (m.fresh ? m.fresh() : {}) : (m.validate ? m.validate(raw) : raw); }
    catch { out[m.id] = m.fresh ? m.fresh() : {}; }
  }
  return out;
}
const investUnlocked = m => tierUnlocked() >= (m.unlockTier || 0);
// Main-loop hooks. A broken module must never stop the game, so each call
// is wrapped: an error is logged once and that module is skipped.
const moduleErrors = new Set();
function safely(m, fn) {
  try { fn(m); }
  catch (err) { if (!moduleErrors.has(m.id)) { moduleErrors.add(m.id); console.error(`Investment "${m.id}" failed:`, err); } }
}
const eachModule = fn => { for (const m of MODULES) safely(m, fn); };
function investEarn(seconds) {
  let total = 0;
  if (seconds > 0) eachModule(m => { if (m.earn) total += Number(m.earn(seconds)) || 0; });
  return total;
}
function investTick(now) { eachModule(m => m.tick && m.tick(now)); }
function investNet() { let t = 0; eachModule(m => { if (m.netIncome) t += Number(m.netIncome()) || 0; }); return t; }
function investEvents() { const out = []; eachModule(m => { if (m.events && investUnlocked(m)) out.push(...m.events()); }); return out; }
function investStats() { const out = []; eachModule(m => { if (m.stats) out.push(...m.stats()); }); return out; }

// The Invest tab: one card per module. The tab only shows up once at
// least one module is registered.
let investKey = "";
function updateInvest(full) {
  $("tab-invest").hidden = MODULES.length === 0;
  if (!MODULES.length) return;
  const box = $("investList");
  const key = MODULES.map(m => m.id + ":" + investUnlocked(m)).join(",");
  if (key !== investKey) {
    investKey = key;
    box.innerHTML = "";
    for (const m of MODULES) {
      const card = document.createElement("section");
      card.className = "card inv";
      card.id = "inv-" + m.id;
      card.dataset.id = m.id;
      if (!investUnlocked(m)) {
        card.innerHTML = `<h2 class="cond">${esc(m.name)}</h2><p class="note">Opens up once you've earned ${money(TIERS[m.unlockTier].unlock)} this run.</p>`;
      }
      box.appendChild(card);
    }
    full = true;
  }
  if (!$("pane-invest").classList.contains("on")) return;     // only draw what you can see
  for (const card of box.children) {
    const m = MODULES.find(x => x.id === card.dataset.id);
    if (m && m.render && investUnlocked(m)) safely(m, () => m.render(card, full));
  }
}
