/* =====================================================================
   5. ACTIONS
   ===================================================================== */
function addCash(amount) {
  state.cash += amount;
  state.earnedRun += amount;
  state.earnedAll += amount;
}

function hustle(fromX, fromY) {
  const v = tapValue();
  addCash(v);
  state.stats.taps++;
  state.jobStep++;
  let label = "+" + money(v);
  if (state.jobStep >= STEPS_PER_JOB) {
    const bonus = v * JOB_BONUS;
    addCash(bonus);
    state.stats.jobs++;
    state.jobStep = 0;
    state.gig = Math.floor(Math.random() * 4);
    label = "Job done! +" + money(v + bonus);
  }
  floatText(label, fromX, fromY);
  coins.push({ t: 0, x: Math.random() });
  dirty = true;
}

// Buy the listing in slot i of the Deals board
function buyListing(i) {
  const l = state.deals[i];
  if (!l) return false;
  const price = listingPrice(l);
  if (price > state.cash) { toast("Not enough cash yet"); return false; }
  state.cash -= price;
  state.biz.push(runDefaults({     // runDefaults: crew, gear and job for the game inside it (15-runit.js)
    id: state.nextBizId++, ind: l.ind, name: l.name, city: l.city, loc: l.loc, quirk: l.quirk,
    incMult: l.incMult, level: 1, paid: price, viralUntil: 0, inspectUntil: 0,
    hidden: l.hidden || null,      // you find out about a hidden problem the day you take over
    fixing: null,                  // { p: problem id, until } while repair work is under way
    selling: null,                 // { until } while it's on the market
    fixRetryAt: 0,                 // after a failed mini game, when you can try again
  }));
  state.stats.bought++;
  gainScoutXp("buy");
  state.deals[i] = makeListing(i < Math.ceil(state.deals.length / 2) ? "top" : "any");   // a new listing takes its place
  dealsKey = "";
  if (l.hidden && !l.checked) showModal("Surprise!", `You took over ${l.name} and found out the seller left something out: ${PROBLEMS[l.hidden].name.toLowerCase()}. ` +
    "It earns less until you fix it (Empire tab, Manage). Next time, due diligence would have caught it.", "");
  else toast(`You bought ${l.name}. Run it from the Empire tab: hire a crew, buy gear, work a shift.`);
  dirty = true;
  render(true);
  return true;
}

function expandBiz(id) {
  const b = state.biz.find(x => x.id === id);
  if (!b) return false;
  const count = expandCount(b);
  const cost = expandCost(b, count);
  if (count < 1 || cost > state.cash) { toast("Not enough cash yet"); return false; }
  const before = b.level;
  state.cash -= cost;
  b.level += count;
  b.paid += cost;
  const hit = LEVEL_MILESTONES.find(m => before < m && b.level >= m);
  if (hit) toast(`${b.name} reached level ${hit}: its income doubled!`);
  dirty = true;
  render(true);
  return true;
}

function buyUpgrade(id) {
  const u = UPG[id];
  if (!u || !upgradeAvailable(u)) return false;
  if (u.cost > state.cash) { toast("Not enough cash yet"); return false; }
  state.cash -= u.cost;
  state.upgrades[id] = true;
  if (u.kind === "slots") refreshDeals();
  dirty = true;
  render(true);
  return true;
}

function scoutDeals() {
  const wait = Math.ceil((state.scoutReadyAt - Date.now()) / 1000);
  if (wait > 0) { toast(`Your broker needs ${wait}s to find more`); return; }
  refreshDeals();
  state.scoutReadyAt = Date.now() + scoutCooldown() * 1000;
  dirty = true;
  render(true);
}

// ---------- Events ----------
// An event is a little story with one or two choices. `options` are
// { label, yes (the green one), act() }. Ignoring it is always safe.
let activeEvent = null;        // the event on screen (not saved)
let eventShownAt = 0;

