/* =====================================================================
   13. MOTION AND FEEDBACK
   Makes the game feel alive without changing how it plays:
     - coins pop out of the Hustle button (a bigger shower when a job is done)
     - the cash number counts up and down smoothly instead of jumping,
       and flashes green on a big gain, red when you spend
     - buying a business: a burst of confetti where you tapped, and its
       card glows on the Empire tab; its building rises in the skyline
     - expanding: coins hop off the button; a level milestone (10/25/50/100)
       gets a star burst and the card bumps
     - upgrades and finished fix-ups: sparkles
     - selling a business: a shower of coins over the whole screen
   Plus the "Look and feel" settings (sky mode and motion) on the Stats tab.

   HOW IT FINDS OUT WHAT HAPPENED
   Rather than every action calling into this file, fxFrame() runs once a
   frame (from 07-time.js) and compares a few counters with last frame:
   hustles, jobs, businesses bought and sold, total levels, upgrades,
   fixes. That keeps the game rules free of drawing code, and catches
   every way of doing something (touch, mouse, keyboard, controller).
   Where to draw comes from the last button pressed (recorded below).

   Everything is drawn on one full-screen canvas (#fx) that ignores taps,
   and is only redrawn while something is flying, so it costs nothing at
   rest. In calm mode none of it runs: numbers change instantly.

   FOR OTHER FILES (investment cards):
     fxBurst(elementOrRect, "buy" | "sale" | "spark" | "coins")
     sparkline(canvas, values, { color })   draws a small price chart
     motionCalm()   true when animations should be skipped
   ===================================================================== */

// ----- Look and feel settings (this device only) -----
// sky:    "cycle" (12-minute day/night), "clock" (follows your real clock), "day", "night"
// motion: "auto" (follow the device's reduce-motion setting), "full", "calm"
const LOOK_KEY = "selfmade-look-v1";
const look = { sky: "cycle", motion: "auto" };
try {
  const saved = JSON.parse(localStorage.getItem(LOOK_KEY) || "{}");
  if (["cycle", "clock", "day", "night"].includes(saved.sky)) look.sky = saved.sky;
  if (["auto", "full", "calm"].includes(saved.motion)) look.motion = saved.motion;
} catch { /* private window or blocked storage: use the defaults */ }
const reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const motionCalm = () => look.motion === "calm" || (look.motion === "auto" && !!reduceQuery?.matches);
function applyLook() {
  document.documentElement.classList.toggle("calm", motionCalm());
  for (const b of document.querySelectorAll("[data-sky]")) b.setAttribute("aria-pressed", String(b.dataset.sky === look.sky));
  for (const b of document.querySelectorAll("[data-motion]")) b.setAttribute("aria-pressed", String(b.dataset.motion === look.motion));
  if (motionCalm()) clearFx();
}
function setLook(key, value) {
  look[key] = value;
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* not saved, still applied */ }
  applyLook();
}
for (const b of document.querySelectorAll("[data-sky]")) b.addEventListener("click", () => setLook("sky", b.dataset.sky));
for (const b of document.querySelectorAll("[data-motion]")) b.addEventListener("click", () => setLook("motion", b.dataset.motion));
reduceQuery?.addEventListener?.("change", applyLook);          // the player changes their device setting mid-game

// ----- Where the player last pressed -----
// Recorded before the button's own handler runs (capture phase), because
// buying rebuilds the list and the pressed button disappears.
let lastPress = null;        // { x, y, t, onHustle }
function notePress(e) {
  const btn = e.target.closest?.("button");
  const r = btn ? btn.getBoundingClientRect() : null;
  // a real tap has coordinates; a keyboard or controller press doesn't, so use the button's middle
  const x = e.clientX || (r ? r.left + r.width / 2 : 0), y = e.clientY || (r ? r.top + r.height / 2 : 0);
  lastPress = { x, y, t: performance.now(), onHustle: btn?.id === "hustle" };
}
document.addEventListener("pointerdown", notePress, true);
document.addEventListener("click", e => { if (e.detail === 0 || !lastPress || performance.now() - lastPress.t > 600) notePress(e); }, true);
// Where to put an effect: the recent press, or else the middle of a fallback element
function pressPoint(fallbackEl, maxAge = 700) {
  if (lastPress && performance.now() - lastPress.t < maxAge) return [lastPress.x, lastPress.y];
  const r = fallbackEl?.getBoundingClientRect?.();
  return r && r.width ? [r.left + r.width / 2, r.top + r.height / 2] : [innerWidth / 2, innerHeight / 2];
}

