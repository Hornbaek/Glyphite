// ===================== ENGINE · core =====================
const ASPECT = 2;              // cell height in units
// Detail: how many character columns stand for one "base unit" (0.5 m).
// Everything physical (sizes, speeds, radii) is authored in base units and
// multiplied by RES, so a finer grid adds detail instead of zooming out.
const DETAIL_LEVELS = [1, 1.5, 2, 2.5, 3];
let RES = 2, UNIT_M = .25, G = 6.48;
function setResVars(r) { RES = r; UNIT_M = .5 / r; G = 1.62 / UNIT_M; }   // G: lunar 1.62 m/s^2 in units/s^2
setResVars(2);
const DT = 1 / 60;
const CALM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rr = (a, b) => a + (b - a) * Math.random();
const smooth = t => t * t * (3 - 2 * t);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise1(x, s) { const i = Math.floor(x), u = smooth(x - i); return lerp(hash2(i, 0, s), hash2(i + 1, 0, s), u); }
function vnoise2(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
  return lerp(lerp(hash2(ix, iy, s), hash2(ix + 1, iy, s), u), lerp(hash2(ix, iy + 1, s), hash2(ix + 1, iy + 1, s), u), v);
}
function fbm1(x, s, o) { let a = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { a += vnoise1(x * f, s + i * 17) * amp; n += amp; amp *= .5; f *= 2; } return a / n; }
function fbm2(x, y, s, o) { let a = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { a += vnoise2(x * f, y * f, s + i * 31) * amp; n += amp; amp *= .5; f *= 2; } return a / n; }

// ---------- materials ----------
const EMPTY = 0, REGO = 1, ROCK = 2, BED = 3, ICE = 4, METAL = 5, RUBBLE = 6, CRYST = 7, GLASS = 8, MAST = 9;
const MAT_NAME = ['vacuum', 'regolith', 'basalt', 'bedrock', 'water ice', 'pad', 'rubble', 'He-3 crystal', 'impact glass', 'lamp mast'];
const MAT_ALB = [[0, 0, 0], [.72, .69, .63], [.50, .52, .57], [.30, .31, .35], [.70, .90, 1.0], [.86, .88, .92], [.58, .54, .49], [.35, 1.0, .85], [.32, .58, .46], [.70, .72, .76]];
const MAT_GRAN = new Uint8Array([0, 1, 0, 0, 0, 0, 1, 0, 0, 0]);        // granular: slides & falls
const MAT_TOUGH = new Float32Array([0, .12, .55, 99, .3, 99, .2, .35, .45, .8]); // blast resistance
const MAT_SHINY = new Float32Array([0, 0, .05, 0, .9, .55, 0, .7, .8, .5]);
const MAT_RAMP = ['', ' .,:;=+*#%', " .':oO8&%#", ' .:;#XWM', ' .-~=*#', ' .-=#', ' .,o%&', ' .+*', ' .,;o', ' .:|#'];

// ---------- world grid ----------
let W = 0, H = 0, cells = null, heat = null, vari = null, dyn = null, awake = null;
const CS = 16; let CWn = 0, CHn = 0, frameNo = 0;
function worldInit(w, h) {
  W = w; H = h; cells = new Uint8Array(w * h); heat = new Float32Array(w * h); vari = new Uint8Array(w * h); dyn = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) vari[i] = (Math.random() * 256) | 0;
  CWn = Math.ceil(w / CS); CHn = Math.ceil(h / CS); awake = new Uint8Array(CWn * CHn);
}
function getC(x, y) { if (x < 0 || x >= W) return BED; if (y < 0) return EMPTY; if (y >= H) return BED; return cells[y * W + x]; }
function wakeAt(x, y) {
  const cx = (x / CS) | 0, cy = (y / CS) | 0, lx = x - cx * CS, ly = y - cy * CS;
  const i0 = lx === 0 ? -1 : 0, i1 = lx === CS - 1 ? 1 : 0, j0 = ly === 0 ? -1 : 0, j1 = ly === CS - 1 ? 1 : 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const a = cx + i, b = cy + j; if (a >= 0 && b >= 0 && a < CWn && b < CHn) awake[b * CWn + a] = 1;
  }
}
function setC(x, y, m) { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (cells[i] === m) return; cells[i] = m; wakeAt(x, y); }
const solidU = (xu, yu) => getC(Math.floor(xu), Math.floor(yu / ASPECT)) !== EMPTY;
const matU = (xu, yu) => getC(Math.floor(xu), Math.floor(yu / ASPECT));

