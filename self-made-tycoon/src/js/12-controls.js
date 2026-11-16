/* =====================================================================
   9. CONTROLS
   Keyboard: Space = hustle, arrows = move between buttons, Enter = press,
             1-6 = tabs, O = take the offer (first event choice).
   Controller: A = press, X = hustle, B = take the offer, LB/RB = tabs,
               Y = expand amount, D-pad/left stick = move between buttons.
   ===================================================================== */
$("hustle").addEventListener("pointerdown", e => {
  e.preventDefault();
  if (modalOpen() || sheetOpen()) return;
  hustle(e.clientX, e.clientY);
  $("hustle").classList.add("pressed");
});
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) $("hustle").addEventListener(ev, () => $("hustle").classList.remove("pressed"));
$("hustle").addEventListener("click", e => { if (e.detail === 0) hustle(); });   // Enter/Space on the focused button
$("modalOk").addEventListener("click", () => $("modalBack").classList.remove("on"));
$("sheetClose").addEventListener("click", closeSheet);
$("sheetBack").addEventListener("click", e => { if (e.target === $("sheetBack")) closeSheet(); });   // tap outside the card
$("scout").addEventListener("click", scoutDeals);

// The tabs, in screen order. Hidden tabs (the Invest tab before any
// investment exists) are skipped by LB/RB and the number keys.
const tabOrder = () => [...document.querySelectorAll(".tab")].filter(t => !t.hidden).map(t => t.dataset.pane);
function showTab(name) {
  for (const tab of document.querySelectorAll(".tab")) tab.setAttribute("aria-selected", String(tab.dataset.pane === name));
  for (const pane of document.querySelectorAll(".pane")) pane.classList.toggle("on", pane.id === "pane-" + name);
  render(true);
}
for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => showTab(tab.dataset.pane));
const cycleTab = step => {
  const order = tabOrder();
  const i = order.findIndex(id => $("pane-" + id).classList.contains("on"));
  showTab(order[(i + step + order.length) % order.length]);
};
function setBuyMode(mode) { state.buyMode = mode; render(true); }
for (const b of document.querySelectorAll("#buymode button")) b.addEventListener("click", () => setBuyMode(b.dataset.mode));
function cycleBuyMode() {
  const modes = ["1", "10", "max"];
  setBuyMode(modes[(modes.indexOf(state.buyMode) + 1) % 3]);
  toast("Expanding " + (state.buyMode === "max" ? "as many levels as you can afford" : "x" + state.buyMode));
}

// Two-press buttons (the page can't show a browser "Are you sure?" box)
function armOrRun(btn, armedText, action) {
  if (btn.dataset.armed === "1") { btn.dataset.armed = ""; action(); render(true); return; }
  btn.dataset.armed = "1";
  btn.dataset.label = btn.textContent;
  btn.textContent = armedText;
  setTimeout(() => { if (btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.textContent = btn.dataset.label; render(true); } }, 4000);
}
$("retire").addEventListener("click", () => {
  if (legacyGain() < 1) { toast("Earn more first: you'd get no Legacy stars"); return; }
  armOrRun($("retire"), "Tap again to retire", retire);
});
$("wipe").addEventListener("click", () => armOrRun($("wipe"), "Tap again to wipe it all", () => {
  if (sheetOpen()) closeSheet();
  state = freshState(); refreshDeals(); if (activeEvent) closeEvent(); rebuildLists(); saveNow(); toast("Save wiped. Fresh start.");
}));
$("copySave").addEventListener("click", async () => {
  const code = encodeSave(state);
  try { await navigator.clipboard.writeText(code); toast("Save code copied"); }
  catch { $("importBox").value = code; $("importBox").select(); toast("Couldn't copy: the code is in the box, copy it from there"); }
});
$("importSave").addEventListener("click", () => {
  try {
    const s = decodeSave($("importBox").value);
    s.lastTick = Date.now();                 // no away-earnings for pasted saves
    adopt(s, "Save loaded");
    saveNow();
    $("importBox").value = "";
  } catch { toast("That doesn't look like a save code"); }
});

