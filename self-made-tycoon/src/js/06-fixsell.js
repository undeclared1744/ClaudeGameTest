/* =====================================================================
   5b. FIX-UPS, DUE DILIGENCE AND SELLING
   The real-world loop: check a business out before you buy it, fix
   what's wrong with it, then sell it for more than you paid.
   ===================================================================== */
// Which problems a business (or a listing) has right now, as PROBLEMS ids.
// `showHidden` = include a hidden problem (owners always know; a listing
// only shows it after due diligence).
function problemsOf(b, showHidden = true) {
  const out = [];
  const q = QUIRKS[b.quirk];
  if (q && q.fix) out.push(q.fix);
  if (b.loc === 0) out.push("rough");
  if (b.hidden && showHidden) out.push(b.hidden);
  return out;
}
const hiddenMult = b => (b.hidden && PROBLEMS[b.hidden] ? PROBLEMS[b.hidden].penalty : 1);

// What a buyer would pay for business b today (after fees and haggling).
// Buyers value a business by what it earns compared with a plain one of
// its kind: the market price of that kind, times how much better or worse
// this one does (location, quirk, hidden problem), times its size (levels,
// with the milestone doublings). Your own upgrades, sector bonuses and
// Legacy stars don't come with the sale, so they don't count.
function saleValue(b) {
  return IND[b.ind].cost * b.incMult * hiddenMult(b) * levelMult(b.level) * SALE_MULT;
}
// What fixing problem p at business b costs, and how long the work takes
function fixCost(b, p) {
  return Math.max(10, IND[b.ind].cost * Math.sqrt(b.level) * PROBLEMS[p].costMult * priceMult());
}
const fixSeconds = (b, p) => FIX_SECONDS[IND[b.ind].tier] * PROBLEMS[p].timeMult;
const sellSeconds = b => SELL_SECONDS[IND[b.ind].tier];

// Cash from a sale: all of it is yours to spend, but only the PROFIT
// counts as "earned" (towards tiers, upgrades and Legacy stars), so
// buying and selling the same thing can't pump up your Legacy.
function addProceeds(amount, basis) {
  state.cash += amount;
  const profit = Math.max(0, amount - basis);
  state.earnedRun += profit;
  state.earnedAll += profit;
  return amount - basis;
}

// Due diligence on listing i: pay a little to find out what the seller
// isn't telling you.
const ddCost = l => (scoutPerk(6) ? 0 : Math.max(5, listingPrice(l) * DD_COST) * (scoutPerk(1) ? 0.5 : 1));
function checkListing(i) {
  const l = state.deals[i];
  if (!l || l.checked) return false;
  const cost = ddCost(l);
  if (cost > state.cash) { toast("Not enough cash for due diligence"); return false; }
  state.cash -= cost;
  l.checked = true;
  state.stats.checks++;
  gainScoutXp("check");
  toast(l.hidden ? `Due diligence found a problem: ${PROBLEMS[l.hidden].name.toLowerCase()}` : "Due diligence: no hidden problems. It's clean.");
  dealsKey = "";
  dirty = true;
  render(true);
  return true;
}

// Start fixing problem p at business id. The mini game comes first (see
// MINI GAMES below); this is called when you pass it, or straight away
// for a renovation, which has no game.
function startFix(id, p) {
  const b = state.biz.find(x => x.id === id);
  if (!b || !problemsOf(b).includes(p)) return false;
  if (b.fixing) { toast("One project at a time at each business"); return false; }
  if (b.selling) { toast("It's listed for sale. Take it off the market first."); return false; }
  const cost = fixCost(b, p);
  if (cost > state.cash) { toast("Not enough cash for the work"); return false; }
  state.cash -= cost;
  b.paid += cost;                      // what you've put into it, for working out profit when you sell
  b.fixing = { p, until: Date.now() + fixSeconds(b, p) * 1000 };
  dirty = true;
  render(true);
  return true;
}
// The work at business b is done: take the problem away.
function finishFix(b) {
  const p = b.fixing.p;
  b.fixing = null;
  if (p === "rough") {                       // the area's no better, but your storefront is
    b.incMult = b.incMult / LOCATIONS[0].inc * LOCATIONS[1].inc;
    b.loc = 1;
  } else if (PROBLEMS[p].hidden) {
    if (b.hidden === p) b.hidden = null;
  } else if (QUIRKS[b.quirk].fix === p) {    // the old quirk goes, "Turned around" replaces it
    b.incMult = b.incMult / QUIRKS[b.quirk].inc * QUIRKS[TURNED_AROUND].inc;
    b.quirk = TURNED_AROUND;
  }
  state.stats.fixes++;
  gainScoutXp("fix");
  toast(`${b.name}: ${PROBLEMS[p].name.toLowerCase()} fixed. It earns more and is worth more now.`);
  dirty = true;
}

// Put business id on the market. A buyer turns up after sellSeconds();
// the price is worked out when they do, so a fix that finishes first counts.
function listForSale(id) {
  const b = state.biz.find(x => x.id === id);
  if (!b || b.selling) return false;
  if (b.fixing) { toast("Finish the work first, or buyers will pay less"); return false; }
  b.selling = { until: Date.now() + sellSeconds(b) * 1000 };
  toast(`${b.name} is on the market. A buyer will turn up in ${duration(sellSeconds(b) * 1000)}.`);
  dirty = true;
  render(true);
  return true;
}
function cancelSale(id) {
  const b = state.biz.find(x => x.id === id);
  if (!b || !b.selling) return false;
  b.selling = null;
  toast(`${b.name} is off the market`);
  dirty = true;
  render(true);
  return true;
}
function finishSale(b) {
  const value = saleValue(b);
  const profit = addProceeds(value, b.paid);
  state.biz = state.biz.filter(x => x !== b);
  state.stats.sold++;
  state.stats.flipProfit += profit;
  gainScoutXp(profit > 0 ? "saleProfit" : "saleLoss");
  if (sheetBizId === b.id) closeSheet();
  showModal("Sold!", `${b.name} has a new owner. You put ${money(b.paid)} into it, so that's a ` +
    (profit >= 0 ? `profit of ${money(profit)}.` : `loss of ${money(-profit)}.`), "+" + money(value));
  dirty = true;
}
// Called every frame and after time away: finish any work or sales that are due.
function finishProjects(now = Date.now()) {
  for (const b of [...state.biz]) {
    if (b.fixing && now >= b.fixing.until) finishFix(b);
    if (b.selling && now >= b.selling.until && !modalOpen()) finishSale(b);
  }
}