// ----- The effects layer -----
const fxCanvas = $("fx"), fxCtx = fxCanvas.getContext("2d");
let parts = [];              // everything flying right now
let fxDirty = false;         // the canvas has something on it that needs clearing
const MAX_PARTS = 360;       // safety cap so a flood of taps can't slow a phone down
const FX_COLORS = ["#f4b740", "#1d8656", "#3a8fb7", "#d35d8e", "#8e5ba8", "#ffffff"];
function addPart(p) {
  if (motionCalm()) return;
  if (parts.length >= MAX_PARTS) parts.shift();
  parts.push(p);
}
// n coins thrown up from (x, y). spread: how wide; up: how hard.
function coinPop(x, y, n = 3, spread = 140, up = 380) {
  for (let i = 0; i < n; i++) addPart({ kind: "coin", x, y, vx: (Math.random() - 0.5) * spread, vy: -up * (0.7 + Math.random() * 0.5),
    g: 1100, life: 0.9 + Math.random() * 0.3, age: 0, r: 5 + Math.random() * 2, spin: Math.random() * 6 });
}
// Confetti burst: little paper rectangles in the game's colors
function confetti(x, y, n = 26) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 260;
    addPart({ kind: "paper", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 160, g: 520, drag: 1.6, life: 1.1 + Math.random() * 0.5, age: 0,
      w: 4 + Math.random() * 4, h: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: FX_COLORS[i % FX_COLORS.length] });
  }
}
// Sparkles: four-pointed stars that grow and fade without falling
function sparkle(x, y, n = 10, color = "#f4b740", radius = 60) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * radius;
    addPart({ kind: "star", x: x + Math.cos(a) * d * 0.4, y: y + Math.sin(a) * d * 0.4, vx: Math.cos(a) * d * 1.2, vy: Math.sin(a) * d * 1.2 - 20,
      g: 0, drag: 2.5, life: 0.6 + Math.random() * 0.5, age: 0, r: 4 + Math.random() * 5, color });
  }
}
// An expanding ring, like a ripple, where something happened
function ring(x, y, color = "#f4b740", size = 70) { addPart({ kind: "ring", x, y, vx: 0, vy: 0, g: 0, life: 0.5, age: 0, size, color }); }
// A coin shower falling from the top of the screen (a sale)
function coinRain(n = 60) {
  for (let i = 0; i < n; i++) addPart({ kind: "coin", x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
    vx: (Math.random() - 0.5) * 60, vy: 100 + Math.random() * 200, g: 700, life: 2.2, age: 0, r: 6 + Math.random() * 3, spin: Math.random() * 6 });
}
// Public helper: a named celebration at an element (or a DOMRect / [x, y])
function fxBurst(target, kind = "spark") {
  let x, y;
  if (Array.isArray(target)) [x, y] = target;
  else { const r = target?.getBoundingClientRect ? target.getBoundingClientRect() : target; if (!r) return; x = r.left + r.width / 2; y = r.top + r.height / 2; }
  if (kind === "buy") { confetti(x, y); ring(x, y, "#1d8656"); }
  else if (kind === "sale") { coinRain(); ring(x, y, "#f4b740", 120); }
  else if (kind === "coins") coinPop(x, y, 6, 200, 420);
  else sparkle(x, y);
}
function clearFx() {
  parts = [];
  if (fxDirty) { fxCtx.setTransform(1, 0, 0, 1, 0, 0); fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); fxDirty = false; }
}
// Move and draw every particle. Only runs while something is on screen.
function drawFx(dt) {
  if (!parts.length) { if (fxDirty) clearFx(); return; }
  const dpr = window.devicePixelRatio || 1, w = innerWidth, h = innerHeight;
  if (fxCanvas.width !== Math.round(w * dpr) || fxCanvas.height !== Math.round(h * dpr)) { fxCanvas.width = Math.round(w * dpr); fxCanvas.height = Math.round(h * dpr); }
  const c = fxCtx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  fxDirty = true;
  for (const p of parts) {
    p.age += dt;
    if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const left = 1 - p.age / p.life;
    if (left <= 0) continue;
    c.globalAlpha = Math.min(1, left * 2.5);              // fade out over the last 40%
    if (p.kind === "coin") {
      // a gold coin seen spinning: squash its width with the spin
      p.spin += dt * 12;
      const sx = Math.max(0.15, Math.abs(Math.cos(p.spin)));
      c.fillStyle = "#b8840f"; c.beginPath(); c.ellipse(p.x, p.y, p.r * sx, p.r, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#f4b740"; c.beginPath(); c.ellipse(p.x, p.y, p.r * sx * 0.78, p.r * 0.78, 0, 0, Math.PI * 2); c.fill();
      if (sx > 0.5) { c.fillStyle = "#ffe39a"; c.fillRect(p.x - p.r * sx * 0.3, p.y - p.r * 0.45, Math.max(1, p.r * sx * 0.25), p.r * 0.5); }   // shine
    } else if (p.kind === "paper") {
      p.rot += p.vr * dt;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.rot * 1.7));   // flutter
      c.fillStyle = p.color; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
    } else if (p.kind === "star") {
      const r = p.r * (0.5 + Math.sin(Math.PI * (1 - left)) * 0.8);
      c.fillStyle = p.color; c.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }
      c.fill();
    } else if (p.kind === "ring") {
      c.strokeStyle = p.color; c.lineWidth = 3 * left;
      c.beginPath(); c.arc(p.x, p.y, p.size * (1 - left * left), 0, Math.PI * 2); c.stroke();
    }
  }
  c.globalAlpha = 1;
  parts = parts.filter(p => p.age < p.life && p.y < h + 60);
}