document.addEventListener("keydown", e => {
  if (e.target.tagName === "TEXTAREA") return;
  if (modalOpen()) { if (["Enter", " ", "Escape"].includes(e.key)) { e.preventDefault(); $("modalOk").click(); } return; }
  if (sheetOpen()) {            // inside the business sheet: arrows move, Enter/Space press, Escape closes
    const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (map[e.key]) { e.preventDefault(); moveFocus(map[e.key]); }
    if (e.key === "Escape") closeSheet();
    return;
  }
  const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  if (map[e.key]) { e.preventDefault(); moveFocus(map[e.key]); return; }
  if (e.key === " " && document.activeElement?.tagName !== "BUTTON") { e.preventDefault(); hustle(); return; }
  if (e.key === "o" || e.key === "O") chooseEvent(0);
  if (/^[1-9]$/.test(e.key) && tabOrder()[Number(e.key) - 1]) showTab(tabOrder()[Number(e.key) - 1]);
});

// Move focus to the nearest visible button in a direction
function moveFocus(dir) {
  // While the business sheet is open, only its own buttons can get focus
  const scope = sheetOpen() ? $("sheetBack") : document;
  const buttons = [...scope.querySelectorAll("button")].filter(b => b.offsetParent !== null || b.closest("#sheetBack"));
  const cur = buttons.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { (sheetOpen() ? buttons[0] : $("hustle"))?.focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const b of buttons) {
    if (b === cur) continue;
    const r = b.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    if ((dir === "left" && dx >= -4) || (dir === "right" && dx <= 4) || (dir === "up" && dy >= -4) || (dir === "down" && dy <= 4)) continue;
    const horiz = dir === "left" || dir === "right";
    const score = (horiz ? Math.abs(dx) : Math.abs(dy)) + (horiz ? Math.abs(dy) : Math.abs(dx)) * 3;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); }
}

// Game controller (standard layout: 0=A 1=B 2=X 3=Y 4=LB 5=RB 12-15=D-pad)
const padPrev = {};
let stickHeld = "";
function pollGamepads() {
  if (!navigator.getGamepads) return;
  for (const pad of navigator.getGamepads()) {
    if (!pad || pad.mapping !== "standard") continue;
    $("padHints").classList.add("on");
    const prev = padPrev[pad.index] || [];
    const down = pad.buttons.map(b => b.pressed);
    const pressed = i => down[i] && !prev[i];          // only the moment it goes down
    if (modalOpen()) { if (pressed(0) || pressed(1)) $("modalOk").click(); }
    else if (sheetOpen()) {     // business sheet: A presses, B closes, D-pad moves
      if (pressed(0)) { const el = document.activeElement; if (el && el.tagName === "BUTTON" && $("sheetBack").contains(el)) el.click(); }
      if (pressed(1)) closeSheet();
      if (pressed(12)) moveFocus("up");
      if (pressed(13)) moveFocus("down");
      if (pressed(14)) moveFocus("left");
      if (pressed(15)) moveFocus("right");
    }
    else {
      if (pressed(0)) { const el = document.activeElement; if (el && el.tagName === "BUTTON") el.click(); else hustle(); }
      if (pressed(2)) hustle();
      if (pressed(1)) chooseEvent(0);
      if (pressed(3)) cycleBuyMode();
      if (pressed(4)) cycleTab(-1);
      if (pressed(5)) cycleTab(1);
      if (pressed(12)) moveFocus("up");
      if (pressed(13)) moveFocus("down");
      if (pressed(14)) moveFocus("left");
      if (pressed(15)) moveFocus("right");
      const [x, y] = pad.axes;
      const dir = Math.abs(x) > 0.6 || Math.abs(y) > 0.6 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up")) : "";
      if (dir && dir !== stickHeld) moveFocus(dir);
      stickHeld = dir;
    }
    padPrev[pad.index] = down;
  }
}


