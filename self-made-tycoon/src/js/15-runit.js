/* =====================================================================
   11b. RUN IT: THE GAME INSIDE EACH BUSINESS  (the engine)
   The numbers and words live in 14-runit-data.js. This file has:
     - the math (what crew and gear add, what they cost)
     - the actions (work, hire, buy gear, take a rush order)
     - the "Run it" view, which plays inside the business sheet
       (10-sheet.js), next to the "Fix & sell" view.

   What's saved, on each business b (see buyListing and validState):
     b.crew  = [n0, n1, n2, n3]   how many of each crew role you've hired
     b.gear  = [bool, bool, bool] which gear/system upgrades you own
     b.jobStep, b.job             progress on your own current job
   Everything else (rush orders, the timer for the next one) lives only
   while the view is open, like the events on the main screen.
   ===================================================================== */

// ---------- Save helpers ----------
// Give a business the Run-it fields it needs (new purchases, and old saves
// from before this feature, which have none of them).
function runDefaults(b) {
  b.crew = [0, 0, 0, 0];
  b.gear = [false, false, false];
  b.jobStep = 0;
  b.job = 0;
  return b;
}
// Copy the Run-it fields from a loaded save onto a repaired business,
// fixing anything broken (negative, not a number, wrong length...).
function runFromSave(src, out) {
  runDefaults(out);
  if (Array.isArray(src.crew)) out.crew = CREW_ROLES.map((_, k) => Math.max(0, Math.floor(Number(src.crew[k]) || 0)));
  if (Array.isArray(src.gear)) out.gear = GEAR_SLOTS.map((_, g) => !!src.gear[g]);
  out.jobStep = Math.min(STEPS_PER_JOB - 1, Math.max(0, Math.floor(Number(src.jobStep) || 0)));
  out.job = Math.max(0, Math.floor(Number(src.job) || 0));
  return out;
}
// The theme for a business (every kind has one; the fallback is only a
// safety net in case a new kind of business is added without one).
const RUN_FALLBACK = { verb: "Work", jobs: ["Help a customer", "Open up shop", "Do the books", "Close up for the night"],
  crew: ["Helper", "Staff", "Manager", "Second location"], gear: ["Better tools", "New software", "Big contracts"], rush: ["A big order just came in"] };
const runTheme = b => RUN_THEMES[b.ind] || RUN_FALLBACK;

// ---------- Math ----------
// The yardstick for crew and gear prices: what ONE more level of this
// business costs right now (Expand x1). Pricing hires in "levels" means
// they get dearer as you grow, exactly like expanding does, so the two
// stay in balance: early on, expanding is the better deal; once a
// business is big, a hire (which adds a share of EVERYTHING it makes)
// starts to beat another level. Negotiator upgrades count (expandCost
// already includes them).
const runUnit = b => expandCost(b, 1);
// Gear multipliers
const gearHas = (b, g) => !!(b.gear && b.gear[g]);
function gearMult(b, kind) {
  let m = 1;
  GEAR_SLOTS.forEach((G, g) => { if (G.kind === kind && gearHas(b, g)) m *= G.mult; });
  return m;
}
const crewGearMult = b => gearMult(b, "crew") * gearMult(b, "crew2");
// How many times a role's boost has doubled from milestones (10, 25, 50 hired)
const crewDoublings = n => CREW_MILESTONES.filter(m => n >= m).length;
// What role k adds to business b's income right now (0.3 = +30%)
function crewAdds(b, k) {
  const n = (b.crew && b.crew[k]) || 0;
  return n * CREW_ROLES[k].boost * Math.pow(2, crewDoublings(n)) * crewGearMult(b);
}
// Everything the crew adds together. bizIncome() multiplies by 1 + this.
function crewBonus(b) {
  if (!b.crew) return 0;
  let total = 0;
  for (let k = 0; k < CREW_ROLES.length; k++) total += crewAdds(b, k);
  return total;
}
const crewMult = b => 1 + crewBonus(b);
// Where the business stands (index into RUN_STAGES)
const runStage = b => RUN_STAGES.reduce((best, S, i) => crewBonus(b) >= S.bonus ? i : best, 0);
// What buyers pay extra for a business whose crew does the work
// (used by saleValue in 06-fixsell.js). Capped, so hiring can never be
// turned into a money machine by hiring and then selling.
const runSaleMult = b => 1 + Math.min(RUN_SALE_CAP, crewBonus(b) * RUN_SALE_SHARE);

