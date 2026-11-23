/* =====================================================================
   10. START UP
   ===================================================================== */
function start(hotData) {
  // After a live update of this page, carry on where you were; otherwise
  // load this browser's save and pay out the time you were away.
  const hot = hotData && hotData.state ? (() => { try { return validState(hotData.state); } catch { return null; } })() : null;
  if (hot) state = hot;
  else {
    const local = readLocal();
    if (local) state = local;
    else state.savedAt = 0;      // brand-new here: any save in your account wins over this empty one
  }
  catchUp(!hot);
  if (!state.deals.length) refreshDeals();
  rebuildLists();
  requestAnimationFrame(frame);
  connectCloud();
}
window.claude?.hot?.snapshot?.(() => ({ state }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});

// Handles for automated tests (harmless in normal play)
window.T = { get state() { return state; }, set state(s) { state = s; }, INDUSTRIES, UPGRADES, IND, hustle, buyListing, expandBiz, buyUpgrade,
  baseIncome, bizIncome, incomeNow, tapValue, listingPrice, listingIncome, expandCost, maxExpand, legacyGain, retire, earnBetween, upgradeAvailable,
  validState, encodeSave, decodeSave, catchUp, render, rebuildLists, refreshDeals, makeListing, makeEvent, chooseEvent, saveNow, short,
  tierUnlocked, sectorLevels, problemsOf, saleValue, fixCost, checkListing, startFix, finishProjects, listForSale, cancelSale, openSheet, closeSheet,
  tryFix, PROBLEMS, QUIRKS, LOCS: LOCATIONS, SCOUT_LEVELS, scoutLevel, gainScoutXp, ddCost,
  MODULES, inv, registerInvestment, investEarn, investTick, investNet, updateInvest, showTab, tabOrder, addCash, money, duration, esc, pick, NAME_PARTS, TIERS,
  // the game inside each business (15-runit.js)
  runTap, hireCrew, buyGear, takeRush, crewCost, crewMaxAfford, crewBonus, crewAdds, crewMult, runStage, runSaleMult, runUnit, runTapValue, gearCost,
  runDefaults, renderRun, setSheetMode, updateRush, RUN_THEMES, CREW_ROLES, GEAR_SLOTS, RUN_STAGES,
  get runRush() { return runRush; }, set runRushNextAt(t) { runRushNextAt = t; }, get sheetMode() { return sheetMode; },
  get activeEvent() { return activeEvent; }, set activeEvent(e) { activeEvent = e; }, showEvent,
  invTests: Object.fromEntries(MODULES.map(m => [m.id, m.test || {}])) };   // each investment's own test handles: T.invTests.<id>
