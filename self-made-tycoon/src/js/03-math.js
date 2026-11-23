/* =====================================================================
   3. MATH
   ===================================================================== */
function roundNice(n) {
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}
const pick = list => list[Math.floor(Math.random() * list.length)];

// Combine every bought upgrade of one kind
function upgradeTotal(kind, start, combine) {
  let total = start;
  for (const id in state.upgrades) { const u = UPG[id]; if (u && u.kind === kind) total = combine(total, u.value); }
  return total;
}
const globalMult = () => upgradeTotal("global", 1, (a, b) => a * b) * (1 + LEGACY_BONUS * state.legacy);
const priceMult = () => upgradeTotal("price", 1, (a, b) => a * b);
const isBoom = (now = Date.now()) => now < state.boomUntil;
const tierUnlocked = () => TIERS.reduce((best, t, i) => state.earnedRun >= t.unlock ? i : best, 0);

// Sector levels (sum of levels of every business in that sector)
function sectorLevels(sid) {
  let total = 0;
  for (const b of state.biz) if (IND[b.ind].sector === sid) total += b.level;
  return total;
}
function sectorMult(sid) {
  let m = 1;
  for (const step of SECTOR_STEPS) if (state.upgrades[`sec_${sid}_${step.levels}`]) m *= 2;
  return m;
}
// Income multiplier from a business's own level: level x (2 for each milestone passed)
function levelMult(level) {
  let m = level;
  for (const ms of LEVEL_MILESTONES) if (level >= ms) m *= 2;
  return m;
}
// One business's income per second, without temporary effects (viral, inspection, boom).
// crewMult: what the crew you hired inside the business adds (15-runit.js).
function bizIncome(b) {
  const ind = IND[b.ind];
  return ind.income * b.incMult * hiddenMult(b) * levelMult(b.level) * crewMult(b) * sectorMult(ind.sector) * globalMult();
}
// Total steady income per second (no temporary effects)
function baseIncome() {
  let total = 0;
  for (const b of state.biz) total += bizIncome(b);
  return total;
}
// The income you are making right this moment, with temporary effects
function incomeNow(now = Date.now()) {
  let total = 0;
  for (const b of state.biz) total += bizIncome(b) * tempMult(b, now);
  return total * (isBoom(now) ? BOOM_MULT : 1);
}
function tempMult(b, now) {
  let m = 1;
  if (now < (b.viralUntil || 0)) m *= VIRAL_MULT;
  if (now < (b.inspectUntil || 0)) m *= 0.5;
  return m;
}
// What one press of Hustle pays
function tapValue() {
  const flat = 1 + upgradeTotal("tapFlat", 0, (a, b) => a + b);
  const mult = upgradeTotal("tapMult", 1, (a, b) => a * b);
  const pct = upgradeTotal("tapPct", 0, (a, b) => a + b);
  return (flat * mult * globalMult() + pct * baseIncome()) * (isBoom() ? BOOM_MULT : 1);
}

// How many businesses of an industry you own, and their levels added up
const ownedOf = indId => state.biz.filter(b => b.ind === indId).length;
function unitsOf(indId) {
  let total = 0;
  for (const b of state.biz) if (b.ind === indId) total += b.level;
  return total;
}
// Price of a listing on the Deals board right now
function listingPrice(l) {
  return IND[l.ind].cost * Math.pow(UNIT_GROWTH, unitsOf(l.ind)) * l.priceMult * priceMult();
}
// Income per second a listing would earn at level 1 if you bought it now.
// A hidden problem only counts once due diligence has found it: until
// then you don't know about it, and neither does this number.
const knownHiddenMult = l => (l.checked ? hiddenMult(l) : 1);
function listingIncome(l) {
  const ind = IND[l.ind];
  return ind.income * l.incMult * knownHiddenMult(l) * sectorMult(ind.sector) * globalMult();
}
// Cost to expand business b by `count` levels. Each level is UNIT_GROWTH
// times the one before, so the total is a geometric series:
//   first * (g^count - 1) / (g - 1)
function expandCost(b, count) {
  const g = UNIT_GROWTH;
  const first = IND[b.ind].cost * EXPAND_BASE * Math.pow(g, unitsOf(b.ind)) * priceMult();
  return first * (Math.pow(g, count) - 1) / (g - 1);
}
// The most levels you can afford for business b right now (0 if not even one)
function maxExpand(b) {
  const first = expandCost(b, 1);
  if (state.cash < first) return 0;
  return Math.floor(Math.log(state.cash * (UNIT_GROWTH - 1) / first + 1) / Math.log(UNIT_GROWTH));
}
const expandCount = b => state.buyMode === "max" ? Math.max(1, maxExpand(b)) : Number(state.buyMode);

// How good a deal a listing is: income per dollar compared with a plain one
function dealScore(l) { return l.incMult * knownHiddenMult(l) / l.priceMult; }
function dealLabel(l) {
  const s = dealScore(l);
  if (s >= 1.3) return { text: "Steal", tone: "great" };
  if (s >= 1.08) return { text: "Good deal", tone: "good" };
  if (s >= 0.93) return { text: "Fair price", tone: "" };
  return { text: "Overpriced", tone: "bad" };
}

// Legacy stars
const legacyTotalFor = earned => Math.floor(Math.sqrt(earned / LEGACY_DIVISOR));
const legacyGain = () => Math.max(0, legacyTotalFor(state.earnedAll) - state.legacy);
const earnedForLegacy = stars => stars * stars * LEGACY_DIVISOR;

// Deal sense level (0 = Rookie) and whether you have reached level n
const scoutLevel = () => SCOUT_LEVELS.reduce((best, L, i) => (state.scoutXp || 0) >= L.xp ? i : best, 0);
const scoutPerk = n => scoutLevel() >= n;
function gainScoutXp(kind) {
  const before = scoutLevel();
  state.scoutXp = (state.scoutXp || 0) + SCOUT_XP[kind];
  const after = scoutLevel();
  if (after > before) {
    toast(`Deal sense up: ${SCOUT_LEVELS[after].name}! ${SCOUT_LEVELS[after].perk}`);
    if (after === 2 || after === 6) refreshDeals();      // the extra listing shows up right away
  }
}
const dealRefreshSeconds = () => (scoutPerk(5) ? 100 : DEAL_REFRESH);
const scoutCooldown = () => (scoutPerk(5) ? SCOUT_COOLDOWN / 2 : SCOUT_COOLDOWN);

function upgradeAvailable(u) {
  if (state.upgrades[u.id]) return false;
  if (u.kind === "sector") return sectorLevels(u.sector) >= u.levels;
  return state.earnedRun >= u.need;
}
function eventInterval() {
  const faster = upgradeTotal("eventRate", 0, (a, b) => a + b);
  return (EVENT_MIN + Math.random() * (EVENT_MAX - EVENT_MIN)) / (1 + faster) * 1000;
}