// ----- Cash that counts up -----
// The ticker shows shownCash() instead of the exact number. It chases the
// real cash on a log scale, so a jump from $1K to $5M rolls up through
// the thousands and millions in about a second, and spending $1B down to
// $1K rolls down just as fast. Steady income looks the same as before.
// Saves, prices and tests still use state.cash: this is only the display.
let cashShown = null, cashShownAt = 0, cashState = null;
function shownCash() {
  const real = state.cash, t = performance.now();
  const dt = Math.min(0.25, (t - cashShownAt) / 1000);
  cashShownAt = t;
  // calm mode, first frame, a whole new save, or anything odd (negative): show the exact number
  if (motionCalm() || cashShown === null || cashState !== state || !(cashShown >= 0) || !(real >= 0)) { cashShown = real; cashState = state; return real; }
  const from = Math.log1p(cashShown), to = Math.log1p(real);
  const next = from + (to - from) * (1 - Math.exp(-dt * 10));
  cashShown = Math.abs(to - next) < 2e-4 ? real : Math.expm1(next);   // close enough (0.02%): land on it
  return cashShown;
}
// Flash the ticker for a moment: "gain" (green) or "spend" (red)
let cashFlashTimer = 0;
function flashCash(kind) {
  const el = $("cash");
  el.classList.remove("gain", "spend");
  void el.offsetWidth;                     // restart the color transition
  el.classList.add(kind);
  clearTimeout(cashFlashTimer);
  cashFlashTimer = setTimeout(() => el.classList.remove("gain", "spend"), 380);
}

// ----- Watching for things to celebrate -----
let fxSnap = null;           // counters from last frame
function fxCounters() {
  let levels = 0;
  const lv = new Map();
  for (const b of state.biz) { levels += b.level; lv.set(b.id, b.level); }
  return { state, cash: state.cash, taps: state.stats.taps, jobs: state.stats.jobs, bought: state.stats.bought, sold: state.stats.sold,
    fixes: state.stats.fixes, upgrades: Object.keys(state.upgrades).length, levels, lv, ids: new Set(state.biz.map(b => b.id)) };
}
// Find a business's card on the Empire tab, if it's on screen
const empireRow = id => document.querySelector(`#empireList .biz[data-id="${id}"]`);
function flashRow(row, cls) {
  if (!row) return;
  row.classList.remove(cls); void row.offsetWidth; row.classList.add(cls);
  setTimeout(() => row.classList.remove(cls), 1500);
}

