/* =====================================================================
   8. SCREEN
   ===================================================================== */
const $ = id => document.getElementById(id);

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function short(n) {
  if (!Number.isFinite(n)) return "∞";
  const neg = n < 0; n = Math.abs(n);
  let out;
  if (n < 10) out = n.toFixed(n > 0 && n < 1 ? 2 : 1).replace(/\.0$/, "");
  else if (n < 1e4) out = Math.floor(n).toLocaleString("en-US");
  else {
    const tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIXES.length) out = n.toExponential(2);
    else {
      let t = tier, s = n / Math.pow(1000, t);
      // 999,960 would round to "1000K": show it as "1.00M" instead
      if (Number(s.toFixed(s < 10 ? 2 : s < 100 ? 1 : 0)) >= 1000 && t + 1 < SUFFIXES.length) { t++; s /= 1000; }
      out = s.toFixed(s < 10 ? 2 : s < 100 ? 1 : 0) + SUFFIXES[t];
    }
  }
  return (neg ? "-" : "") + out;
}
const money = n => (n < 0 ? "-$" + short(-n) : "$" + short(n));
function duration(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
// Two-letter logo from a business name ("Harbor Laundromat" -> "HL")
function initials(name) {
  const words = name.replace(/^The /, "").split(/[\s&.-]+/).filter(w => /^[A-Za-z]/.test(w));
  return ((words[0] || "?")[0] + (words[1] ? words[1][0] : (words[0] || "?")[1] || "")).toUpperCase();
}
function logoHtml(name, sid) {
  // circle for small tiers, rounded square for the rest: just variety
  return `<div class="logo" style="background:${SECTORS[sid].color}; border-radius:${name.length % 2 ? "50%" : "10px"}">${esc(initials(name))}</div>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Deals ----------
let dealsKey = "";
function updateDeals() {
  const list = $("dealList");
  const key = state.deals.map(l => l.key).join(",");
  if (key !== dealsKey) {
    dealsKey = key;
    list.innerHTML = "";
    state.deals.forEach((l, i) => {
      const ind = IND[l.ind], deal = dealLabel(l), locn = LOCATIONS[l.loc], q = QUIRKS[l.quirk];
      const row = document.createElement("div");
      row.className = "biz";
      row.innerHTML = `${logoHtml(l.name, ind.sector)}
        <div><h3 class="cond">${esc(l.name)}</h3><div class="sub">${esc(ind.name)} · ${esc(l.city)} · ${SECTORS[ind.sector].name}</div></div>
        <button class="buy" id="deal-${i}"><span class="pr"></span><small>buy it</small></button>
        <div class="chips"><span class="chip ${deal.tone}">${deal.text}</span><span class="chip ${locn.tone}">${locn.name}</span>${l.quirk ? `<span class="chip ${q.tone}">${esc(q.name)}</span>` : ""}${
          l.offMarket ? `<span class="chip great">Off-market</span>` : ""}${
          !l.checked ? (l.hidden && scoutPerk(3) ? `<span class="chip bad">Something feels off</span>` : "") : l.hidden ? `<span class="chip bad">Hidden: ${esc(PROBLEMS[l.hidden].name)}</span>` : `<span class="chip good">Checked: clean</span>`}</div>
        <div class="line"></div>
        ${l.checked ? "" : `<div class="acts"><button class="smallbtn" id="dd-${i}"><span class="ddc"></span></button></div>`}`;
      row.querySelector(".buy").addEventListener("click", () => buyListing(i));
      row.querySelector(`#dd-${i}`)?.addEventListener("click", () => checkListing(i));
      list.appendChild(row);
    });
  }
  let affordable = 0;
  state.deals.forEach((l, i) => {
    const row = list.children[i];
    if (!row) return;
    const price = listingPrice(l), inc = listingIncome(l), can = price <= state.cash;
    if (can) affordable++;
    row.classList.toggle("affordable", can);
    const btn = row.querySelector(".buy");
    btn.setAttribute("aria-disabled", String(!can));
    btn.querySelector(".pr").textContent = money(price);
    const dd = row.querySelector(".ddc");
    if (dd) { const c = ddCost(l); dd.textContent = c ? `Due diligence · ${money(c)}` : "Due diligence · free"; dd.parentNode.setAttribute("aria-disabled", String(c > state.cash)); }
    const owned = ownedOf(l.ind);
    row.querySelector(".line").textContent = `Earns ${money(inc)}/sec · pays for itself in ${duration(price / inc * 1000)}` + (owned ? ` · you own ${owned} (${unitsOf(l.ind)} levels)` : "");
  });
  $("dealBadge").hidden = affordable === 0;
  $("dealBadge").textContent = affordable;
  const lv = scoutLevel(), L = SCOUT_LEVELS[lv], N = SCOUT_LEVELS[lv + 1], xp = state.scoutXp || 0;
  $("senseName").textContent = `Deal sense: ${L.name}`;
  $("senseXp").textContent = N ? `${xp} / ${N.xp} XP` : `${xp} XP · max level`;
  $("senseBar").style.width = (N ? (xp - L.xp) / (N.xp - L.xp) * 100 : 100) + "%";
  $("senseNext").textContent = N ? `Next: ${N.name}. ${N.perk} Earn XP by checking, buying, fixing and selling businesses.`
                                 : "You've seen it all. Every perk is yours.";
  const left = Math.max(0, state.dealsRefreshAt - Date.now());
  $("dealsTimer").textContent = `New listings in ${duration(left)}`;
  const wait = Math.ceil((state.scoutReadyAt - Date.now()) / 1000);
  $("scout").setAttribute("aria-disabled", String(wait > 0));
  $("scout").textContent = wait > 0 ? `Scout again in ${wait}s` : "Scout new deals";
  const top = tierUnlocked();
  const next = TIERS[top + 1];
  $("nextTier").textContent = next
    ? `Bigger businesses unlock at ${money(next.unlock)} earned (you're at ${money(state.earnedRun)}): ` +
      INDUSTRIES.filter(i => i.tier === top + 1).map(i => i.name.toLowerCase()).join(", ") + "."
    : "Every kind of business is unlocked. Time to own them all.";
}

