/* =====================================================================
   GLYPHITE — a 2D game engine that only draws printable ASCII (32..126):
   voxel world + granular sim, particles, rigid bodies, breakable
   structures, ray-traced light, an 8-bit sound chip. Games are built on
   top of it (see engine/API.md). Units: 1 base unit = 0.5 m; a character
   cell is 1 unit wide and 2 units tall.
   ===================================================================== */
// ===================== ENGINE · core =====================
const ASPECT = 2;              // cell height in units
// Detail: how many character columns stand for one "base unit" (0.5 m).
// Everything physical (sizes, speeds, radii) is authored in base units and
// multiplied by RES, so a finer grid adds detail instead of zooming out.
const DETAIL_LEVELS = [1, 1.5, 2, 2.5, 3];
let RES = 2, UNIT_M = .25, G = 6.48, GRAVITY = 1.62;
// G is gravity in world units/s^2 (downward); GRAVITY is the same in m/s^2, set by the game
function setResVars(r) { RES = r; UNIT_M = .5 / r; G = GRAVITY / UNIT_M; }
function setGravity(mps2) { GRAVITY = mps2; G = GRAVITY / UNIT_M; }
setResVars(2);
const DT = 1 / 60;
let GAME = {};   // the running game's hooks (set by Glyphite.run)
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

// ---------- materials: a registry the game fills with defineMaterial() ----------
// A cell holds a material id (0..255); id 0 is always EMPTY (vacuum or air). Hot loops read the
// per-id arrays below, MATS keeps each full definition. Engine code never names a game material:
// everything it needs (falls like sand, blast resistance, how it draws, what a blast throws) is a
// property here.
const EMPTY = 0, MAT_MAX = 256;
const MATS = [{ id: 0, name: 'empty', albedo: [0, 0, 0], ramp: '' }];
const MAT_NAME = ['empty'], MAT_ALB = [[0, 0, 0]], MAT_RAMP = [''], RAMP_CODES = [[]], MAT_GRAINS = [''], MAT_GLOWS = [null], MAT_PULSE = [null];
const MAT_GRAN = new Uint8Array(MAT_MAX), MAT_CREEP = new Uint8Array(MAT_MAX), MAT_TOUGH = new Float32Array(MAT_MAX);
const MAT_SHINY = new Float32Array(MAT_MAX), MAT_FRIC = new Float32Array(MAT_MAX), MAT_DENS = new Float32Array(MAT_MAX);
const MAT_BRITTLE = new Uint8Array(MAT_MAX), MAT_ANCHOR = new Uint8Array(MAT_MAX), MAT_STYLE = new Uint8Array(MAT_MAX);
const MAT_DEBRIS = new Uint8Array(MAT_MAX), MAT_SUBL = new Float32Array(MAT_MAX), MAT_VAPOR = new Uint8Array(MAT_MAX);
const MAT_FUSE = new Uint8Array(MAT_MAX), MAT_FUSEP = new Float32Array(MAT_MAX), MAT_EJECT = new Uint8Array(MAT_MAX);
const STYLE = { terrain: 0, deck: 1, mast: 2, crystal: 3, flat: 4 };
const MAT_DEFAULTS = {
  albedo: [.6, .6, .6],     // surface colour under white light
  ramp: ' .:;=+*#%@',       // glyphs from dark to bright for this material
  granular: false,          // falls and slides like sand
  creep: false,             // granular only: fine dust that also creeps sideways to ~45 degrees
  tough: .5,                // blast resistance (99 = indestructible)
  shiny: 0,                 // chance of sparkle glints on lit surfaces
  friction: .95,            // Coulomb friction for feet (hull kind 1) standing on it
  density: 1,               // relative density when part of a falling chunk
  brittle: true,            // chips apart on hard impacts (false: bends and bounces, like steel)
  anchor: false,            // never falls: supports any structure touching it
  style: 'terrain',         // 'terrain' | 'deck' | 'mast' | 'crystal' | 'flat' (see renderScene)
  grainGlyphs: ".,'`:",     // glyphs for its flying grains
  debris: false,            // its grains fly as heavier, bouncier debris
  sublimate: 0,             // chance per exhaust hit to turn into vapour
  vaporize: false,          // blasts turn it into vapour instead of grains
  fuseTo: 0, fuseChance: 0, // blast rims sometimes turn it into this material
  ejecta: 0,                // what a blast throws (0: itself if granular, else the world's rubble)
  glow: null,               // [r, g, b, radius]: emits a little light from scattered cells
  pulse: null,              // [r, g, b]: 'crystal' style colour pulse
  blast: null               // (x, y, vx, vy, how) => void: replaces ejecta ('blast') / adds to chips ('chip')
};
function defineMaterial(name, opts = {}) {
  const id = MATS.length; if (id >= MAT_MAX) throw new Error('too many materials');
  MATS.push(null); applyMaterial({ ...MAT_DEFAULTS, ...opts, id, name });
  return id;
}
// change properties after the fact (e.g. one that names a material defined later)
function setMaterial(id, opts) { applyMaterial({ ...MATS[id], ...opts, id }); }
function applyMaterial(m) {
  const id = m.id;
  if (!(m.style in STYLE)) throw new Error(`material ${m.name}: unknown style ${m.style}`);
  MATS[id] = m; MAT_NAME[id] = m.name; MAT_ALB[id] = m.albedo; MAT_RAMP[id] = m.ramp; MAT_GRAINS[id] = m.grainGlyphs;
  MAT_GLOWS[id] = m.glow; MAT_PULSE[id] = m.pulse || [.2, .9, .75];
  RAMP_CODES[id] = Array.from(m.ramp, c => c.charCodeAt(0));
  MAT_GRAN[id] = m.granular ? 1 : 0; MAT_CREEP[id] = m.creep ? 1 : 0; MAT_TOUGH[id] = m.tough; MAT_SHINY[id] = m.shiny;
  MAT_FRIC[id] = m.friction; MAT_DENS[id] = m.density; MAT_BRITTLE[id] = m.brittle ? 1 : 0; MAT_ANCHOR[id] = m.anchor ? 1 : 0;
  MAT_STYLE[id] = STYLE[m.style]; MAT_DEBRIS[id] = m.debris ? 1 : 0; MAT_SUBL[id] = m.sublimate; MAT_VAPOR[id] = m.vaporize ? 1 : 0;
  MAT_FUSE[id] = m.fuseTo; MAT_FUSEP[id] = m.fuseChance; MAT_EJECT[id] = m.ejecta || (m.granular ? id : 0);
}
// world-wide material roles: what lies beyond the sides and bottom of the grid, what broken solid
// crumbles into, and what props up anything left floating when a level settles
let EDGE_MAT = EMPTY, RUBBLE_MAT = EMPTY, FILL_MAT = EMPTY;
function worldMaterials({ edge = EDGE_MAT, rubble = RUBBLE_MAT, fill = FILL_MAT } = {}) { EDGE_MAT = edge; RUBBLE_MAT = rubble; FILL_MAT = fill; }
const ejectaOf = m => MAT_EJECT[m] || RUBBLE_MAT;
const crumbOf = m => MAT_GRAN[m] ? m : RUBBLE_MAT;

