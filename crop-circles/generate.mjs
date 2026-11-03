// Contribution Crop Circles: a year of contributions as a wheat field. At night a light glides over the field and
// each week's days lie down as it passes, then it draws a formation in the clearing the graph has
// parted around: twelve circles sized by each slice of the year. Dawn shows the whole year in gold.
//   node generate.mjs calendar.json [outdir]
// The gold field and the night field are painted here pixel by pixel (the palette of
// src/scripts/crop-circles); by night the marks are plain vector, and only the light and the
// marks' reveal move.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.SHARP_FROM || import.meta.url);
const sharp = require('sharp');

const [calPath = 'calendar.json', out = 'out'] = process.argv.slice(2);
const cal = JSON.parse(readFileSync(calPath));
mkdirSync(out, { recursive: true });

const W = 1760, H = 640, CELL = 24;
const CX = W / 2, CY = H / 2;
const CLEARING = 202; // the room the graph leaves round the formation

// The year splits at its middle week and flows round the clearing: rows fan apart near it and settle
// back to straight lines by the far ends, so every day keeps its row and order and none overlap.
const place = (col, row) => {
  const u = (col + .5 - cal.weeks.length / 2) * CELL, side = u < 0 ? -1 : 1, a = Math.abs(u);
  const dy = (row - 3) * CELL * (1 + .95 * Math.exp(-a / 150));
  return [CX + side * (a + Math.sqrt(Math.max(CLEARING * CLEARING - dy * dy, 0))), CY + dy];
};
// The field's tracks comb round it too.
const unpart = (x, y) => {
  const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy) || 1e-6;
  if (r <= CLEARING) return null;
  const k = Math.sqrt(r * r - CLEARING * CLEARING) / r;
  return [CX + dx * k, CY + dy * k];
};

// ---- the data ----
const days = cal.weeks.flatMap((w, col) => w.contributionDays.map((d) => ({ col, row: d.weekday, n: d.contributionCount })));
const active = days.filter((d) => d.n).map((d) => d.n).sort((a, b) => a - b);
const q = (p) => active[Math.floor(active.length * p)] ?? 1;
const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)]; // GitHub's own graph is quartiles too
const DOT = [0, 4.5, 6.5, 8.5, 10.5]; // a day's circle, by how busy it was
for (const d of days) {
  d.level = !d.n ? 0 : d.n <= q1 ? 1 : d.n <= q2 ? 2 : d.n <= q3 ? 3 : 4;
  [d.x, d.y] = place(d.col, d.row);
}
const marksDays = days.filter((d) => d.level);

// Twelve equal slices of the year, oldest at twelve o'clock, running clockwise.
const months = Array.from({ length: 12 }, () => 0);
days.forEach((d, i) => { months[Math.min(11, Math.floor(i / days.length * 12))] += d.n; });
const maxMonth = Math.max(...months, 1);

// ---- the formation: all of it inside the clearing ----
const R = 172, ORBIT = 118, PETAL = 44;
const main = { x: CX, y: CY, r: R, w: 7 };
const moons = months.map((v, i) => {
  const a = i / 12 * Math.PI * 2 - Math.PI / 2, r = 8 + 25 * Math.sqrt(v / maxMonth);
  return { a, x: CX + Math.cos(a) * ORBIT, y: CY + Math.sin(a) * ORBIT, r, w: 4 };
});
const petals = Array.from({ length: 6 }, (_, i) => {
  const a = i / 6 * Math.PI * 2 - Math.PI / 2;
  return { x: CX + Math.cos(a) * PETAL, y: CY + Math.sin(a) * PETAL, r: PETAL, w: 3.5 };
});
const rings = [main, ...moons, ...petals];
const discs = [{ x: CX, y: CY, r: 10 }, ...moons.map((m) => ({ x: m.x, y: m.y, r: m.r * .4 }))];