function makeEvent() {
  const owned = state.biz;
  const inc = baseIncome();
  const someBiz = () => pick(owned);
  const types = [];
  if (owned.length) {
    types.push(() => {           // someone wants to buy one of your businesses
      const b = someBiz();
      const offer = Math.max(b.paid * (1.6 + Math.random() * 1.4), bizIncome(b) * 900);
      return { title: "Buyout offer", text: `A buyer wants ${b.name} and offers ${money(offer)} cash. It earns ${money(bizIncome(b))}/sec for you now.`,
        options: [
          { label: `Sell for ${money(offer)}`, yes: true, act: () => {
              // You might have sold it yourself while this offer was up
              if (!state.biz.includes(b)) { toast("You don't own it any more"); return; }
              if (sheetBizId === b.id) closeSheet();
              state.biz = state.biz.filter(x => x !== b); addProceeds(offer, b.paid); state.stats.sold++; state.stats.flipProfit += offer - b.paid;
              showModal("Sold", `${b.name} has a new owner.`, "+" + money(offer)); } },
          { label: "Keep it", act: () => {} },
        ] };
    });
    types.push(() => {           // one business goes viral
      const b = someBiz();
      return { title: "Gone viral", text: `A video about ${b.name} blew up overnight. Lines out the door.`,
        options: [{ label: `Cash in: ${VIRAL_MULT}x for ${VIRAL_SECONDS}s`, yes: true, act: () => {
          b.viralUntil = Date.now() + VIRAL_SECONDS * 1000; toast(`${b.name} earns ${VIRAL_MULT}x for ${VIRAL_SECONDS} seconds`); } }] };
    });
    types.push(() => {           // inspection: pay now or lose half its income for a while
      const b = someBiz();
      const fix = Math.max(25, bizIncome(b) * 120);
      return { title: "Surprise inspection", text: `An inspector flagged problems at ${b.name}. Fix them now, or it runs at half income for ${INSPECTION_SECONDS / 60} minutes.`,
        options: [
          { label: `Fix it: ${money(fix)}`, yes: true, act: () => {
              if (state.cash < fix) { b.inspectUntil = Date.now() + INSPECTION_SECONDS * 1000; toast("Couldn't afford the fix: half income for now"); return; }
              state.cash -= fix; toast("Fixed. The inspector signed off."); } },
          { label: "Let it slide", act: () => { b.inspectUntil = Date.now() + INSPECTION_SECONDS * 1000; } },
        ] };
    });
    types.push(() => {           // risky partner pitch: double or nothing
      const stake = Math.max(50, inc * 90);
      return { title: "Partner pitch", text: `An old friend wants ${money(stake)} for a new venture. "Can't miss," they say. (It's a coin flip: win 3x or lose it.)`,
        options: [
          { label: `Back it: ${money(stake)}`, yes: true, act: () => {
              if (state.cash < stake) { toast("Not enough cash to back it"); return; }
              state.cash -= stake;
              if (Math.random() < 0.5) { addCash(stake * 3); showModal("It worked!", "The venture took off and paid you back three times over.", "+" + money(stake * 3)); }
              else showModal("It flopped", "The venture folded. Lesson learned.", "-" + money(stake)); } },
          { label: "Pass", act: () => {} },
        ] };
    });
    types.push(() => ({          // the whole economy runs hot for a bit
      title: "Hot economy", text: "Everyone's spending. Every business and every hustle pays more for a while.",
      options: [{ label: `Ride it: ${BOOM_MULT}x for ${BOOM_SECONDS}s`, yes: true, act: () => {
        state.boomUntil = Math.max(state.boomUntil, Date.now()) + BOOM_SECONDS * 1000; } }] }));
  }
  types.push(...investEvents());  // events from the investment modules
  types.push(() => {             // free money (always possible, even with no businesses)
    const pay = Math.max(tapValue() * 40, inc * 120);
    return { title: "Lucky break", text: "A customer you helped years ago sends a thank-you check.",
      options: [{ label: `Cash it: ${money(pay)}`, yes: true, act: () => { addCash(pay); } }] };
  });
  return pick(types)();
}
function updateEvent(now) {
  if (!activeEvent && now >= state.nextEventAt && !modalOpen() && !sheetOpen()) {
    activeEvent = makeEvent();
    eventShownAt = now;
    showEvent();
  }
  if (activeEvent && now - eventShownAt > EVENT_VISIBLE * 1000) closeEvent();   // ignored: nothing happens
}
function chooseEvent(i) {
  if (!activeEvent) return;
  const opt = activeEvent.options[i];
  if (!opt) return;
  state.stats.events++;
  opt.act();
  closeEvent();
  dirty = true;
  render(true);
}
function closeEvent() {
  activeEvent = null;
  state.nextEventAt = Date.now() + eventInterval();
  $("event").hidden = true;
}

// Retire: keep Legacy and lifetime earnings, lose everything else
function retire() {
  const gain = legacyGain();
  if (gain < 1) return;
  if (sheetOpen()) closeSheet();
  const stats = Object.assign({}, state.stats, { retires: state.stats.retires + 1 });
  const mode = state.buyMode;
  state = freshState(state.legacy + gain, state.earnedAll, stats, state.scoutXp);
  state.buyMode = mode;
  refreshDeals();
  if (activeEvent) closeEvent();
  rebuildLists();
  saveNow();
  showModal("Retired!", `You start over with ${state.legacy} Legacy stars. Everything earns ${Math.round(LEGACY_BONUS * 100 * state.legacy)}% more.`, "★ " + state.legacy);
}