// Cost of hiring `count` more of role k at business b. Each hire costs
// CREW_GROWTH times the one before, so it's a geometric series (same as
// expandCost in 03-math.js).
function crewCost(b, k, count) {
  const g = CREW_GROWTH;
  const first = runUnit(b) * CREW_ROLES[k].price * Math.pow(g, b.crew[k]);
  return first * (Math.pow(g, count) - 1) / (g - 1);
}
// The most of role k you can afford right now (0 if not even one)
function crewMaxAfford(b, k) {
  const first = crewCost(b, k, 1);
  if (state.cash < first) return 0;
  return Math.floor(Math.log(state.cash * (CREW_GROWTH - 1) / first + 1) / Math.log(CREW_GROWTH));
}
// How many a press of the hire button buys: follows the x1 / x10 / Max
// setting (the same one Expand uses; Y on a controller flips it).
const crewCount = (b, k) => state.buyMode === "max" ? Math.max(1, crewMaxAfford(b, k)) : Number(state.buyMode);
// Role k shows up once you've hired CREW_REVEAL of the role before it
// (or if you already have some of it, e.g. from an older save).
const crewVisible = (b, k) => k === 0 || b.crew[k] > 0 || b.crew[k - 1] >= CREW_REVEAL;
const gearCost = (b, g) => runUnit(b) * GEAR_SLOTS[g].price;

// What one press of the work button pays: a Hustle's worth, plus a slice
// of this business's own income (with viral/inspection/boom counted).
function runTapValue(b, now = Date.now()) {
  const own = bizIncome(b) * tempMult(b, now) * (isBoom(now) ? BOOM_MULT : 1) * RUN_TAP_SECONDS;
  return (tapValue() + own) * gearMult(b, "tap");
}

// ---------- Actions ----------
// Do one piece of work yourself at business id. (x, y) = where you
// tapped, for the coins; leave them out for keys and controllers.
function runTap(id, x, y) {
  const b = state.biz.find(z => z.id === id);
  if (!b) return false;
  const v = runTapValue(b);
  addCash(v);
  state.stats.runTaps = (state.stats.runTaps || 0) + 1;
  b.jobStep++;
  let label = "+" + money(v);
  if (b.jobStep >= STEPS_PER_JOB) {          // job done: bonus, and on to the next one
    const bonus = v * JOB_BONUS;
    addCash(bonus);
    state.stats.runJobs = (state.stats.runJobs || 0) + 1;
    b.jobStep = 0;
    b.job++;
    label = "Job done! +" + money(v + bonus);
  }
  runFloat(label, x, y, b.jobStep === 0);
  dirty = true;
  renderRun();
  return true;
}

// Hire crew role k at business id (how many: see crewCount)
function hireCrew(id, k) {
  const b = state.biz.find(z => z.id === id);
  if (!b || !CREW_ROLES[k] || !crewVisible(b, k)) return false;
  const count = crewCount(b, k), cost = crewCost(b, k, count);
  if (count < 1 || cost > state.cash) { toast("Not enough cash yet"); return false; }
  const before = b.crew[k], stageBefore = runStage(b);
  state.cash -= cost;
  b.paid += cost;                // what you've put in, for working out profit when you sell
  b.crew[k] += count;
  state.stats.crew = (state.stats.crew || 0) + count;
  const name = runTheme(b).crew[k];
  const hit = CREW_MILESTONES.find(m => before < m && b.crew[k] >= m);
  const stage = runStage(b);
  if (stage > stageBefore) toast(`${b.name}: ${RUN_STAGES[stage].name}! ${RUN_STAGES[stage].note}`);
  else if (hit) toast(`${hit} on the team: every ${name.toLowerCase()} adds double now`);
  else if (k < CREW_ROLES.length - 1 && before < CREW_REVEAL && b.crew[k] >= CREW_REVEAL && !b.crew[k + 1])
    toast(`New role to hire: ${runTheme(b).crew[k + 1]}`);
  runBurst(`crew-${k}`, hit ? "big" : "small");
  dirty = true;
  render(true);
  renderRun(true);
  return true;
}

