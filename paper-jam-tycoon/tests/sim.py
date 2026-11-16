"""
sim.py - Load the real game page in a headless browser, check it starts
with no errors, then let a robot "play" hours of game time to check pacing.

    python3 tests/sim.py
"""
import json, os, sys
from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))

BOT = r"""
(args) => {
  const { tapsPerSec, hours, startRep, tapUntil } = args; let t = 0;
  const P = window.PJ;
  P.state = P.validState({ cash: 0, owned: [], rep: startRep, earnedAll: startRep * startRep * 5e7 });
  const s = () => P.state;
  const add = v => { s().cash += v; s().earnedRun += v; s().earnedAll += v; };
  const log = []; const seen = {};
  const mark = (k, t) => { if (!(k in seen)) { seen[k] = t; log.push([k, Math.round(t / 60)]); } };
  const tapRate = () => (t < tapUntil ? tapsPerSec : 0) * (P.tapValue() * (1 + 5 / 8));   // taps + call bonus
  for (t = 0; t < hours * 3600; t++) {
    add(P.baseIncome() + tapRate());
    // Greedy buyer: keep buying whatever pays itself back fastest.
    for (let guard = 0; guard < 50; guard++) {
      const inc = P.baseIncome(), tapNow = tapRate();
      let best = null, bestPay = Infinity;
      P.TIERS.forEach((tier, i) => {
        const before = inc;
        s().owned[i]++; const gain = P.baseIncome() + tapRate() - before - tapNow; s().owned[i]--;
        const cost = P.costOf(i, 1);
        if (gain > 0 && cost / gain < bestPay) { bestPay = cost / gain; best = () => { s().cash -= cost; s().owned[i]++; }; best.cost = cost; best.name = tier.id; }
      });
      for (const u of P.UPGRADES) {
        if (!P.upgradeAvailable(u)) continue;
        s().upgrades[u.id] = true; const gain = P.baseIncome() + tapRate() - inc - tapNow; delete s().upgrades[u.id];
        const pay = gain > 0 ? u.cost / gain : (u.kind === "rushRate" || u.kind === "otTime" ? u.cost / (inc * 0.05 + 1e-9) : Infinity);
        if (pay < bestPay) { bestPay = pay; best = () => { s().cash -= u.cost; s().upgrades[u.id] = true; }; best.cost = u.cost; best.name = u.id; }
      }
      if (!best || best.cost > s().cash) break;
      best();
    }
    s().owned.forEach((n, i) => { if (n) mark("first " + P.TIERS[i].id, t); });
    const stars = Math.floor(Math.sqrt(s().earnedAll / 5e7));
    for (const k of [1, 5, 10, 20, 40]) if (stars >= k) mark("lifetime stars " + k, t);
  }
  return { log, income: P.short(P.baseIncome()), cash: P.short(s().cash), upgrades: Object.keys(s().upgrades).length };
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 760})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(PAGE)
    page.wait_for_timeout(800)
    print("page errors:", [e for e in errors if "fonts.g" not in e] or "none")
    for label, taps, hours, rep, until in [("ACTIVE 3 taps/s", 3, 6, 0, 1e9), ("IDLE (taps only the first 3 min)", 3, 6, 0, 180), ("ACTIVE, 2nd run with 12 stars", 3, 3, 12, 1e9)]:
        r = page.evaluate(BOT, {"tapsPerSec": taps, "hours": hours, "startRep": rep, "tapUntil": until})
        print(f"\n== {label}: after {hours}h income {r['income']}/s, {r['upgrades']} upgrades")
        print("   " + ", ".join(f"{k} @{m}m" for k, m in r["log"]))
    browser.close()