// ---------- Empire (businesses you own) ----------
let empireKey = "";
function updateEmpire() {
  const list = $("empireList");
  // biggest earners first
  const sorted = [...state.biz].sort((a, b) => bizIncome(b) - bizIncome(a));
  const key = sorted.map(b => b.id).join(",");
  if (key !== empireKey) {
    empireKey = key;
    list.innerHTML = "";
    if (!sorted.length) list.innerHTML = `<p class="note">You don't own anything yet. Hustle for some cash, then buy something cheap from the Deals tab.</p>`;
    for (const b of sorted) {
      const ind = IND[b.ind];
      const row = document.createElement("div");
      row.className = "biz";
      row.dataset.id = b.id;
      row.innerHTML = `${logoHtml(b.name, ind.sector)}
        <div><h3 class="cond">${esc(b.name)} <span class="lvl" style="font-family:var(--mono);font-size:16px;color:var(--muted)"></span></h3>
        <div class="sub">${esc(ind.name)} · ${esc(b.city)} · ${esc(LOCATIONS[b.loc].name)}${b.quirk ? " · " + esc(QUIRKS[b.quirk].name) : ""}</div></div>
        <button class="buy" id="exp-${b.id}"><span class="pr"></span><small class="ct"></small></button>
        <div class="chips"></div><div class="line"></div>
        <div class="acts"><button class="smallbtn" id="mng-${b.id}">Manage · fix · sell</button></div>`;
      row.querySelector(".buy").addEventListener("click", () => expandBiz(b.id));
      row.querySelector(".acts button").addEventListener("click", () => openSheet(b.id));
      list.appendChild(row);
    }
  }
  const now = Date.now();
  for (const row of list.querySelectorAll(".biz")) {
    const b = state.biz.find(x => x.id === Number(row.dataset.id));
    if (!b) continue;
    const count = expandCount(b), cost = expandCost(b, count);
    const can = cost <= state.cash && (state.buyMode !== "max" || maxExpand(b) > 0);
    row.classList.toggle("affordable", can);
    row.querySelector(".lvl").textContent = "Lv " + b.level;
    const next = LEVEL_MILESTONES.find(m => m > b.level);
    row.querySelector(".line").textContent = `${money(bizIncome(b) * tempMult(b, now))}/sec` + (next ? ` · income doubles at level ${next}` : " · fully grown");
    const chips = [];
    if (now < b.viralUntil) chips.push(`<span class="chip great">Viral ${Math.ceil((b.viralUntil - now) / 1000)}s</span>`);
    if (now < b.inspectUntil) chips.push(`<span class="chip bad">Half income ${duration(b.inspectUntil - now)}</span>`);
    if (b.fixing) chips.push(`<span class="chip">Fixing: done in ${duration(b.fixing.until - now)}</span>`);
    if (b.selling) chips.push(`<span class="chip great">For sale: buyer in ${duration(b.selling.until - now)}</span>`);
    for (const p of problemsOf(b)) if (!(b.fixing && b.fixing.p === p)) chips.push(`<span class="chip bad">${esc(PROBLEMS[p].name)}</span>`);
    const chipBox = row.querySelector(".chips");
    const html = chips.join("");
    if (chipBox.innerHTML !== html) chipBox.innerHTML = html;
    const btn = row.querySelector(".buy");
    btn.setAttribute("aria-disabled", String(!can));
    btn.querySelector(".pr").textContent = money(cost);
    btn.querySelector(".ct").textContent = `expand +${count}`;
  }
  $("empireSummary").textContent = state.biz.length
    ? `${state.biz.length} business${state.biz.length > 1 ? "es" : ""} earning ${money(incomeNow())}/sec. Expanding adds a level; levels 10, 25, 50 and 100 each double that business.`
    : "";
}

