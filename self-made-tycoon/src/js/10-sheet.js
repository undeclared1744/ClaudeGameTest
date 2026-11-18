// ---------- The business sheet: manage one business ----------
// A pop-up card for one business you own, with two views you switch
// between with the buttons at the top:
//   "Run it"     - the incremental game inside the business (15-runit.js)
//   "Fix & sell" - what it's worth, what's wrong with it, buttons to fix
//                  things, and a button to sell it. The fix-up mini games
//                  play inside this same card.
let sheetBizId = 0;          // business shown on the sheet (0 = closed)
let sheetMode = "info";      // "run", "info" (Fix & sell) or "game" (a fix-up mini game is running)
let gameCleanup = null;      // stops a running mini game's timers
const sheetOpen = () => $("sheetBack").classList.contains("on");

// mode: "run" (the Run it button) or "info" (the Manage button)
function openSheet(id, mode = "info") {
  const b = state.biz.find(x => x.id === id);
  if (b && !Array.isArray(b.crew)) runDefaults(b);      // a business from a test or an odd save: give it a crew list
  sheetBizId = id;
  sheetMode = mode === "run" ? "run" : "info";
  runKey = ""; sheetKey = "";
  runRush = null;
  runRushNextAt = Date.now() + runRushGap();             // first rush order a little while after you walk in
  $("sheetBack").classList.add("on");
  renderSheet();
  // Focus: the work button in Run it; otherwise the first fix/sell button
  // (not the view switch, so A on a controller does something useful).
  const first = (sheetMode === "run" && $("runTap")) ||
    $("sheetBody").querySelector("button:not(.vs-btn):not([aria-disabled='true'])") || $("sheetClose");
  first.focus();
}
function closeSheet() {
  if (gameCleanup) { gameCleanup(); gameCleanup = null; }
  sheetBizId = 0;
  sheetMode = "info";
  runRush = null;
  $("sheetBack").classList.remove("on");
  render(true);
}
// Draw the info view. Called when it opens, after every action, and once
// a second while open (so timers count down). Keeps keyboard/controller
// focus on the same button across redraws.
let sheetKey = "";
function renderSheet(force = true) {
  if (sheetOpen() && sheetMode === "run") { renderRun(force); return; }   // the Run it view draws itself
  if (!sheetOpen() || sheetMode !== "info") return;
  const b = state.biz.find(x => x.id === sheetBizId);
  if (!b) { closeSheet(); return; }
  const ind = IND[b.ind], now = Date.now();
  const value = saleValue(b), probs = problemsOf(b);
  const focusId = document.activeElement?.id;
  $("sheetTitle").textContent = b.name;
  const rows = probs.map(p => {
    const P = PROBLEMS[p];
    const busy = b.fixing && b.fixing.p === p;
    const wait = Math.ceil(((b.fixRetryAt || 0) - now) / 1000);
    let btn;
    if (busy) btn = `<span class="chip">Work done in ${duration(b.fixing.until - now)}</span>`;
    else if (b.fixing || b.selling) btn = `<span class="chip">Busy</span>`;
    else if (wait > 0) btn = `<span class="chip">Try again in ${wait}s</span>`;
    else {
      const cost = fixCost(b, p), can = cost <= state.cash;
      btn = `<button class="smallbtn" id="fix-${p}" data-fix="${p}" aria-disabled="${!can}">${esc(P.fixLabel)} · ${money(cost)}</button>`;
    }
    return `<li><span class="chip bad">${esc(P.name)}</span>${P.hidden ? ' <small class="muted">(hidden by the seller)</small>' : ""}<div>${btn}</div></li>`;
  }).join("");
  const profit = value - b.paid;
  // Buyers pay extra for a crew that runs it without you (15-runit.js)
  const crewNote = runSaleMult(b) > 1.005 ? ` (that includes +${Math.round((runSaleMult(b) - 1) * 100)}% for the crew you built)` : "";
  let sell;
  if (b.selling) sell = `<p>On the market. A buyer turns up in <strong>${duration(b.selling.until - now)}</strong>.</p>
      <button class="bigbtn cond" id="sellCancel">Take it off the market</button>`;
  else sell = `<p>A buyer would pay about <strong>${money(value)}</strong> after fees${crewNote}.
      You've put in ${money(b.paid)}, so that's a <strong class="${profit >= 0 ? "up" : "down"}">${profit >= 0 ? "profit" : "loss"} of ${money(Math.abs(profit))}</strong>.
      Finding a buyer takes about ${duration(sellSeconds(b) * 1000)}; it keeps earning until then.</p>
      <button class="bigbtn go cond" id="sellBtn">List it for sale</button>`;
  const html = `${sheetSwitchHtml("info")}<p class="sub">${esc(ind.name)} · ${esc(b.city)} · ${esc(LOCATIONS[b.loc].name)} · ${esc(QUIRKS[b.quirk].name)} · Lv ${b.level}</p>
    <p>Earns <strong>${money(bizIncome(b) * tempMult(b, now))}/sec</strong> for you. Crew: <strong>${esc(RUN_STAGES[runStage(b)].name.toLowerCase())}</strong> (+${Math.round(crewBonus(b) * 100)}%).</p>
    <h3 class="cond">Problems</h3>
    ${probs.length ? `<ul class="probs">${rows}</ul><p class="note">Fixing one: pass a quick challenge, pay for the work, then wait for it to finish. A fixed business earns more and sells for more.</p>`
                   : `<p class="note">Nothing wrong here. Buyers like that.</p>`}
    <h3 class="cond">Sell it</h3>${sell}`;
  if (!force && html === sheetKey) return;
  sheetKey = html;
  $("sheetBody").innerHTML = html;
  wireSheetSwitch(b.id);
  for (const btn of $("sheetBody").querySelectorAll("[data-fix]")) btn.addEventListener("click", () => tryFix(b.id, btn.dataset.fix));
  $("sellBtn")?.addEventListener("click", () => armOrRun($("sellBtn"), "Tap again to list it", () => { listForSale(b.id); renderSheet(); }));
  $("sellCancel")?.addEventListener("click", () => { cancelSale(b.id); renderSheet(); });
  if (focusId && $(focusId)) $(focusId).focus();
  else if (sheetOpen() && !$("sheetBack").contains(document.activeElement)) ($("sheetBody").querySelector("button:not(.vs-btn)") || $("sheetClose")).focus();
}
// Fix button: renovations just start; everything else plays its mini game first.
function tryFix(id, p) {
  const b = state.biz.find(x => x.id === id);
  if (!b) return;
  if (fixCost(b, p) > state.cash) { toast("Not enough cash for the work"); return; }
  const game = PROBLEMS[p].game;
  if (!game) { startFix(id, p); renderSheet(); return; }
  sheetMode = "game";
  const box = $("sheetBody");
  box.innerHTML = "";
  gameCleanup = MINI_GAMES[game](box, passed => {
    gameCleanup = null;
    const b2 = state.biz.find(x => x.id === id);
    if (b2) {
      if (passed) { if (startFix(id, p)) toast(`Nice work. The fix for ${PROBLEMS[p].name.toLowerCase()} is under way: done in ${duration(fixSeconds(b2, p) * 1000)}.`); }
      else { b2.fixRetryAt = Date.now() + FIX_RETRY * 1000; toast(`That didn't go well. Try again in ${FIX_RETRY}s.`); }
    }
    sheetMode = "info";
    renderSheet();
    ($("sheetBody").querySelector("button:not(.vs-btn)") || $("sheetClose")).focus();
  });
}


