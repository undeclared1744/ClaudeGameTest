/* =====================================================================
   2. GAME STATE
   ===================================================================== */
const SAVE_VERSION = 1;
const LOCAL_KEY = "selfMadeTycoon.save.v1";

function freshState(keepLegacy = 0, keepEarnedAll = 0, keepStats = {}, keepScoutXp = 0) {
  const now = Date.now();
  return {
    v: SAVE_VERSION,
    cash: 0,
    earnedRun: 0,               // earned since you last retired (unlocks tiers and upgrades)
    earnedAll: keepEarnedAll,   // earned ever (decides Legacy stars)
    legacy: keepLegacy,         // Legacy stars
    scoutXp: keepScoutXp,       // Deal sense experience (kept when you retire)
    biz: [],                    // businesses you own (see buyListing for the shape)
    nextBizId: 1,
    deals: [],                  // listings on the Deals board
    dealsRefreshAt: 0,          // when the board refreshes by itself
    scoutReadyAt: 0,            // when "Scout new deals" can be pressed again
    upgrades: {},               // { upgradeId: true }
    inv: {},                    // each investment module's own state, by id (see 20-invest.js)
    jobStep: 0, gig: 0,         // progress on the current hustle job
    nextEventAt: now + 60e3,    // first event comes after a minute
    boomUntil: 0,               // "hot economy" event: everything pays more until then
    stats: Object.assign({ taps: 0, jobs: 0, bought: 0, events: 0, retires: 0, checks: 0, fixes: 0, sold: 0, flipProfit: 0, startedAt: now }, keepStats),
    buyMode: "1",
    savedAt: now,
    lastTick: now,
  };
}
let state = freshState();


