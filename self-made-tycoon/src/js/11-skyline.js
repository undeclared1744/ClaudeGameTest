// ---------- The skyline: one building per business you own ----------
// Drawn on a canvas every frame by drawSkyline(dt), called from the main
// loop in 07-time.js. Layers, back to front:
//   sky gradient -> stars -> sun or moon -> clouds -> a hazy far-off city
//   -> your buildings -> the street -> coins from hustling -> the clock
// The sky runs a day/night cycle (see SKY_KEYS). The player can pin it to
// day, night, or their own clock in Stats > Look and feel (13-fx.js).
//
// Buildings animate: a new business rises out of the ground, expanding
// grows it smoothly, and a sold one sinks away. In calm mode (less motion)
// they just appear at their size and nothing twinkles.
const canvas = $("skyline"), ctx = canvas.getContext("2d");
const coins = [];          // little coins that fly up when you hustle (05-actions.js pushes { t, x })
let skyTime = 0;           // seconds since the page opened: drives twinkles and drifting clouds
// A fixed pseudo-random number in [0, 1) from a seed, so each building
// keeps the same windows and each star the same spot from frame to frame.
const seeded = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// ----- Day and night -----
// One full in-game day takes SKY_DAY_MS of real time. The phase runs from
// 0 (midnight) through 0.25 (sunrise), 0.5 (noon) and 0.75 (sunset) back
// to 1 = 0. It comes from the real clock, so it's the same after a reload
// and on every device, and needs nothing in the save.
const SKY_DAY_MS = 12 * 60 * 1000;     // 12 minutes per day: roughly 6 of daylight, 4 of night, 2 of dawn/dusk
// Key moments of the day. Colors in between are blended. top/bottom: the
// sky gradient. stars and lights (lit windows, street lamps) fade 0..1.
const SKY_KEYS = [
  { at: 0.00, top: "#070d1c", bottom: "#1d2a48", stars: 1,   lights: 1 },
  { at: 0.20, top: "#0d1530", bottom: "#2b2f55", stars: 0.9, lights: 1 },
  { at: 0.25, top: "#33416f", bottom: "#e58f63", stars: 0.3, lights: 0.7 },   // sunrise
  { at: 0.31, top: "#4f86c4", bottom: "#f4c995", stars: 0,   lights: 0.15 },
  { at: 0.40, top: "#3d8ad6", bottom: "#bfe1f5", stars: 0,   lights: 0 },
  { at: 0.60, top: "#3a86d2", bottom: "#c7e4f4", stars: 0,   lights: 0 },
  { at: 0.70, top: "#4a74b8", bottom: "#f0c88f", stars: 0,   lights: 0.2 },
  { at: 0.75, top: "#2f2f63", bottom: "#ee7f55", stars: 0.2, lights: 0.75 },  // sunset
  { at: 0.80, top: "#12173a", bottom: "#4b3560", stars: 0.8, lights: 1 },
  { at: 1.00, top: "#070d1c", bottom: "#1d2a48", stars: 1,   lights: 1 },
];
// Where we are in the day right now, following the player's setting
// (look.sky, from 13-fx.js): "cycle" (default), "clock", "day" or "night".
function dayPhase(now = Date.now()) {
  const mode = typeof look === "object" ? look.sky : "cycle";
  if (mode === "day") return 0.5;
  if (mode === "night") return 0.0;
  if (mode === "clock") { const d = new Date(now); return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; }
  return (now % SKY_DAY_MS) / SKY_DAY_MS;
}
// "#rrggbb" <-> [r, g, b], and blending between two colors (t = 0..1)
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbCss = (c, a = 1) => `rgba(${c.map(Math.round).join(",")},${a})`;
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// Sky colors and light levels for a phase, blended between the two key
// moments either side of it.
function skyAt(phase) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && phase >= SKY_KEYS[i + 1].at) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (phase - a.at) / (b.at - a.at)));
  const s = t * t * (3 - 2 * t);                // ease in and out so changes don't snap
  return {
    top: mixRgb(hexRgb(a.top), hexRgb(b.top), s),
    bottom: mixRgb(hexRgb(a.bottom), hexRgb(b.bottom), s),
    stars: a.stars + (b.stars - a.stars) * s,
    lights: a.lights + (b.lights - a.lights) * s,
  };
}
// The in-game time of day as a clock string ("6:40 PM"), for the sky's corner
function skyClockText(phase) {
  const mins = Math.floor(phase * 24 * 60), h = Math.floor(mins / 60), m = mins % 60;
  return `${(h + 11) % 12 + 1}:${String(m - m % 5).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Darker version of a sector color for building sides and roofs (cached:
// the same few colors are asked for every frame).
const shadeCache = new Map();
function shade(hex, f) {
  const key = hex + f;
  if (!shadeCache.has(key)) shadeCache.set(key, rgbCss(hexRgb(hex).map(v => v * f)));
  return shadeCache.get(key);
}

// ----- Building animation -----
// towers: business id -> what's on screen now { x, w, h } (eased toward the target)
// ghosts: buildings of businesses you sold, sinking away
const towers = new Map();
let ghosts = [];
let lastSkyState = null;            // when the whole state is swapped (retire, wipe, load) don't animate the difference
let lastTint = 0;                    // last time the terminal background was re-tinted

function drawSkyline(dt) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  skyTime += dt;
  const calm = typeof motionCalm === "function" && motionCalm();
  const now = Date.now();
  const phase = dayPhase(now), sky = skyAt(phase);
  const ground = h - 10;

  // The terminal panel's background follows the sky (a few times a second is plenty)
  if (now - lastTint > 500) {
    lastTint = now;
    document.documentElement.style.setProperty("--term-top", rgbCss(mixRgb(sky.top, [14, 21, 36], 0.55)));
  }

  // 1. sky
  const g = ctx.createLinearGradient(0, 0, 0, ground);
  g.addColorStop(0, rgbCss(sky.top)); g.addColorStop(1, rgbCss(sky.bottom));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // 2. stars: each twinkles on its own slow beat
  if (sky.stars > 0.02) {
    for (let i = 0; i < 46; i++) {
      const tw = calm ? 0.6 : 0.45 + 0.4 * Math.sin(skyTime * (0.6 + seeded(i + 7) * 1.4) + i);
      ctx.fillStyle = `rgba(255,255,255,${(sky.stars * (0.25 + 0.5 * tw)).toFixed(3)})`;
      ctx.fillRect(seeded(i) * w, seeded(i + 99) * ground * 0.6, 1.5, 1.5);
    }
  }

  // 3. sun (phase 0.22..0.78) or moon (the rest) on an arc across the sky
  const arc = (t, r) => [w * (0.06 + 0.88 * t), ground - Math.sin(Math.PI * t) * (ground * 0.8) + r];
  const sunT = (phase - 0.22) / 0.56;
  if (sunT > 0 && sunT < 1) {
    const r = Math.max(6, Math.min(14, h * 0.07)), [sx, sy] = arc(sunT, r);
    const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 4);
    glow.addColorStop(0, "rgba(255,226,150,.55)"); glow.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = glow; ctx.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
    ctx.fillStyle = "#ffe7a3"; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  } else {
    const moonT = ((phase + 1 - 0.78) % 1) / 0.44;          // 0.78 -> 0.22 the next morning
    if (moonT > 0 && moonT < 1) {
      const r = Math.max(5, Math.min(10, h * 0.05)), [mx, my] = arc(moonT, r);
      ctx.fillStyle = "#e9edf7"; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgbCss(sky.top); ctx.beginPath(); ctx.arc(mx + r * 0.45, my - r * 0.25, r * 0.85, 0, Math.PI * 2); ctx.fill();   // crescent
    }
  }

  // 4. clouds by day: soft blobs drifting slowly left to right
  const day = 1 - sky.lights;
  if (day > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${(0.55 * day).toFixed(3)})`;
    for (let i = 0; i < 4; i++) {
      const cw = 40 + seeded(i + 40) * 50, span = w + cw * 2;
      const cx = ((seeded(i + 50) * span + (calm ? 0 : skyTime * (4 + i * 2))) % span) - cw;
      const cy = 8 + seeded(i + 60) * ground * 0.35;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.5, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.18, cy - 5, cw * 0.25, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. a hazy far-off city behind yours, for depth
  // (kept low and faint so it never competes with your own buildings)
  ctx.fillStyle = rgbCss(mixRgb(sky.bottom, sky.top, 0.6), 0.35);
  for (let x = 0, i = 0; x < w; i++) {
    const bw = 12 + seeded(i + 300) * 18, bh = Math.min(70, ground * (0.08 + seeded(i + 400) * 0.14));
    ctx.fillRect(x, ground - bh, bw - 1, bh);
    x += bw;
  }

  // 6. your buildings
  // A different save was swapped in (retire, wipe, load, account sync):
  // start over without rising/sinking every building at once.
  const swapped = state !== lastSkyState;
  if (swapped) { towers.clear(); ghosts = []; lastSkyState = state; }
  if (!state.biz.length && !ghosts.length) {
    const msg = "Your skyline starts with your first business.";
    let size = 14;
    ctx.font = `${size}px 'JetBrains Mono', monospace`;
    while (ctx.measureText(msg).width > w - 20 && size > 9) ctx.font = `${--size}px 'JetBrains Mono', monospace`;   // shrink to fit
    ctx.fillStyle = day > 0.5 ? "rgba(20,32,58,.75)" : "#8c98b0"; ctx.textAlign = "center";
    ctx.fillText(msg, w / 2, ground * 0.55);
    ctx.textAlign = "left";
  }
  // building width shrinks when you own a lot, so they always fit
  const n = state.biz.length;
  const slot = n ? Math.min(34, (w - 16) / n) : 0;
  const startX = (w - slot * n) / 2;
  const tallest = ground - 14;
  const ease = calm ? 1 : 1 - Math.exp(-dt * 7);           // how far to move toward the target this frame
  const seen = new Set();
  state.biz.forEach((b, i) => {
    const ind = IND[b.ind];
    const tw = Math.max(2, slot * (0.55 + ind.tier * 0.07));
    const th = Math.min(tallest, (0.18 + ind.tier * 0.13) * tallest + Math.min(b.level, 100) / 100 * tallest * 0.25);
    const tx = startX + i * slot + (slot - tw) / 2;
    let t = towers.get(b.id);
    // a business bought just now rises from the ground; on page load or a
    // save swap the city is simply there
    if (!t) { t = { x: tx, w: tw, h: swapped || skyTime < 0.5 || calm ? th : 0 }; towers.set(b.id, t); }
    t.x += (tx - t.x) * ease; t.w += (tw - t.w) * ease; t.h += (th - t.h) * ease;
    t.b = b; t.ind = ind;
    seen.add(b.id);
    drawTower(t, ground, sky, now, calm, 1);
  });
  // businesses that are gone (sold) sink into the ground and fade
  for (const [id, t] of towers) if (!seen.has(id)) { towers.delete(id); if (!calm) ghosts.push({ ...t, fade: 1 }); }
  ghosts = ghosts.filter(gh => (gh.fade -= dt * 1.2) > 0);
  for (const gh of ghosts) { gh.h *= 1 - Math.min(1, dt * 3); drawTower(gh, ground, sky, now, calm, gh.fade); }

  // 7. the street, with lamps that glow at night
  ctx.fillStyle = rgbCss(mixRgb([10, 15, 27], [52, 58, 70], day)); ctx.fillRect(0, ground, w, 10);
  ctx.fillStyle = `rgba(255,255,255,${(0.08 + 0.12 * day).toFixed(3)})`;
  for (let x = 6; x < w; x += 22) ctx.fillRect(x, ground + 5, 10, 1);           // lane markings
  if (sky.lights > 0.05) {
    ctx.fillStyle = `rgba(255,214,140,${(0.8 * sky.lights).toFixed(3)})`;
    for (let x = 14; x < w; x += 64) ctx.fillRect(x, ground + 1, 3, 2);
  }

  // 8. coins from hustling: spin and rise out of the street
  if (!calm) for (const c of coins) {
    c.t += dt;
    const cx = w * (0.3 + c.x * 0.4), cy = ground - c.t * 110, spin = Math.abs(Math.cos(c.t * 9 + c.x * 6));
    ctx.globalAlpha = Math.max(0, 1 - c.t);
    ctx.fillStyle = "#f4b740";
    ctx.beginPath(); ctx.ellipse(cx, cy, 4 * spin + 0.6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  else for (const c of coins) c.t = 2;                     // calm: skip them
  while (coins.length && coins[0].t > 1) coins.shift();

  // 9. the in-game clock, top left (only while the day/night cycle is on)
  if (typeof look !== "object" || look.sky === "cycle" || look.sky === "clock") {
    ctx.font = `600 ${h < 100 ? 9 : 11}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = day > 0.5 ? "rgba(14,21,36,.6)" : "rgba(223,230,242,.6)";
    ctx.fillText(skyClockText(phase), 8, h < 100 ? 12 : 16);
  }
}

// One building. t = { x, w, h, b (the business), ind (its industry) };
// alpha < 1 for a sold building fading out.
function drawTower(t, ground, sky, now, calm, alpha) {
  const { b, ind } = t;
  const x = t.x, bw = t.w, bh = t.h, y = ground - bh;
  if (bh < 1) return;
  const color = SECTORS[ind.sector].color, night = sky.lights;
  ctx.globalAlpha = alpha;
  // body: full color by day, darker at night; the right third is in shade
  ctx.fillStyle = color; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = shade(color, 0.72); ctx.fillRect(x + bw * 0.68, y, bw * 0.32, bh);
  if (night > 0) { ctx.fillStyle = `rgba(6,10,22,${(0.45 * night).toFixed(3)})`; ctx.fillRect(x, y, bw, bh); }
  // roof by size: a parapet on mid-size businesses, an antenna on the big ones
  if (ind.tier >= 2 && bw >= 6) { ctx.fillStyle = shade(color, 0.55); ctx.fillRect(x - 1, y - 2, bw + 2, 2); }
  if (ind.tier >= 4 && bh > 20) {
    ctx.fillStyle = shade(color, 0.5); ctx.fillRect(x + bw / 2 - 0.5, y - 9, 1, 9);
    if (night > 0.3 && (calm || Math.floor(skyTime * 1.2 + b.id) % 2)) { ctx.fillStyle = "#ff5a4a"; ctx.fillRect(x + bw / 2 - 1, y - 10, 2, 2); }   // blinking warning light
  }
  // a striped awning on small shops
  if (ind.tier <= 1 && bw >= 10 && bh > 14) {
    for (let sx = 0; sx < bw; sx += 3) { ctx.fillStyle = (sx / 3) % 2 ? "#fff" : shade(color, 0.6); ctx.fillRect(x + sx, ground - 9, Math.min(3, bw - sx), 3); }
  }
  // windows: lit and flickering at night, glassy by day
  if (bw >= 6) {
    const lit = `rgba(255,222,150,${(0.25 + 0.75 * night).toFixed(3)})`, glass = `rgba(255,255,255,${(0.28 * (1 - night)).toFixed(3)})`;
    const slow = calm ? 0 : skyTime;
    for (let wy = y + 4; wy < ground - (ind.tier <= 1 ? 12 : 4); wy += 6) {
      for (let wx = x + 2; wx < x + bw - 3; wx += 5) {
        const s = b.id * 31 + wx * 7 + wy * 13;
        // each window switches on/off on its own slow schedule (8-20 s)
        const on = seeded(s + Math.floor((slow + seeded(s) * 20) / (8 + seeded(s + 1) * 12))) > 0.45;
        if (night > 0.05 && on) { ctx.fillStyle = lit; ctx.fillRect(wx, wy, 2, 3); }
        else if (night < 0.95) { ctx.fillStyle = glass; ctx.fillRect(wx, wy, 2, 3); }
      }
    }
  }
  // viral: a beacon on the roof, plus searchlights at night
  if (now < (b.viralUntil || 0)) {
    const blink = calm ? 1 : Math.floor(skyTime * 4) % 2;
    ctx.fillStyle = blink ? "#f4b740" : "#fff";
    ctx.fillRect(x + bw / 2 - 2, y - 6, 4, 6);
    if (night > 0.3 && !calm) {
      const a = Math.sin(skyTime * 1.5) * 0.5;
      ctx.fillStyle = `rgba(255,236,170,${(0.18 * night).toFixed(3)})`;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x + bw / 2, y - 6);
        ctx.lineTo(x + bw / 2 + Math.sin(a * side + side * 0.3) * 200 - 8, y - 200);
        ctx.lineTo(x + bw / 2 + Math.sin(a * side + side * 0.3) * 200 + 8, y - 200);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}