/* ---------------------------------------------------------------------
   MINI GAMES
   Each one draws itself into `box`, then calls done(true) for a pass or
   done(false) for a fail. Each returns a cleanup function that stops its
   timers if the sheet is closed part way. Everything is plain buttons, so
   touch, mouse, keyboard (arrows + Enter) and a controller (D-pad + A)
   all work the same way.
   --------------------------------------------------------------------- */
const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Reviews: pick the best reply to each angry customer. good = fixes it,
// the other two sound reasonable but make it worse or do nothing.
const REVIEWS = [
  { text: "Waited 40 minutes and nobody even said sorry.", good: "Apologize, say what you changed, invite them back on the house", bad: "Explain that it was a really busy night", meh: "Thanks for the feedback!" },
  { text: "Rude guy at the counter. Never again.", good: "Apologize, say you've talked with the team, offer to make it right", bad: "Ask which employee so you can defend them", meh: "Sorry you feel that way." },
  { text: "Way overpriced for what you get.", good: "Thank them and point out the new lower-price option", bad: "Explain your costs went up and that's not your fault", meh: "We value all our customers." },
  { text: "Place was dirty. Gross.", good: "Apologize, say you hired a new cleaning crew, invite them back", bad: "Say it was clean when you checked", meh: "We'll pass this on." },
  { text: "They got my order wrong TWICE.", good: "Apologize, refund it, and say how you're double-checking orders now", bad: "Say mistakes happen to everyone", meh: "Please contact us privately." },
  { text: "Booked online and they lost my booking.", good: "Apologize, explain the booking fix, and give them priority next time", bad: "Say they must have typed it wrong", meh: "Hmm, that's odd." },
  { text: "The owner doesn't care about customers.", good: "Reply as the owner, by name, and ask how you can make it right", bad: "List everything you do for the community", meh: "Have a nice day." },
  { text: "Broken stuff everywhere. Fix it!", good: "Thank them: it's fixed now, and here's a photo", bad: "Say repairs are expensive and they should understand", meh: "Noted." },
];
function gameReviews(box, done) {
  const rounds = shuffle(REVIEWS).slice(0, 4);
  let i = 0, right = 0;
  const step = () => {
    if (i >= rounds.length) return done(right >= 3);
    const r = rounds[i];
    const opts = shuffle([["good", r.good], ["bad", r.bad], ["meh", r.meh]]);
    box.innerHTML = `<h3 class="cond">Answer the reviews (${i + 1} of ${rounds.length})</h3>
      <p class="note">Win back at least 3 of 4 customers. The best replies say sorry, say what changed, and invite them back.</p>
      <blockquote class="review">★☆☆☆☆ "${esc(r.text)}"</blockquote>
      <div class="gopts">${opts.map(([k, t], n) => `<button class="smallbtn" id="g-${n}" data-k="${k}">${esc(t)}</button>`).join("")}</div>`;
    for (const btn of box.querySelectorAll("[data-k]")) btn.addEventListener("click", () => {
      if (btn.dataset.k === "good") { right++; toast("They updated it to 4 stars!"); }
      else toast(btn.dataset.k === "bad" ? "They replied angrily. Ouch." : "No response. Nothing changed.");
      i++; step();
    });
    $("g-0").focus();
  };
  step();
  return () => {};
}