// ---- noise ----
const P = new Uint8Array(512); { let s = 7; const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) P[i] = p[i & 255]; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => P[P[a & 255] + (b & 255)] / 255;
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1 + 9, y * 2.1 + 4) * 0.3 + noise(x * 4.3 + 3, y * 4.3 + 8) * 0.15;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// After the sketch's palette (crop-circles/shader/standing.ts, depressions.ts), as its lighting grades them.
const PAL = {
  night: { dark: [.05, .066, .084], mid: [.098, .125, .152], hi: [.3, .37, .41], soil: [.022, .028, .037], deep: [.016, .02, .028] },
  dawn: { dark: [.52, .365, .175], mid: [.8, .615, .335], hi: [.97, .86, .6], soil: [.41, .29, .18], laidD: [.82, .68, .43], laidL: [1, .93, .73], deep: [.35, .235, .12] },
};

// ---- the marks' distance field, for the gold painting ----
const grid = new Map(), BIN = 40, key = (X, Y) => X * 4096 + Y;
for (const d of marksDays) {
  const gx = Math.floor(d.x / BIN), gy = Math.floor(d.y / BIN);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = key(gx + a, gy + b); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(d); }
}
function dayMark(x, y) {
  let best = 99, m = null;
  for (const d of grid.get(key(Math.floor(x / BIN), Math.floor(y / BIN))) || []) {
    const v = Math.hypot(x - d.x, y - d.y) - DOT[d.level];
    if (v < best) { best = v; m = d; }
  }
  return { d: best, m };
}
function formation(x, y) {
  if (Math.hypot(x - CX, y - CY) > R + 12) return { d: 99 };
  let best = 99, fx = CX, fy = CY;
  for (const r of rings) { const d = Math.abs(Math.hypot(x - r.x, y - r.y) - r.r) - r.w / 2; if (d < best) { best = d; fx = r.x; fy = r.y; } }
  for (const c of discs) { const d = Math.hypot(x - c.x, y - c.y) - c.r; if (d < best) { best = d; fx = c.x; fy = c.y; } }
  return { d: best, fx, fy };
}
const allSd = (x, y) => Math.min(dayMark(x, y).d, formation(x, y).d);

