/* =====================================================================
   4. DEAL GENERATOR
   Makes one business for sale: a real kind of business from a tier you
   have unlocked, a made-up name, a city, a location and a quirk.
   ===================================================================== */
function makeName(ind) {
  return pick(ind.names).replace(/\{(\w+)\}/g, (_, part) => pick(NAME_PARTS[part]));
}
function pickQuirk() {
  let roll = Math.random() * QUIRK_WEIGHT;
  for (let i = 0; i < QUIRKS.length; i++) { roll -= QUIRKS[i].weight; if (roll < 0) return i; }
  return 0;
}
// tierBias: "top" = from your highest unlocked tier, "any" = any unlocked tier
function makeListing(tierBias) {
  const top = tierUnlocked();
  let tier = top;
  if (tierBias === "any") tier = Math.floor(Math.random() * (top + 1));
  // Industries you own fewer levels of come up more often: a 40-level
  // laundromat chain makes another laundromat very pricey, so the board
  // leans toward kinds of business you haven't built up yet.
  const choices = INDUSTRIES.filter(i => i.tier === tier);
  const weights = choices.map(i => 1 / (1 + unitsOf(i.id)));
  let roll = Math.random() * weights.reduce((a, w) => a + w, 0), ind = choices[0];
  for (let k = 0; k < choices.length; k++) { roll -= weights[k]; if (roll < 0) { ind = choices[k]; break; } }
  const loc = Math.min(3, Math.max(0, Math.round(Math.random() * 3 - 0.2)));   // "okay" and "good" most common
  const quirk = pickQuirk();
  const noise = 0.92 + Math.random() * 0.16 - (scoutPerk(4) ? 0.06 : 0);       // +/- 8% haggle room (less if you're a sharp negotiator)
  return {
    key: Math.random().toString(36).slice(2, 9),   // just to tell listings apart on screen
    ind: ind.id, name: makeName(ind), city: pick(NAME_PARTS.city), loc, quirk,
    incMult: LOCATIONS[loc].inc * QUIRKS[quirk].inc,
    priceMult: LOCATIONS[loc].price * QUIRKS[quirk].price * noise,
    // What the seller isn't telling you (null = nothing). The asking price
    // doesn't reflect it, so a hidden problem makes it a worse deal than it looks.
    hidden: Math.random() < HIDDEN_CHANCE ? pick(HIDDEN_PROBLEMS) : null,
    checked: false,                                // due diligence done?
  };
}
// Fill the board: half from your top tier, half from any unlocked tier.
// Deal sense adds listings, and at "Well connected" the last one is an
// off-market deal: a seller who calls you before they call a broker.
function refreshDeals() {
  const slots = DEAL_SLOTS + upgradeTotal("slots", 0, (a, b) => a + b) + (scoutPerk(2) ? 1 : 0) + (scoutPerk(6) ? 1 : 0);
  state.deals = [];
  for (let i = 0; i < slots; i++) state.deals.push(makeListing(i < Math.ceil(slots / 2) ? "top" : "any"));
  if (scoutPerk(5)) { const l = state.deals[slots - 1]; l.offMarket = true; l.priceMult *= OFF_MARKET_DISCOUNT; }
  state.dealsRefreshAt = Date.now() + dealRefreshSeconds() * 1000;
  dealsKey = "";
}