// Books: one charge was entered twice. Find it. 3 rounds, get 2 right.
const LEDGER_ITEMS = ["Rent", "Payroll", "Electric bill", "Water bill", "Supplies", "Insurance", "Internet", "Repairs", "Advertising", "Delivery fees",
                      "Card fees", "Cleaning", "Phone bill", "Software", "Inventory", "Uniforms"];
function gameBooks(box, done) {
  let round = 0, right = 0;
  const step = () => {
    if (round >= 3) return done(right >= 2);
    const items = shuffle(LEDGER_ITEMS).slice(0, 5).map(name => ({ name, amt: Math.round(50 + Math.random() * 3000) }));
    const twin = Math.floor(Math.random() * items.length);
    const lines = [...items];
    lines.splice(twin + 1 + Math.floor(Math.random() * (items.length - twin)), 0, { ...items[twin], dupe: true });   // the copy always comes after the original
    box.innerHTML = `<h3 class="cond">Clean up the books (${round + 1} of 3)</h3>
      <p class="note">One charge got entered twice. Tap either copy. Get 2 of 3 right.</p>
      <div class="ledger-lines">${lines.map((l, n) => `<button class="smallbtn line-btn" id="g-${n}" data-d="${l.dupe || l === items[twin] ? 1 : 0}"><span>${esc(l.name)}</span><span>$${l.amt.toLocaleString("en-US")}</span></button>`).join("")}</div>`;
    for (const btn of box.querySelectorAll("[data-d]")) btn.addEventListener("click", () => {
      if (btn.dataset.d === "1") { right++; toast("Found it. The books balance."); }
      else toast("That one was fine.");
      round++; step();
    });
    $("g-0").focus();
  };
  step();
  return () => {};
}