// ---------- world grid ----------
let W = 0, H = 0, cells = null, heat = null, vari = null, dyn = null, awake = null;
const CS = 16; let CWn = 0, CHn = 0, frameNo = 0;
function worldInit(w, h) {
  W = w; H = h; cells = new Uint8Array(w * h); heat = new Float32Array(w * h); vari = new Uint8Array(w * h); dyn = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) vari[i] = (Math.random() * 256) | 0;
  CWn = Math.ceil(w / CS); CHn = Math.ceil(h / CS); awake = new Uint8Array(CWn * CHn);
  // a new world starts clean: no flying particles, effects, falling chunks or mounted objects
  P.n = 0; FX.rings.length = 0; FX.lights.length = 0; FX.texts.length = 0;
  chunks = []; rechecks = []; mounts.length = 0;
}
function getC(x, y) { if (x < 0 || x >= W) return EDGE_MAT; if (y < 0) return EMPTY; if (y >= H) return EDGE_MAT; return cells[y * W + x]; }
function wakeAt(x, y) {
  const cx = (x / CS) | 0, cy = (y / CS) | 0, lx = x - cx * CS, ly = y - cy * CS;
  const i0 = lx === 0 ? -1 : 0, i1 = lx === CS - 1 ? 1 : 0, j0 = ly === 0 ? -1 : 0, j1 = ly === CS - 1 ? 1 : 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const a = cx + i, b = cy + j; if (a >= 0 && b >= 0 && a < CWn && b < CHn) awake[b * CWn + a] = 1;
  }
}
// dynamic occluders: cells covered by moving bodies this frame (they cast sun shadows)
let dynList = [];
function markDynCell(i) { if (!dyn[i]) { dyn[i] = 1; dynList.push(i); } }
function clearDyn() { for (const i of dynList) dyn[i] = 0; dynList.length = 0; }
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
          if (MAT_CREEP[m]) {                                                 // fine dust creeps to ~45°
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
