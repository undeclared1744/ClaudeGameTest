/* =====================================================================
   6. TIME
   ===================================================================== */
// Overlap in seconds between [from, to] and [from, until]
const overlap = (from, to, until) => Math.max(0, (Math.min(to, until) - from) / 1000);

// Add the income earned between two moments, counting viral spikes,
// inspections and booms that end part way through.
function earnBetween(from, to) {
  const seconds = Math.max(0, (to - from) / 1000);
  if (!seconds) return 0;
  let total = 0, boomExtra = 0;
  for (const b of state.biz) {
    const inc = bizIncome(b);
    let earned = inc * seconds;
    earned += inc * (VIRAL_MULT - 1) * overlap(from, to, b.viralUntil || 0);
    earned -= inc * 0.5 * overlap(from, to, b.inspectUntil || 0);
    total += earned;
  }
  boomExtra = baseIncome() * (BOOM_MULT - 1) * overlap(from, to, state.boomUntil);
  total += boomExtra;
  addCash(total);
  total += investEarn(seconds);        // rent, interest, dividends... (see 20-invest.js)
  return total;
}

function catchUp(showMessage) {
  const now = Date.now();
  const away = now - state.lastTick;
  if (away <= 0) { state.lastTick = now; return; }
  const capped = Math.min(away, OFFLINE_CAP_HOURS * 3600e3);
  const earned = earnBetween(state.lastTick, state.lastTick + capped);
  state.lastTick = now;
  // Work and sales that finished while you were away. (Income while away
  // was counted at the old rate, before the fix: a little on the safe side.)
  finishProjects(now);
  investTick(now);
  if (state.nextEventAt < now) state.nextEventAt = now + 20e3;
  if (now >= state.dealsRefreshAt) refreshDeals();
  if (showMessage && away > 60e3 && earned > 0) {
    const capNote = away > capped ? ` (pay is capped at ${OFFLINE_CAP_HOURS} hours)` : "";
    showModal("While you were out", `You were gone ${duration(away)}${capNote}. Your businesses kept the lights on.`, "+" + money(earned));
  }
}

let lastFrame = performance.now(), lastSlowRender = 0;
function frame(nowPerf) {
  const dt = Math.min(0.25, (nowPerf - lastFrame) / 1000);
  lastFrame = nowPerf;
  const now = Date.now();
  const gap = now - state.lastTick;
  if (gap > 60e3) catchUp(true);
  else if (gap > 0) { earnBetween(state.lastTick, now); state.lastTick = now; }
  if (now >= state.dealsRefreshAt) refreshDeals();
  finishProjects(now);
  investTick(now);
  updateEvent(now);
  updateRush(now);                   // rush orders in an open business (15-runit.js)
  render(false);
  if (nowPerf - lastSlowRender > 250) { lastSlowRender = nowPerf; render(true); }
  drawSkyline(dt);
  fxFrame(dt);                       // coin pops, confetti, cash flashes (13-fx.js)
  pollGamepads();
  requestAnimationFrame(frame);
}