// Machine: a needle swings across a gauge. Press when it's in the green.
// Land 3 hits before you miss 3 times. The green zone shrinks each hit.
function gameMachine(box, done) {
  const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const speed = slow ? 0.35 : 0.6;          // gauge sweeps per second
  let hits = 0, misses = 0, zone = 0.24, zoneAt = 0.2 + Math.random() * 0.55, t0 = performance.now(), raf = 0, over = false;
  box.innerHTML = `<h3 class="cond">Repair the machines</h3>
    <p class="note">Press when the needle is in the green. 3 hits before 3 misses.</p>
    <div class="gauge"><i class="zone"></i><i class="needle"></i></div>
    <p class="gstat" id="gStat">Hits 0 of 3 · misses 0 of 3</p>
    <button class="bigbtn go cond" id="g-0">Tighten!</button>`;
  const zoneEl = box.querySelector(".zone"), needle = box.querySelector(".needle");
  const pos = () => { const x = ((performance.now() - t0) / 1000 * speed) % 2; return x < 1 ? x : 2 - x; };   // 0..1..0
  const drawZone = () => { zoneEl.style.left = zoneAt * 100 + "%"; zoneEl.style.width = zone * 100 + "%"; };
  const tick = () => { needle.style.left = pos() * 100 + "%"; raf = requestAnimationFrame(tick); };
  drawZone(); tick();
  $("g-0").addEventListener("click", () => {
    if (over) return;
    const p = pos();
    if (p >= zoneAt && p <= zoneAt + zone) { hits++; zone = Math.max(0.1, zone - 0.05); zoneAt = Math.random() * (1 - zone); drawZone(); }
    else misses++;
    $("gStat").textContent = `Hits ${hits} of 3 · misses ${misses} of 3`;
    if (hits >= 3 || misses >= 3) { over = true; cancelAnimationFrame(raf); setTimeout(() => done(hits >= 3), 300); }
  });
  $("g-0").focus();
  return () => { over = true; cancelAnimationFrame(raf); };
}

// Hiring: pick the best person you can afford. 3 rounds, get 2 right.
function gameHire(box, done) {
  let round = 0, right = 0;
  const makeRound = () => {
    for (;;) {   // keep rolling until there's exactly one right answer and a tempting wrong one
      const want = Math.random() < 0.5 ? "rel" : "exp";
      const budget = 18 + Math.floor(Math.random() * 8);
      const people = [0, 1, 2].map(() => ({ name: pick(NAME_PARTS.first) + " " + pick(NAME_PARTS.surname),
        rel: 1 + Math.floor(Math.random() * 5), exp: 1 + Math.floor(Math.random() * 5), wage: 14 + Math.floor(Math.random() * 16) }));
      const afford = people.filter(c => c.wage <= budget);
      if (!afford.length || new Set(people.map(c => c.name)).size < 3) continue;
      const best = Math.max(...afford.map(c => c[want]));
      if (afford.filter(c => c[want] === best).length !== 1) continue;
      if (!people.some(c => c.wage > budget && c[want] > best)) continue;   // the trap: better, but too expensive
      return { want, budget, people, answer: afford.find(c => c[want] === best) };
    }
  };
  const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
  const step = () => {
    if (round >= 3) return done(right >= 2);
    const r = makeRound();
    box.innerHTML = `<h3 class="cond">Hire a good manager (${round + 1} of 3)</h3>
      <p class="note">Budget: <strong>$${r.budget}/hr</strong>. Pick the most <strong>${r.want === "rel" ? "reliable" : "experienced"}</strong> person you can afford. Get 2 of 3 right.</p>
      <div class="gopts">${r.people.map((c, n) => `<button class="smallbtn cand" id="g-${n}" data-n="${n}"><strong>${esc(c.name)}</strong>
        <span>Reliable ${stars(c.rel)}</span><span>Experience ${stars(c.exp)}</span><span>Wants $${c.wage}/hr</span></button>`).join("")}</div>`;
    for (const btn of box.querySelectorAll("[data-n]")) btn.addEventListener("click", () => {
      const c = r.people[Number(btn.dataset.n)];
      if (c === r.answer) { right++; toast("Good hire."); }
      else toast(c.wage > r.budget ? "Over budget. You can't afford them." : "Someone else was a better fit.");
      round++; step();
    });
    $("g-0").focus();
  };
  step();
  return () => {};
}
const MINI_GAMES = { reviews: gameReviews, books: gameBooks, machine: gameMachine, hire: gameHire };