// ---------- Upgrades ----------
let upgradeKey = "";
function updateUpgrades() {
  const offered = UPGRADES.filter(upgradeAvailable);
  const key = offered.map(u => u.id).join(",");
  const affordable = offered.filter(u => u.cost * 1 <= state.cash).length;
  $("upgBadge").hidden = affordable === 0;
  $("upgBadge").textContent = affordable;
  const pane = $("pane-upg");
  if (key !== upgradeKey) {
    upgradeKey = key;
    pane.innerHTML = "";
    if (!offered.length) pane.innerHTML = `<p class="note">No upgrades on offer yet. They show up as you earn more, and as each sector's businesses gain levels.</p>`;
    for (const u of offered) {
      const row = document.createElement("div");
      row.className = "biz";
      row.dataset.id = u.id;
      const color = u.kind === "sector" ? SECTORS[u.sector].color : "var(--ink)";
      row.innerHTML = `<div class="logo" style="background:${color};border-radius:10px">${u.kind === "sector" ? "x2" : "★"}</div>
        <div><h3 class="cond"></h3><div class="sub"></div></div>
        <button class="buy" id="up-${u.id}"><span class="pr"></span><small>buy</small></button>`;
      row.querySelector("h3").textContent = u.name;
      row.querySelector(".sub").textContent = u.desc;
      row.querySelector(".pr").textContent = money(u.cost);
      row.querySelector(".buy").addEventListener("click", () => buyUpgrade(u.id));
      pane.appendChild(row);
    }
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = `${Object.keys(state.upgrades).length} of ${UPGRADES.length} upgrades bought.`;
    pane.appendChild(note);
  }
  for (const row of pane.querySelectorAll(".biz")) {
    const can = UPG[row.dataset.id].cost <= state.cash;
    row.classList.toggle("affordable", can);
    row.querySelector(".buy").setAttribute("aria-disabled", String(!can));
  }
}

function updateRetire() {
  const gain = legacyGain();
  $("legNow").textContent = state.legacy;
  $("legGain").textContent = gain;
  $("legPct").textContent = Math.round(LEGACY_BONUS * 100) + "%";
  $("legNext").textContent = `Next star at ${money(earnedForLegacy(legacyTotalFor(state.earnedAll) + 1))} earned in total. You've earned ${money(state.earnedAll)}.`;
  const btn = $("retire");
  btn.setAttribute("aria-disabled", String(gain < 1));
  if (btn.dataset.armed !== "1") btn.textContent = gain < 1 ? "Not worth retiring yet" : `Retire for ${gain} star${gain > 1 ? "s" : ""}`;
}