// surface normal from local occupancy (isotropic units)
function normalAt(xu, yu, out) {
  const cx = Math.floor(xu), cy = Math.floor(yu / ASPECT), ri = Math.round(3 * RES), rj = Math.round(2 * RES); let nx = 0, ny = 0;
  for (let j = -rj; j <= rj; j++) for (let i = -ri; i <= ri; i++) if (getC(cx + i, cy + j) !== EMPTY) { nx -= i; ny -= j * ASPECT; }
  const l = Math.hypot(nx, ny);
  if (l < 1e-6) { out[0] = 0; out[1] = -1; } else { out[0] = nx / l; out[1] = ny / l; }
  return out;
}

// ---------- granular cellular automaton (only in awake chunks) ----------
function simGranular() {
  const flip = frameNo & 1;
  for (let by = CHn - 1; by >= 0; by--) for (let q = 0; q < CWn; q++) {
    const bx = flip ? q : CWn - 1 - q, ci = by * CWn + bx;
    if (!awake[ci]) continue; awake[ci] = 0;
    const x0 = bx * CS, y0 = by * CS, x1 = Math.min(W, x0 + CS), y1 = Math.min(H - 1, y0 + CS);
    for (let y = y1 - 1; y >= y0; y--) {
      const row = y * W;
      for (let k = 0; k < x1 - x0; k++) {
        const x = flip ? x0 + k : x1 - 1 - k, m = cells[row + x];
        if (!MAT_GRAN[m]) continue;
        if (cells[row + W + x] === EMPTY) {               // unsupported → ballistic grain
          cells[row + x] = EMPTY; wakeAt(x, y);
          if (!spawnGrain(x + .5, y * ASPECT + 1, rr(-.3, .3) * RES, 0, m)) { cells[row + W + x] = m; wakeAt(x, y + 1); }
          continue;
        }
        const d = ((x + y + frameNo) & 2) ? 1 : -1;
        for (let s = 0; s < 2; s++) {
          const dd = s ? -d : d, nx = x + dd; if (nx < 0 || nx >= W) continue;
          if (cells[row + nx] === EMPTY && cells[row + W + nx] === EMPTY) {   // slide down-diagonal
            if (Math.random() < .55) { cells[row + x] = EMPTY; cells[row + W + nx] = m; wakeAt(x, y); wakeAt(nx, y + 1); }
            else awake[ci] = 1;
            break;
          }
          if (m === REGO) {                                                   // fine dust creeps to ~45°
            const n2 = x + 2 * dd;
            if (n2 >= 0 && n2 < W && cells[row + nx] === EMPTY && cells[row + n2] === EMPTY && cells[row + W + n2] === EMPTY) {
              if (Math.random() < .22) { cells[row + x] = EMPTY; cells[row + nx] = m; wakeAt(x, y); wakeAt(nx, y); }
              else awake[ci] = 1;
              break;
            }
          }
        }
      }
    }
  }
}

// heat cools off (only the band near the camera is worth simulating)
function coolHeat(x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  for (let y = y0; y < y1; y++) { const row = y * W; for (let x = x0; x < x1; x++) { const i = row + x; if (heat[i] > 0) { heat[i] = heat[i] * .985 - .0008; if (heat[i] < 0) heat[i] = 0; } } }
}
function addHeat(x, y, h) { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (cells[i] !== EMPTY) heat[i] = Math.min(1.6, heat[i] + h); }
