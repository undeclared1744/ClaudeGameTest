"""
sim.py - Load the real game page in a headless browser, check it starts
with no errors, then let a robot play hours of game time to check pacing.
The robot buys whichever deal, expansion or upgrade pays for itself fastest.
With runIt on, it also plays the game inside each business (15-runit.js):
it hires crew and buys gear when they pay back fastest, and does its
tapping inside its best business instead of on the Hustle button.

    python3 tests/sim.py            (needs: pip install playwright, and Chrome)
"""
import os
from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))

BOT = r"""
(args) => {
  const { tapsPerSec, hours, startLegacy, tapUntil, runIt } = args;
  const G = window.T;
  G.state = G.validState({ cash: 0, biz: [], legacy: startLegacy, earnedAll: startLegacy * startLegacy * 1e9 });
  G.refreshDeals();
  const s = () => G.state;
  const add = v => { s().cash += v; s().earnedRun += v; s().earnedAll += v; };
  const log = []; const seen = {};
  const mark = (k, t) => { if (!(k in seen)) { seen[k] = t; log.push([k, Math.round(t / 60)]); } };
  let t = 0;
  // hustles + job bonus; with runIt, the taps go into the best business's work button instead
  const bestBiz = () => s().biz.reduce((a, b) => (!a || G.bizIncome(b) > G.bizIncome(a) ? b : a), null);
  const taps = () => (t < tapUntil ? tapsPerSec : 0) * 1.5 * (runIt && s().biz.length ? G.runTapValue(bestBiz()) : G.tapValue());
  for (t = 0; t < hours * 3600; t++) {
    add(G.baseIncome() + taps());
    if (t % 150 === 0) G.refreshDeals();                    // board refreshes by itself
    if (t % 5 === 0) for (let guard = 0; guard < 60; guard++) {
      const inc = G.baseIncome() + taps();
      let best = null, bestPay = Infinity;
      s().deals.forEach((l, i) => {
        const cost = G.listingPrice(l), gain = G.listingIncome(l);
        if (cost / gain < bestPay) { bestPay = cost / gain; best = { cost, go: () => { s().cash -= cost; s().biz.push(G.runDefaults({ id: s().nextBizId++, ind: l.ind, name: l.name, city: l.city, loc: l.loc, quirk: l.quirk, incMult: l.incMult, level: 1, paid: cost })); s().deals[i] = G.makeListing(i < 2 ? "top" : "any"); } }; }
      });
      const lm = L => { let m = L; for (const ms of [10, 25, 50, 100]) if (L >= ms) m *= 2; return m; };
      for (const b of s().biz) {
        const cost = G.expandCost(b, 1);
        const gain = G.bizIncome(b) * (lm(b.level + 1) / lm(b.level) - 1);
        if (gain > 0 && cost / gain < bestPay) { bestPay = cost / gain; best = { cost, go: () => { s().cash -= cost; b.level++; } }; }
      }
      if (runIt) for (const b of s().biz) {              // crew and gear inside each business
        const now = G.bizIncome(b);
        G.CREW_ROLES.forEach((R, k) => {
          if (!(k === 0 || b.crew[k] > 0 || b.crew[k - 1] >= 3)) return;
          const cost = G.crewCost(b, k, 1);
          b.crew[k]++; const gain = G.bizIncome(b) - now; b.crew[k]--;
          if (gain > 0 && cost / gain < bestPay) { bestPay = cost / gain; best = { cost, go: () => { s().cash -= cost; b.crew[k]++; } }; }
        });
        G.GEAR_SLOTS.forEach((Gs, g) => {
          if (b.gear[g] || Gs.kind === "tap") return;      // tap gear: counted below as part of tapping
          const cost = G.gearCost(b, g);
          b.gear[g] = true; const gain = G.bizIncome(b) - now; b.gear[g] = false;
          if (gain > 0 && cost / gain < bestPay) { bestPay = cost / gain; best = { cost, go: () => { s().cash -= cost; b.gear[g] = true; } }; }
        });
      }
      for (const u of G.UPGRADES) {
        if (!G.upgradeAvailable(u)) continue;
        s().upgrades[u.id] = true; const gain = G.baseIncome() + taps() - inc; delete s().upgrades[u.id];
        const pay = gain > 0 ? u.cost / gain : u.cost / (inc * 0.03 + 1e-9);
        if (pay < bestPay) { bestPay = pay; best = { cost: u.cost, go: () => { s().cash -= u.cost; s().upgrades[u.id] = true; } }; }
      }
      if (!best || best.cost > s().cash) break;
      best.go();
    }
    mark("tier " + G.tierUnlocked(), t);
    if (s().biz.length) mark("first business", t);
    for (const n of [10, 25, 50]) if (s().biz.length >= n) mark(n + " businesses", t);
    const stars = Math.floor(Math.sqrt(s().earnedAll / 1e9));
    for (const k of [1, 5, 10, 20]) if (stars >= k) mark(k + " legacy stars total", t);
  }
  return { log, income: G.short(G.baseIncome()), biz: s().biz.length, upgrades: Object.keys(s().upgrades).length };
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 760})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(PAGE)
    page.wait_for_timeout(800)
    print("page errors:", errors or "none")
    page.evaluate("() => { window.toast = () => {}; }")
    for label, taps, hours, leg, until, run in [("ACTIVE 3 hustles/s", 3, 4, 0, 1e9, False), ("IDLE (hustles only the first 3 min)", 3, 4, 0, 180, False),
                                                ("ACTIVE, 2nd run with 10 stars", 3, 3, 10, 1e9, False),
                                                ("ACTIVE + RUNS ITS BUSINESSES (crew, gear, taps inside)", 3, 4, 0, 1e9, True),
                                                ("IDLE + crew and gear, no tapping after 3 min", 3, 4, 0, 180, True)]:
        r = page.evaluate(BOT, {"tapsPerSec": taps, "hours": hours, "startLegacy": leg, "tapUntil": until, "runIt": run})
        print(f"\n== {label}: after {hours}h income {r['income']}/s, {r['biz']} businesses, {r['upgrades']} upgrades")
        print("   " + ", ".join(f"{k} @{m}m" for k, m in r["log"]))
    print("page errors after sim:", errors or "none")
    browser.close()