function updateStats() {
  const items = [
    ["Cash", money(state.cash)], ["Earned this run", money(state.earnedRun)], ["Earned ever", money(state.earnedAll)],
    ["Income", money(incomeNow()) + "/sec"], ["Businesses", state.biz.length],
    ["Legacy", `★ ${state.legacy} (+${Math.round(state.legacy * LEGACY_BONUS * 100)}%)`],
    ["Deal sense", `${SCOUT_LEVELS[scoutLevel()].name} (${state.scoutXp || 0} XP)`],
    ["Hustles", state.stats.taps.toLocaleString("en-US")], ["Jobs finished", state.stats.jobs.toLocaleString("en-US")],
    ["Businesses bought", state.stats.bought], ["Businesses sold", state.stats.sold],
    ["Profit from selling", money(state.stats.flipProfit)], ["Problems fixed", state.stats.fixes], ["Due diligence checks", state.stats.checks],
    ["Events answered", state.stats.events], ["Times retired", state.stats.retires],
    ...investStats(),
    ["Playing since", new Date(state.stats.startedAt).toLocaleDateString()],
  ];
  $("stats").innerHTML = items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

function render(full) {
  const now = Date.now();
  $("cash").textContent = money(state.cash);
  $("ips").textContent = money(incomeNow(now) + investNet()) + "/sec";
  $("tapv").textContent = money(tapValue()) + " per hustle";
  $("owned").textContent = state.biz.length + (state.biz.length === 1 ? " business" : " businesses");
  const boom = Math.ceil((state.boomUntil - now) / 1000);
  $("boom").textContent = boom > 0 ? `HOT ECONOMY ${BOOM_MULT}x · ${duration(state.boomUntil - now)}` : "";
  const tier = tierUnlocked();
  $("rank").textContent = TIERS[tier].rank.toUpperCase() + (state.legacy ? `  ·  ★ ${state.legacy}` : "");
  $("jobText").textContent = TIERS[tier].gigs[state.gig % 4];
  $("jobBar").style.width = (state.jobStep / STEPS_PER_JOB * 100) + "%";
  if (activeEvent) $("evLeft") && ($("evLeft").textContent = `${Math.ceil(EVENT_VISIBLE - (now - eventShownAt) / 1000)}s`);
  for (const b of document.querySelectorAll("#buymode button")) b.setAttribute("aria-pressed", String(b.dataset.mode === state.buyMode));
  updateInvest(full);
  if (!full) return;
  updateDeals();
  updateEmpire();
  updateUpgrades();
  updateRetire();
  if ($("pane-set").classList.contains("on")) updateStats();
  renderSheet(false);
}
function rebuildLists() { dealsKey = empireKey = upgradeKey = investKey = ""; render(true); }

function showEvent() {
  const ev = activeEvent;
  $("evTitle").textContent = ev.title;
  $("evText").textContent = ev.text;
  const opts = $("evOpts");
  opts.innerHTML = "";
  ev.options.forEach((o, i) => {
    const b = document.createElement("button");
    b.textContent = o.label;
    b.id = "ev-opt-" + i;
    if (o.yes) b.className = "yes";
    b.addEventListener("click", () => chooseEvent(i));
    opts.appendChild(b);
  });
  const left = document.createElement("span");
  left.className = "left"; left.id = "evLeft";
  opts.appendChild(left);
  $("event").hidden = false;
}

function floatText(text, x, y) {
  const box = $("floats").getBoundingClientRect();
  const btn = $("hustle").getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "float";
  el.textContent = text;
  const px = (x ?? btn.left + btn.width / 2) - box.left + (Math.random() * 60 - 30);
  const py = (y ?? btn.top) - box.top - 24;
  el.style.left = Math.max(4, Math.min(box.width - 170, px - 40)) + "px";
  el.style.top = py + "px";
  $("floats").appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
let toastTimer = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2400);
}
function showModal(title, text, amount) {
  $("modalTitle").textContent = title;
  $("modalText").textContent = text;
  $("modalAmount").textContent = amount || "";
  $("modalBack").classList.add("on");
  $("modalOk").focus();
}
const modalOpen = () => $("modalBack").classList.contains("on");