function standing(x, y, p) {
  // the whole field, tracks included, combs round the clearing
  const dist = Math.hypot(x - CX, y - CY);
  const un = unpart(x, y) || [x, y], blend = smooth(CLEARING, CLEARING + 70, dist);
  const u = [lerp(x, un[0], blend), lerp(y, un[1], blend)]; // no seam at the clearing's edge
  const patch = fbm(u[0] * .0028 + u[1] * .001, u[1] * .0052);
  const ripple = Math.sin((u[0] * .018 + u[1] * .03) + fbm(u[0] * .004, u[1] * .006) * 9) * .5 + .5;
  const rows = noise(u[0] * .22, u[1] * .01);
  const heads = Math.pow(noise(x * .62 + 40, y * .42), 3);
  let c = mix3(p.dark, p.mid, clamp(.1 + patch * .72 + ripple * .16 + (rows - .5) * .12));
  c = mix3(c, p.hi, clamp(heads) * .2);
  // Pairs of wheel tracks, set out evenly either side of the middle so none has to pass through the
  // clearing; each bows smoothly round it, furthest at the formation's level and straight by the edges.
  const v = Math.abs(x - CX), bow = 232 * Math.exp(-((y - CY) ** 2) / (2 * 170 * 170));
  if (v > bow) {
    const v0 = Math.sqrt(v * v - bow * bow) + (noise(y * .004, x < CX ? 3 : 8) - .5) * 5;
    const t = (v0 + 118) % 236, along = Math.min(t, 236 - t);
    const track = Math.abs(along - 3.5) * Math.max(v0, 1) / v; // back to on-screen pixels
    c = mix3(c, p.soil, (1 - smooth(.3, 1.4, track)) * .6);
  }
  return c;
}
function paint(mode) {
  const p = PAL[mode], marks = mode === 'dawn';
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = standing(x, y, p);
    if (marks) {
      const b = dayMark(x, y), r = formation(x, y), ring = r.d < b.d, d = Math.min(b.d, r.d);
      if (d < 5) {
        const e = 1, nx = allSd(x + e, y) - allSd(x - e, y), ny = allSd(x, y + e) - allSd(x, y - e);
        const nl = Math.hypot(nx, ny) || 1, facing = (nx * -.66 + ny * -.75) / nl;
        const inside = 1 - smooth(-.9, .9, d);
        const ox = ring ? r.fx : b.m.x, oy = ring ? r.fy : b.m.y;
        const rad = Math.hypot(x - ox, y - oy), th = Math.atan2(y - oy, x - ox);
        const streak = noise((ring ? rad * .34 + th * 1.2 : rad * .62 + th * 1.6) + 11, th * 1.4 + rad * .03);
        const bright = ring ? 1 : [0, .34, .58, .8, 1][b.m.level];
        const laid = mix3(p.laidD, p.laidL, clamp(.34 + (streak - .3) * .9));
        c = mix3(c, mix3(mix3(c, p.laidD, .7), laid, bright), inside);
        const edge = 1 - smooth(0, 2.2, Math.abs(d));
        c = mix3(c, p.deep, edge * clamp(.22 + facing * .6) * (ring ? .85 : .62));
      }
      const t = clamp((x / W) * .8 + (y / H) * .35); // low sun from the upper left
      c = [c[0] * lerp(1.1, .93, t), c[1] * lerp(1.06, .9, t), c[2] * lerp(.96, .94, t)];
    } else {
      const moon = fbm(x * .002 + 3, y * .003);
      const v = smooth(0, 1, 1 - Math.hypot((x - CX) / (W * .75), (y - CY) / (H * .9)));
      const k = (.78 + moon * .44) * lerp(.72, 1.08, v);
      c = [c[0] * k, c[1] * k, c[2] * k];
    }
    const o = (y * W + x) * 3;
    buf[o] = clamp(c[0]) * 255; buf[o + 1] = clamp(c[1]) * 255; buf[o + 2] = clamp(c[2]) * 255;
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } });
}
const layers = {
  night: await paint('night').webp({ quality: 66, effort: 6 }).toBuffer(),
  dawn: await paint('dawn').webp({ quality: 82, effort: 6 }).toBuffer(),
};
writeFileSync(`${out}/contribution-crop-circles-still.webp`, layers.dawn);
const uri = (b) => 'data:image/webp;base64,' + b.toString('base64');
const f = (v) => +v.toFixed(1);

// ---- the timeline, in seconds ----
const LOOP = 56, SPEED = 1.25; // LOOP and T are the timeline at speed 1
const RUN = +(LOOP / SPEED).toFixed(2);
const T = { start: .5, sweepEnd: 15.5, ringStart: 17.5, ringEnd: 21, moonsEnd: 25, petalsEnd: 27, dawnIn: 27.5, dawnFull: 31.5, dawnOut: 50, night: 53.5 };
const pc = (t) => +(t / LOOP * 100).toFixed(3) + '%';

// The light's way, as dense points so its speed can be read off by length: a slow wave across the
// field, a curve in to the top of the ring, once round the ring, once round the moons, spiralling
// in to the middle.
const pts = [];
const push = (x, y) => pts.push([x, y]);
const X0 = -70, X1 = W + 70 - 240; // the wave ends short of the far edge's last days, then comes back in the curve
for (let x = X0; x <= W + 40; x += 12) push(x, CY + Math.sin((x - X0) / 300) * 52 + Math.sin((x - X0) / 131) * 14);
const sweepEndIndex = pts.length - 1;
// back round over the top to the ring's twelve o'clock
const [ex, ey] = pts[sweepEndIndex], rx = CX, ry = CY - R;
for (let i = 1; i <= 70; i++) { const t = i / 70, s = t * t * (3 - 2 * t); push(lerp(ex, rx, s), lerp(ey, ry, s) - Math.sin(Math.PI * t) * 34); }
const ringStart = pts.length - 1;
for (let i = 1; i <= 90; i++) { const a = -Math.PI / 2 + i / 90 * Math.PI * 2; push(CX + Math.cos(a) * R, CY + Math.sin(a) * R); }
const ringEnd = pts.length - 1;
for (let i = 1; i <= 16; i++) { const t = i / 16; push(CX, lerp(CY - R, CY - ORBIT, t)); }
const moonsStart = pts.length - 1;
for (let i = 1; i <= 120; i++) { const a = -Math.PI / 2 + i / 120 * Math.PI * 2; push(CX + Math.cos(a) * ORBIT, CY + Math.sin(a) * ORBIT); }
const moonsEnd = pts.length - 1;
for (let i = 1; i <= 60; i++) { const t = i / 60, a = -Math.PI / 2 + t * Math.PI * 3, r = lerp(ORBIT, 0, t * t * (3 - 2 * t)); push(CX + Math.cos(a) * r, CY + Math.sin(a) * r); }
const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
const total = lens.at(-1), share = (i) => (lens[i] / total * 100).toFixed(3) + '%';
const pathD = 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');