// Buy gear/system upgrade g at business id
function buyGear(id, g) {
  const b = state.biz.find(z => z.id === id);
  if (!b || !GEAR_SLOTS[g] || gearHas(b, g)) return false;
  const cost = gearCost(b, g);
  if (cost > state.cash) { toast("Not enough cash yet"); return false; }
  state.cash -= cost;
  b.paid += cost;
  b.gear[g] = true;
  state.stats.gear = (state.stats.gear || 0) + 1;
  toast(`${runTheme(b).gear[g]}: ${GEAR_SLOTS[g].desc.toLowerCase()}`);
  runBurst(`gear-${g}`, "big");
  dirty = true;
  render(true);
  renderRun(true);
  return true;
}

// ---------- Rush orders ----------
// Only while a business's game is open: a timed button that pays a lump
// of that business's income. Not saved (like the main-screen events).
let runRush = null;          // { bizId, text, until } while one is up
let runRushNextAt = 0;       // when the next one can show up
const runRushGap = () => (RUSH_MIN + Math.random() * (RUSH_MAX - RUSH_MIN)) * 1000;
const runRushValue = b => bizIncome(b) * tempMult(b, Date.now()) * RUSH_SECONDS;
function updateRush(now) {
  if (!sheetOpen() || sheetMode !== "run") return;
  if (runRush && (now > runRush.until || runRush.bizId !== sheetBizId)) { runRush = null; runRushNextAt = now + runRushGap(); }
  if (!runRush && now >= runRushNextAt) {
    const b = state.biz.find(z => z.id === sheetBizId);
    if (b) runRush = { bizId: b.id, text: pick(runTheme(b).rush), until: now + RUSH_VISIBLE * 1000 };
  }
}
function takeRush() {
  if (!runRush) return false;
  const b = state.biz.find(z => z.id === runRush.bizId);
  runRush = null;
  runRushNextAt = Date.now() + runRushGap();
  if (!b) return false;
  const pay = runRushValue(b);
  addCash(pay);
  state.stats.runRushes = (state.stats.runRushes || 0) + 1;
  toast(`Rush order done: +${money(pay)}`);
  runBurst("runRushBtn", "big");
  dirty = true;
  renderRun(true);
  return true;
}

