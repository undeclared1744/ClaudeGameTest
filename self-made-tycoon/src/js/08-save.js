/* =====================================================================
   7. SAVING  (same system as Paper Jam Tycoon)
   Always saved in this browser. If you're signed in to Claude, also
   saved to your account so the game follows you between devices.
   The newest save wins; a device in the background never pushes.
   ===================================================================== */
let dirty = false;
let saveDoc = null, cloudWriting = false, cloudAgain = false, finalSave = false;
const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem("selfMadeTycoon.device");
    if (!id) { id = Math.random().toString(36).slice(2); localStorage.setItem("selfMadeTycoon.device", id); }
    return id;
  } catch { return Math.random().toString(36).slice(2); }
})();

const encodeSave = s => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
const decodeSave = text => validState(JSON.parse(decodeURIComponent(escape(atob(text.trim())))));

// Check a loaded save and repair anything missing or broken, so a bad
// save can never crash the game.
function validState(s) {
  if (!s || typeof s !== "object" || typeof s.cash !== "number" || !Array.isArray(s.biz)) throw new Error("not a save");
  const base = freshState();
  // Copy onto a SECOND fresh state: `base` must stay untouched so the
  // repairs below can fall back to its default values. (Copying onto
  // `base` itself, as an older version did, meant a broken number such as
  // a negative cash total was "repaired" with itself and kept.)
  const out = Object.assign(freshState(), s);
  out.stats = Object.assign({}, base.stats, s.stats || {});
  out.biz = s.biz.filter(b => b && IND[b.ind]).map(b => ({
    id: Number(b.id) || 0, ind: b.ind, name: String(b.name || IND[b.ind].name), city: String(b.city || ""),
    loc: Math.min(3, Math.max(0, b.loc | 0)), quirk: Math.min(QUIRKS.length - 1, Math.max(0, b.quirk | 0)),
    incMult: Number.isFinite(b.incMult) && b.incMult > 0 ? b.incMult : 1,
    level: Math.max(1, Math.floor(Number(b.level) || 1)), paid: Number(b.paid) || 0,
    viralUntil: Number(b.viralUntil) || 0, inspectUntil: Number(b.inspectUntil) || 0,
    hidden: PROBLEMS[b.hidden]?.hidden ? b.hidden : null,
    fixing: b.fixing && PROBLEMS[b.fixing.p] && Number.isFinite(b.fixing.until) ? { p: b.fixing.p, until: b.fixing.until } : null,
    selling: b.selling && Number.isFinite(b.selling.until) ? { until: b.selling.until } : null,
    fixRetryAt: Number(b.fixRetryAt) || 0,
  }));
  out.nextBizId = Math.max(Number(s.nextBizId) || 1, ...out.biz.map(b => b.id + 1), 1);
  out.deals = Array.isArray(s.deals) ? s.deals.filter(l => l && IND[l.ind] && Number.isFinite(l.priceMult) && Number.isFinite(l.incMult))
    .map(l => Object.assign({}, l, { hidden: PROBLEMS[l.hidden]?.hidden ? l.hidden : null, checked: !!l.checked, offMarket: !!l.offMarket })) : [];
  out.inv = validInvestments(s.inv);
  out.upgrades = {};
  for (const id in (s.upgrades || {})) if (UPG[id]) out.upgrades[id] = true;
  for (const k of ["cash", "earnedRun", "earnedAll", "legacy", "scoutXp", "savedAt", "lastTick", "nextEventAt", "boomUntil", "dealsRefreshAt", "scoutReadyAt"]) {
    if (!Number.isFinite(out[k]) || out[k] < 0) out[k] = base[k];
  }
  if (!["1", "10", "max"].includes(out.buyMode)) out.buyMode = "1";
  return out;
}
function readLocal() {
  try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? validState(JSON.parse(raw)) : null; } catch { return null; }
}
function saveNow() {
  state.savedAt = Date.now();
  dirty = false;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch { /* blocked: account save still works */ }
  saveCloud();
}
async function saveCloud() {
  if (!saveDoc) return;
  if (document.visibilityState !== "visible" && !finalSave) return;
  if (cloudWriting) { cloudAgain = true; return; }
  cloudWriting = true;
  try {
    await saveDoc.set({ save: JSON.stringify(state), savedAt: state.savedAt, device: DEVICE_ID });
    setSaveLabel("Saved to your account");
  } catch { setSaveLabel("Saving on this device"); }
  finally { cloudWriting = false; if (cloudAgain) { cloudAgain = false; saveCloud(); } }
}
function adopt(newState, message) {
  if (sheetOpen()) closeSheet();
  state = newState;
  catchUp(false);
  if (!state.deals.length) refreshDeals();
  rebuildLists();
  if (message) toast(message);
}
async function connectCloud() {
  if (!window.claude?.use) return;
  try {
    const db = await claude.use("db");
    const user = await claude.use("user");
    if (!db || !user) { setSaveLabel("Saving on this device"); return; }
    saveDoc = db.collection("data/users/" + await user.id()).doc("tycoon");   // private to you
    const remote = parseRemote(await withTimeout(saveDoc.get(), 10000));
    if (remote && remote.savedAt > state.savedAt) adopt(remote, "Loaded your save from your account");
    else saveNow();
    setSaveLabel("Saved to your account");
    saveDoc.onSnapshot(s => {
      const data = s && (typeof s.data === "function" ? s.data() : s);
      if (!data || data.device === DEVICE_ID) return;
      const incoming = parseRemote(s);
      if (incoming && incoming.savedAt > state.savedAt) adopt(incoming, "Picked up your progress from another device");
    }, () => {});
  } catch { setSaveLabel("Saving on this device"); }
}
function parseRemote(snap) {
  try {
    const data = snap && (typeof snap.data === "function" ? snap.data() : snap);
    if (!data || !data.save) return null;
    const s = validState(JSON.parse(data.save));
    s.savedAt = data.savedAt || s.savedAt;
    return s;
  } catch { return null; }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
function setSaveLabel(text) { $("saveState").textContent = text; }

setInterval(() => { if (dirty || Date.now() - state.savedAt > 30e3) saveNow(); }, 30e3);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { finalSave = true; saveNow(); finalSave = false; } });
window.addEventListener("pagehide", () => { finalSave = true; saveNow(); finalSave = false; });