// A week's days lie down together as the light's front reaches them, in a soft fade.
const FADE = .5;
const timeAtX = (x) => lerp(T.start, T.sweepEnd, clamp((x - X0) / (W + 40 - X0)));
const LIT = { 1: '#2c383e', 2: '#46565c', 3: '#66797d', 4: '#8fa5a7' };
const weeks = cal.weeks.map((_, col) => marksDays.filter((d) => d.col === col));
const HOLD = T.dawnFull + 1 - T.start; // every week stays down until dawn has covered it
const weekCss = [];
const weekMarks = weeks.map((list, col) => {
  if (!list.length) return '';
  const meanX = list.reduce((s, d) => s + d.x, 0) / list.length;
  const at = +timeAtX(meanX).toFixed(2);
  return `<g class="w" style="animation-delay:${(at / SPEED).toFixed(2)}s">${list.map((d) => `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${DOT[d.level]}" fill="${LIT[d.level]}"/>`).join('')}</g>`;
}).join('');

// The formation by night, each part drawn as the light passes it.
const markCss = [];
let mi = 0;
const OFF = T.dawnFull + 1;
const drawRing = (r, a, b, rot) => {
  const name = `d${mi++}`, l = Math.ceil(Math.PI * 2 * r.r) + 1;
  markCss.push(`@keyframes ${name}{0%,${pc(a)}{stroke-dashoffset:${l}}${pc(b)},${pc(OFF)}{stroke-dashoffset:0}${pc(OFF + .05)},100%{stroke-dashoffset:${l}}}`);
  return `<circle cx="${f(r.x)}" cy="${f(r.y)}" r="${f(r.r)}" fill="none" stroke="#8fa5a7" stroke-width="${r.w}" stroke-dasharray="${l} ${l}" transform="rotate(${f(rot)} ${f(r.x)} ${f(r.y)})" style="stroke-dashoffset:${l};animation:${name} ${RUN}s linear infinite"/>`;
};
const popDisc = (c, a) => {
  const name = `d${mi++}`;
  markCss.push(`@keyframes ${name}{0%,${pc(a)}{opacity:0}${pc(a + .5)},${pc(OFF)}{opacity:1}${pc(OFF + .05)},100%{opacity:0}}`);
  return `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(c.r)}" fill="#8fa5a7" style="opacity:0;animation:${name} ${RUN}s linear infinite"/>`;
};
const parts = [];
// the clearing fades up under the ring as it's drawn
parts.push(drawRing(main, T.ringStart, T.ringEnd, -90));
moons.forEach((m, i) => {
  const at = lerp(T.ringEnd + .5, T.moonsEnd, i / 12), dur = 1;
  parts.push(drawRing(m, at, at + dur, m.a * 180 / Math.PI + 180));
  parts.push(popDisc({ x: m.x, y: m.y, r: m.r * .4 }, at + .4));
});
petals.forEach((m, i) => {
  const at = lerp(T.moonsEnd, T.petalsEnd - .6, i / 6);
  parts.push(drawRing(m, at, at + .9, i * 60 - 90));
});
parts.push(popDisc({ x: CX, y: CY, r: 10 }, T.petalsEnd - .3));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${cal.totalContributions} contributions in the last year, as a wheat field. At night a light glides over it and each week's busy days lie down, the graph parting around a clearing. In the clearing the light draws a crop circle with twelve circles sized by each slice of the year, and dawn shows it all in gold.">
<title>Contribution Crop Circles: ${cal.totalContributions} contributions in the last year</title>
<style>
.w{opacity:0;animation:week ${RUN}s linear infinite}
@keyframes week{0%{opacity:0}${pc(FADE)}{opacity:1}${pc(HOLD)}{opacity:1}${pc(HOLD + .05)},100%{opacity:0}}
${markCss.join('\n')}
.craft{offset-path:path("${pathD}");offset-rotate:0deg;animation:fly ${RUN}s infinite}
@keyframes fly{0%,${pc(T.start)}{offset-distance:0%;opacity:1;animation-timing-function:linear}${pc(T.sweepEnd)}{offset-distance:${share(sweepEndIndex)};animation-timing-function:ease-in-out}${pc(T.ringStart)}{offset-distance:${share(ringStart)};animation-timing-function:linear}${pc(T.ringEnd)}{offset-distance:${share(ringEnd)};animation-timing-function:ease-in-out}${pc(T.ringEnd + .5)}{offset-distance:${share(moonsStart)};animation-timing-function:linear}${pc(T.moonsEnd)}{offset-distance:${share(moonsEnd)};animation-timing-function:ease-out}${pc(T.petalsEnd)}{offset-distance:100%;opacity:1}${pc(T.dawnFull - 1)}{offset-distance:100%;opacity:0}${pc(LOOP - .2)}{offset-distance:100%;opacity:0}${pc(LOOP - .1)},100%{offset-distance:0%;opacity:1}}
.halo{transform-box:fill-box;transform-origin:center;animation:breathe 2.6s ease-in-out infinite alternate}
@keyframes breathe{from{transform:scale(.94)}to{transform:scale(1.06)}}
.dawn{opacity:0;animation:dawn ${RUN}s linear infinite}
@keyframes dawn{0%,${pc(T.dawnIn)}{opacity:0}${pc(T.dawnFull)},${pc(T.dawnOut)}{opacity:1}${pc(T.night)},100%{opacity:0}}
.ship{animation:ship ${RUN}s linear infinite}
@keyframes ship{0%{transform:translate(-500px,-60px)}${pc(T.dawnFull)},100%{transform:translate(${W + 500}px,110px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.dawn{opacity:1}.craft,.ship{display:none}}
</style>
<defs>
<radialGradient id="halo"><stop offset="0" stop-color="#d9fff6" stop-opacity=".95"/><stop offset=".12" stop-color="#8ff0db" stop-opacity=".62"/><stop offset=".42" stop-color="#5ce0cc" stop-opacity=".17"/><stop offset="1" stop-color="#4fd0ff" stop-opacity="0"/></radialGradient>
<radialGradient id="shipFill"><stop offset="0" stop-color="#02050a" stop-opacity=".55"/><stop offset=".62" stop-color="#02050a" stop-opacity=".36"/><stop offset="1" stop-color="#02050a" stop-opacity="0"/></radialGradient>
</defs>
<image href="${uri(layers.night)}" width="${W}" height="${H}"/>
${weekMarks}
${parts.join('\n')}
<ellipse class="ship" cx="0" cy="320" rx="430" ry="205" fill="url(#shipFill)"/>
<g class="craft"><circle class="halo" r="82" fill="url(#halo)"/><circle r="4.4" fill="#f4fffc"/></g>
<image class="dawn" href="${uri(layers.dawn)}" width="${W}" height="${H}"/>
</svg>
`;
writeFileSync(`${out}/contribution-crop-circles.svg`, svg);
console.log(JSON.stringify({ svgKB: Math.round(svg.length / 1024), active: active.length, q: [q1, q2, q3], months, layerKB: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, Math.round(v.length / 1024)])), speed: { sweepPxPerSec: Math.round(lens[sweepEndIndex] / (T.sweepEnd - T.start)), ring: Math.round((lens[ringEnd] - lens[ringStart]) / (T.ringEnd - T.ringStart)) } }));