function fxFrame(dt) {
  const now = fxCounters();
  const was = fxSnap;
  fxSnap = now;
  // First frame, or a different save swapped in: nothing to celebrate, just remember
  if (!was || was.state !== now.state) { drawFx(dt); return; }
  const calm = motionCalm();

  // Hustles: a few coins from where you tapped (or the button, for keys/controller)
  const taps = Math.min(4, now.taps - was.taps);
  if (taps > 0 && !calm) {
    const btn = $("hustle").getBoundingClientRect();
    const fromTap = lastPress && lastPress.onHustle && performance.now() - lastPress.t < 300;
    const x = fromTap ? lastPress.x : btn.left + btn.width / 2, y = fromTap ? lastPress.y : btn.top + 8;
    for (let i = 0; i < taps; i++) coinPop(x, y, 2 + (Math.random() < 0.5 ? 1 : 0));
    if (now.jobs > was.jobs) { coinPop(x, y, 10, 260, 480); ring(x, y); }      // a finished job: bigger shower
  }

  // Bought a business: confetti where you pressed, and its card glows
  if (now.bought > was.bought) {
    if (!calm) fxBurst(pressPoint($("pane-deals")), "buy");
    const newIds = [...now.ids].filter(id => !was.ids.has(id));
    setTimeout(() => newIds.forEach(id => flashRow(empireRow(id), "is-new")), 30);   // after the list rebuilds
  }
  // Expanded (levels went up without a new purchase)
  else if (now.levels > was.levels) {
    let milestone = 0, grownId = 0;
    for (const [id, level] of now.lv) {
      const before = was.lv.get(id) ?? level;
      if (level > before) { grownId = id; if (LEVEL_MILESTONES.some(m => before < m && level >= m)) milestone = id; }
    }
    const row = empireRow(milestone || grownId);
    const at = pressPoint(row);
    if (!calm) { coinPop(at[0], at[1], 4, 160, 300); if (milestone) { sparkle(at[0], at[1], 16, "#f4b740", 90); ring(at[0], at[1]); } }
    if (milestone) flashRow(row, "bump");
  }

  if (now.upgrades > was.upgrades && !calm) { const at = pressPoint(null); sparkle(at[0], at[1], 14); ring(at[0], at[1], "#8e5ba8"); }
  if (now.fixes > was.fixes && !calm) { const r = $("skyline").getBoundingClientRect(); sparkle(r.left + r.width / 2, r.top + r.height / 2, 16, "#7fe0a3", r.width / 3); }
  if (now.sold > was.sold && !calm) fxBurst([innerWidth / 2, innerHeight / 2], "sale");

  // The cash flash: big jumps that aren't ordinary income
  const diff = now.cash - was.cash;
  const usual = (incomeNow() + investNet()) * Math.max(dt, 1 / 30) * 3 + tapValue() * 4 * (1 + JOB_BONUS);
  if (diff < -Math.max(0.5, usual * 0.1)) flashCash("spend");
  else if (diff > usual && diff > Math.abs(was.cash) * 0.02) flashCash("gain");

  drawFx(dt);
}

// ----- Sparkline: a small price chart for investment cards -----
// canvas: a <canvas> inside a sized box (e.g. <div class="chart">).
// values: numbers, oldest first. Line is green if it ended up, red if down.
function sparkline(canvasEl, values, opts = {}) {
  const c = canvasEl.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  if (!w || !h) return;
  if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) { canvasEl.width = Math.round(w * dpr); canvasEl.height = Math.round(h * dpr); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const v = (values || []).filter(Number.isFinite);
  if (v.length < 2) return;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi === lo) { hi += 1; lo -= 1; }                    // a flat line sits in the middle instead of dividing by zero
  const pad = 4, X = i => pad + i / (v.length - 1) * (w - pad * 2), Y = n => h - pad - (n - lo) / (hi - lo) * (h - pad * 2);
  const color = opts.color || (v[v.length - 1] >= v[0] ? "#1d8656" : "#c0433a");
  c.beginPath(); v.forEach((n, i) => (i ? c.lineTo(X(i), Y(n)) : c.moveTo(X(i), Y(n))));
  c.strokeStyle = color; c.lineWidth = 2; c.lineJoin = "round"; c.stroke();
  c.lineTo(X(v.length - 1), h); c.lineTo(X(0), h); c.closePath();      // soft fill under the line
  c.globalAlpha = 0.12; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
  c.fillStyle = color; c.beginPath(); c.arc(X(v.length - 1), Y(v[v.length - 1]), 3, 0, Math.PI * 2); c.fill();   // today's dot
}

applyLook();