// ---------- The Run-it view (inside the business sheet) ----------
// Built once, then updated in place several times a second. Rebuilding
// the buttons on every update would make fast tapping drop presses and
// would lose keyboard/controller focus, so it only rebuilds when the
// LIST of things changes (a new role shows up, gear bought, a different
// business).
let runKey = "";
function runViewHtml(b) {
  const th = runTheme(b), ind = IND[b.ind];
  const roles = CREW_ROLES.map((R, k) => k).filter(k => crewVisible(b, k));
  const nextHidden = roles.length < CREW_ROLES.length ? roles.length : -1;
  const crewRows = roles.map(k => `<li class="crew-row">
      <div><strong>${esc(th.crew[k])}</strong> <span class="num crew-n" id="crewN-${k}"></span>
        <div class="crew-sub" id="crewSub-${k}"></div></div>
      <button class="buy run-buy" id="crew-${k}" data-crew="${k}"><span class="pr"></span><small class="ct"></small></button>
    </li>`).join("");
  const gearRows = GEAR_SLOTS.map((G, g) => gearHas(b, g)
    ? `<li class="gear-row owned"><div><strong>${esc(th.gear[g])}</strong><div class="crew-sub">${esc(G.desc)}</div></div><span class="chip great">Owned</span></li>`
    : `<li class="gear-row"><div><strong>${esc(th.gear[g])}</strong><div class="crew-sub">${esc(G.desc)}</div></div>
         <button class="buy run-buy" id="gear-${g}" data-gear="${g}"><span class="pr"></span><small class="ct">buy</small></button></li>`).join("");
  return `${sheetSwitchHtml("run")}
    <p class="sub">${esc(ind.name)} · ${esc(b.city)} · Lv ${b.level}</p>
    <div class="run-stage"><span class="chip" id="runStage"></span> <span class="note" id="runStageNote"></span></div>
    <p>Earns <strong class="num" id="runInc"></strong> · your crew adds <strong class="num" id="runBonus"></strong></p>
    <div class="run-work">
      <div class="run-job"><span id="runJob"></span><span class="num" id="runJobN"></span></div>
      <div class="run-bar"><i id="runJobBar"></i></div>
      <button class="hustle run-btn cond" id="runTap">${esc(th.verb)} <small id="runTapSub"></small></button>
      <div class="run-floats" id="runFloats"></div>
    </div>
    <div class="run-rush" id="runRush" hidden><button class="bigbtn go" id="runRushBtn"></button><span class="num" id="runRushLeft"></span></div>
    <div class="run-head"><h3 class="cond">Crew</h3>
      <span class="run-mode">Hire <button data-rm="1" id="rm1">x1</button><button data-rm="10" id="rm10">x10</button><button data-rm="max" id="rmmax">Max</button></span></div>
    <ul class="crew-list">${crewRows}</ul>
    ${nextHidden > 0 ? `<p class="note">Hire ${CREW_REVEAL} ${esc(th.crew[nextHidden - 1].toLowerCase())}s to unlock the next role.</p>` : ""}
    <h3 class="cond">Gear &amp; systems</h3>
    <ul class="crew-list">${gearRows}</ul>
    <p class="padhints run-pad" id="runPad">X work · RB rush order · Y hire amount · A press · B close</p>
    <p class="note">Crew and gear are priced like expanding: they cost more as this business grows. A hire adds a share of everything it makes,
      so hiring pays off best once a business is big. Buyers pay up to ${Math.round(RUN_SALE_CAP * 100)}% more for one that runs without you.</p>`;
}
// Draw or update the Run-it view. force = rebuild even if nothing in the
// list changed (after a purchase, so the new prices show right away).
function renderRun(force = false) {
  if (!sheetOpen() || sheetMode !== "run") return;
  const b = state.biz.find(z => z.id === sheetBizId);
  if (!b) { closeSheet(); return; }
  const key = [b.id, b.level, CREW_ROLES.map((_, k) => crewVisible(b, k) ? 1 : 0).join(""), b.gear.map(Number).join("")].join("|");
  const box = $("sheetBody");
  if (key !== runKey || !$("runTap")) {
    const focusId = document.activeElement?.id;
    runKey = key;
    $("sheetTitle").textContent = b.name;
    box.innerHTML = runViewHtml(b);
    wireSheetSwitch(b.id);
    // The work button: pointerdown so fast taps on a phone all count
    // (same trick as the Hustle button); click covers Enter/Space/A.
    const tapBtn = $("runTap");
    tapBtn.addEventListener("pointerdown", e => { e.preventDefault(); runTap(b.id, e.clientX, e.clientY); tapBtn.classList.add("pressed"); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) tapBtn.addEventListener(ev, () => tapBtn.classList.remove("pressed"));
    tapBtn.addEventListener("click", e => { if (e.detail === 0) runTap(b.id); });
    for (const btn of box.querySelectorAll("[data-crew]")) btn.addEventListener("click", () => hireCrew(b.id, Number(btn.dataset.crew)));
    for (const btn of box.querySelectorAll("[data-gear]")) btn.addEventListener("click", () => buyGear(b.id, Number(btn.dataset.gear)));
    for (const btn of box.querySelectorAll("[data-rm]")) btn.addEventListener("click", () => { setBuyMode(btn.dataset.rm); renderRun(); });
    $("runRushBtn").addEventListener("click", takeRush);
    // keep focus where it was (a hire button stays focused after hiring)
    if (focusId && $(focusId)) $(focusId).focus();
    else if (!$("sheetBack").contains(document.activeElement)) tapBtn.focus();
  }
  $("runPad").classList.toggle("on", $("padHints").classList.contains("on"));   // controller hints, once a controller is seen
  // ---- live numbers ----
  const th = runTheme(b), now = Date.now();
  const stage = runStage(b);
  $("runStage").textContent = RUN_STAGES[stage].name;
  $("runStage").className = "chip" + (stage >= 2 ? " great" : "");
  $("runStageNote").textContent = RUN_STAGES[stage].note;
  $("runInc").textContent = money(bizIncome(b) * tempMult(b, now)) + "/sec";
  $("runBonus").textContent = "+" + Math.round(crewBonus(b) * 100) + "%";
  $("runJob").textContent = th.jobs[b.job % th.jobs.length];
  $("runJobN").textContent = `${b.jobStep} / ${STEPS_PER_JOB}`;
  $("runJobBar").style.width = (b.jobStep / STEPS_PER_JOB * 100) + "%";
  $("runTapSub").textContent = "+" + money(runTapValue(b, now)) + " per press";
  for (const m of ["1", "10", "max"]) $("rm" + m).setAttribute("aria-pressed", String(state.buyMode === m));
  for (let k = 0; k < CREW_ROLES.length; k++) {
    const btn = $("crew-" + k);
    if (!btn) continue;
    const n = b.crew[k], count = crewCount(b, k), cost = crewCost(b, k, count);
    const can = cost <= state.cash && (state.buyMode !== "max" || crewMaxAfford(b, k) > 0);
    const next = CREW_MILESTONES.find(m => m > n);
    $("crewN-" + k).textContent = "x" + n;
    $("crewSub-" + k).textContent = `+${pct(CREW_ROLES[k].boost * Math.pow(2, crewDoublings(n)) * crewGearMult(b))} each · adds +${pct(crewAdds(b, k))} now` +
      (next ? ` · doubles at ${next}` : "");
    btn.setAttribute("aria-disabled", String(!can));
    btn.classList.toggle("affordable", can);
    btn.querySelector(".pr").textContent = money(cost);
    btn.querySelector(".ct").textContent = "hire +" + count;
  }
  for (let g = 0; g < GEAR_SLOTS.length; g++) {
    const btn = $("gear-" + g);
    if (!btn) continue;
    const cost = gearCost(b, g), can = cost <= state.cash;
    btn.setAttribute("aria-disabled", String(!can));
    btn.classList.toggle("affordable", can);
    btn.querySelector(".pr").textContent = money(cost);
  }
  // the rush order, if one's up for this business
  const rush = runRush && runRush.bizId === b.id ? runRush : null;
  const rushBox = $("runRush");
  if (!!rush !== !rushBox.hidden) rushBox.hidden = !rush;
  if (rush) {
    const label = `Rush: ${rush.text} · +${money(runRushValue(b))}`;
    if ($("runRushBtn").textContent !== label) $("runRushBtn").textContent = label;
    $("runRushLeft").textContent = Math.ceil((rush.until - now) / 1000) + "s";
  }
}
// Percent with one decimal when it's small (2.5%), whole numbers when big
const pct = x => (x * 100 < 10 ? (Math.round(x * 1000) / 10) : Math.round(x * 100)) + "%";

// The two buttons at the top of the sheet: "Run it" and "Fix & sell"
function sheetSwitchHtml(mode) {
  return `<div class="vswitch" role="tablist">
    <button class="vs-btn" id="vsRun" role="tab" aria-selected="${mode === "run"}">Run it</button>
    <button class="vs-btn" id="vsInfo" role="tab" aria-selected="${mode !== "run"}">Fix &amp; sell</button></div>`;
}
function wireSheetSwitch(id) {
  $("vsRun").addEventListener("click", () => setSheetMode("run"));
  $("vsInfo").addEventListener("click", () => setSheetMode("info"));
}
function setSheetMode(mode) {
  if (!sheetOpen() || sheetMode === "game" || sheetMode === mode) return;
  sheetMode = mode;
  runKey = ""; sheetKey = "";
  if (mode === "run") { runRushNextAt = Math.max(runRushNextAt, Date.now() + runRushGap()); renderRun(true); $("vsRun").focus(); }
  else { renderSheet(); $("vsInfo")?.focus(); }
}

// ---------- Little effects ----------
// "+$12" floating up from the work button (inside the sheet, so it
// scrolls with it), plus coins from the shared effects layer (13-fx.js).
function runFloat(text, x, y, big) {
  const btn = $("runTap"), box = $("runFloats");
  if (!btn || !box) return;
  const r = btn.getBoundingClientRect(), br = box.getBoundingClientRect();
  const px = (x ?? r.left + r.width / 2), py = (y ?? r.top + 10);
  const el = document.createElement("div");
  el.className = "float";
  el.textContent = text;
  el.style.left = Math.max(4, Math.min(br.width - 170, px - br.left - 40 + (Math.random() * 40 - 20))) + "px";
  el.style.top = (py - br.top - 24) + "px";
  box.appendChild(el);
  setTimeout(() => el.remove(), 1000);
  if (motionCalm()) return;
  coinPop(px, py, big ? 10 : 2 + (Math.random() < 0.5 ? 1 : 0), big ? 260 : 140, big ? 480 : 380);
  if (big) ring(px, py);
}
function runBurst(elId, size) {
  if (motionCalm()) return;
  const el = $(elId);
  const [x, y] = pressPoint(el);
  if (size === "big") { sparkle(x, y, 16, "#f4b740", 90); ring(x, y); }
  else coinPop(x, y, 4, 160, 300);
}
