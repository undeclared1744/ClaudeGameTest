// ---------- The skyline: one building per business you own ----------
const canvas = $("skyline"), ctx = canvas.getContext("2d");
const coins = [];          // little coins that fly up when you hustle
let skyTime = 0;
// A fixed pseudo-random number from a seed, so each building keeps the same windows
const seeded = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
function drawSkyline(dt) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  skyTime += dt;
  // night sky
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0b1120"); g.addColorStop(1, "#24304d");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {                         // stars
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.35 * seeded(i + Math.floor(skyTime / 3))})`;
    ctx.fillRect(seeded(i) * w, seeded(i + 99) * h * 0.55, 1.5, 1.5);
  }
  const ground = h - 10;
  ctx.fillStyle = "#0a0f1b"; ctx.fillRect(0, ground, w, 10);
  if (!state.biz.length) {
    const msg = "Your skyline starts with your first business.";
    let size = 14;
    ctx.font = `${size}px 'IBM Plex Mono', monospace`;
    while (ctx.measureText(msg).width > w - 20 && size > 9) ctx.font = `${--size}px 'IBM Plex Mono', monospace`;   // shrink to fit
    ctx.fillStyle = "#8794ad"; ctx.textAlign = "center";
    ctx.fillText(msg, w / 2, h / 2);
  } else {
    // building width shrinks when you own a lot, so they always fit
    const n = state.biz.length;
    const slot = Math.min(34, (w - 16) / n);
    const startX = (w - slot * n) / 2;
    const tallest = h - 24;
    state.biz.forEach((b, i) => {
      const ind = IND[b.ind];
      const bw = Math.max(2, slot * (0.55 + ind.tier * 0.07));
      const bh = Math.min(tallest, (0.18 + ind.tier * 0.13) * tallest + Math.min(b.level, 100) / 100 * tallest * 0.25);
      const x = startX + i * slot + (slot - bw) / 2, y = ground - bh;
      ctx.fillStyle = SECTORS[ind.sector].color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y, bw, bh);
      ctx.globalAlpha = 1;
      if (bw >= 6) {                                   // lit windows, twinkling slowly
        ctx.fillStyle = "#ffe6a8";
        for (let wy = y + 4; wy < ground - 4; wy += 6) {
          for (let wx = x + 2; wx < x + bw - 3; wx += 5) {
            if (seeded(b.id * 31 + wx * 7 + wy * 13 + Math.floor(skyTime / 4)) > 0.55) ctx.fillRect(wx, wy, 2, 3);
          }
        }
      }
      if (Date.now() < (b.viralUntil || 0)) {           // viral: a beacon on the roof
        ctx.fillStyle = Math.floor(skyTime * 4) % 2 ? "#f2b84b" : "#fff";
        ctx.fillRect(x + bw / 2 - 2, y - 6, 4, 6);
      }
    });
  }
  // coins from hustling
  for (const c of coins) {
    c.t += dt;
    ctx.fillStyle = "#f2b84b";
    ctx.beginPath(); ctx.arc(w * (0.3 + c.x * 0.4), ground - c.t * 120, 4, 0, Math.PI * 2); ctx.fill();
  }
  while (coins.length && coins[0].t > 1) coins.shift();
}


