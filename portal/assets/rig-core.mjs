// The pose rig of the animation tools (docs/ANIMATION.md): a small 2D skeleton that says where a character's body parts are in
// each frame, so an image model can be asked to draw the whole character in that pose. The rig is never the art: it is data,
// and a deterministic POSE GUIDE picture made from it. No DOM and no Node: the studio page and the command line
// (tools/art/bakeoff.mjs) share it, and the unit tests (tests/node/rig.test.mjs) pin it.
//
// Coordinates are the character's own sprite pixels (x right, y down), so a rig drawn over a 28 x 32 sprite stays valid at any
// zoom. Angles are degrees, 0 pointing right and 90 pointing down (screen y). The rig is forward kinematics: every joint hangs
// from its parent at `len` pixels in the direction parent's world angle + its own local `angle`; the root is placed by x, y.
// Rotations, not positions, are what a pose stores and what is interpolated, so limbs keep their lengths in the in-betweens.
//
//   rig  = { version: 1, size: { w, h }, root: { x, y }, joints: [{ id, parent, len, angle, side, w, shape, r }] }
//          side: 'near' (towards the viewer), 'far' or 'mid'; w: half the thickness of the bone that ends at the joint (for the
//          silhouette); shape 'circle' with r: a disc at the joint (a head). The root is the joint whose parent is null.
//   pose = { root: { dx, dy }, angles: { id: local degrees } }   anything left out is the rig's rest value
//          a key's pose may also say, for easier posing (resolvePose turns them into angles):
//          world: { id: degrees }     the bone's direction on screen (0 right, 90 down), whatever its parents do
//          reach: { id: { at: [x, y], bend: 'front' | 'back', foot: degrees } }   put joint `id` (an ankle, a hand) at x, y: its parent
//                                     and grandparent bend to get there (two-bone IK, the middle joint toward `bend`), and its child
//                                     (a toe) points `foot` on screen (0: flat on the floor)
//   anim = { frames, fps, loop, keys: [{ frame, label, pose, ease }] }   ease from this key to the next: linear | smooth | hold

export const EASES = {
  linear: t => t,
  smooth: t => t * t * (3 - 2 * t),
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  hold: () => 0,
};

const RAD = Math.PI / 180;
export const wrap = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };
// the shortest way round from a to b (an angle of 350 and one of 10 are 20 degrees apart, not 340)
export const angleLerp = (a, b, t) => a + wrap(b - a) * t;

const byId = rig => Object.fromEntries(rig.joints.map(j => [j.id, j]));
// joints ordered parents first, so one pass solves them
export function order(rig) {
  const ids = byId(rig), out = [], seen = new Set();
  const visit = (j, path = new Set()) => {
    if (seen.has(j.id)) return;
    if (path.has(j.id)) throw new Error(`the rig loops at joint ${j.id}`);
    path.add(j.id);
    if (j.parent != null) { const p = ids[j.parent]; if (!p) throw new Error(`joint ${j.id} hangs from ${j.parent}, which is not in the rig`); visit(p, path); }
    seen.add(j.id); out.push(j);
  };
  for (const j of rig.joints) visit(j);
  const roots = out.filter(j => j.parent == null);
  if (roots.length !== 1) throw new Error(`a rig has exactly one root joint (this one has ${roots.length})`);
  return out;
}

// world positions and angles of every joint for a pose: { id: { x, y, a } }
export function solve(rig, pose = {}) {
  const out = {}, ang = pose.angles || {}, d = pose.root || {};
  for (const j of order(rig)) {
    const local = ang[j.id] ?? j.angle ?? 0;
    if (j.parent == null) { out[j.id] = { x: rig.root.x + (d.dx || 0), y: rig.root.y + (d.dy || 0), a: local }; continue; }
    const p = out[j.parent], a = p.a + local;
    out[j.id] = { x: p.x + Math.cos(a * RAD) * j.len, y: p.y + Math.sin(a * RAD) * j.len, a };
  }
  return out;
}

// a full pose (every joint's local angle) from a partial one
export function full(rig, pose = {}) {
  const angles = {};
  for (const j of rig.joints) angles[j.id] = (pose.angles || {})[j.id] ?? j.angle ?? 0;
  return { root: { dx: (pose.root || {}).dx || 0, dy: (pose.root || {}).dy || 0 }, angles };
}

// the pose of joints given by WORLD angles (what an editor drags), turned into local ones
export function fromWorld(rig, root, world) {
  const angles = {};
  for (const j of order(rig)) angles[j.id] = j.parent == null ? world[j.id] : wrap(world[j.id] - world[j.parent]);
  return { root, angles };
}

export function lerpPose(rig, a, b, t) {
  const A = full(rig, a), B = full(rig, b), angles = {};
  for (const id in A.angles) angles[id] = wrap(angleLerp(A.angles[id], B.angles[id], t));
  return { root: { dx: A.root.dx + (B.root.dx - A.root.dx) * t, dy: A.root.dy + (B.root.dy - A.root.dy) * t }, angles };
}

// The same pose with the near and far limbs swapped (a walk's right-foot contact from its left-foot one). Joints pair by id:
// `knee_near` with `knee_far`. Their WORLD angles are swapped, so a near leg that hangs from a hip pointing the other way still
// ends up where the far leg was; joints listed in `keep` (hips, shoulders: where the limbs attach) are left alone.
export function mirror(rig, pose, { keep = [] } = {}) {
  const P = full(rig, pose), w = solve(rig, P), world = Object.fromEntries(Object.entries(w).map(([id, s]) => [id, s.a]));
  const sw = { ...world };
  for (const j of rig.joints) {
    const m = /^(.*)_near$/.exec(j.id); if (!m || keep.includes(j.id)) continue;
    const far = `${m[1]}_far`; if (!(far in world) || keep.includes(far)) continue;
    sw[j.id] = world[far]; sw[far] = world[j.id];
  }
  return fromWorld(rig, P.root, sw);
}

// A cycle authored as half of itself: with `anim.mirrorHalf`, every key gets a mirrored copy half the cycle later (a walk's
// left-foot contact and passing poses give the right-foot ones), labelled with its `_a` turned into `_b`.
export function expandKeys(rig, anim) {
  const keys = anim.keys.map(k => ({ ...k, pose: resolvePose(rig, k.pose) }));
  if (!anim.mirrorHalf) return { ...anim, keys };
  const half = anim.frames / 2, keep = anim.mirrorKeep || [];
  const extra = keys.map(k => ({ ...k, frame: k.frame + half, label: String(k.label || '').replace(/_a$/, '_b'), mirrorOf: k.label, pose: mirror(rig, k.pose, { keep }) }));
  return { ...anim, mirrorHalf: false, keys: [...keys, ...extra].sort((a, b) => a.frame - b.frame) };
}

// A key's pose as plain local angles: `world` directions and `reach` targets (see the top of this file) worked out on the rig, parents first.
export function resolvePose(rig, pose = {}) {
  if (!pose.world && !pose.reach) return pose;
  const P = full(rig, pose), ids = byId(rig), world = pose.world || {}, reach = pose.reach || {};
  for (const j of order(rig)) if (j.parent != null && world[j.id] != null) { const W = solve(rig, P); P.angles[j.id] = wrap(world[j.id] - W[j.parent].a); }
  for (const [id, r] of Object.entries(reach)) {
    const J = ids[id], K = J && ids[J.parent], H = K && ids[K.parent];
    if (!H) throw new Error(`reach: ${id} needs a parent and a grandparent to bend`);
    const W = solve(rig, P), h = W[H.id], a = K.len, b = J.len, tx = r.at[0] - h.x, ty = r.at[1] - h.y;
    const d = Math.min(Math.max(Math.hypot(tx, ty), Math.abs(a - b) + 1e-6), a + b - 1e-6), base = Math.atan2(ty, tx) / RAD;
    const open = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))) / RAD;
    // the middle joint (knee, elbow) toward the character's front (+x, the way it faces) or back
    const cands = [base - open, base + open].map(u => ({ u, x: h.x + Math.cos(u * RAD) * a }));
    const upper = (r.bend === 'back' ? cands.sort((p, q) => p.x - q.x) : cands.sort((p, q) => q.x - p.x))[0].u;
    const kx = h.x + Math.cos(upper * RAD) * a, ky = h.y + Math.sin(upper * RAD) * a, lower = Math.atan2(r.at[1] - ky, r.at[0] - kx) / RAD;
    P.angles[K.id] = wrap(upper - h.a); P.angles[J.id] = wrap(lower - upper);
    if (r.foot != null) { const T = rig.joints.find(c => c.parent === J.id); if (T) P.angles[T.id] = wrap(r.foot - lower); }
  }
  return { root: P.root, angles: P.angles };
}

// The pose at frame f (fractional frames allowed) of an animation: between the key before and the key after, eased by the
// earlier key's `ease`. A looping animation wraps from its last key back to its first over the frames that are left.
export function poseAt(rig, anim, f) {
  const keys = [...anim.keys].sort((a, b) => a.frame - b.frame), n = anim.frames;
  if (!keys.length) return full(rig, {});
  if (anim.loop) f = ((f % n) + n) % n;
  let i = keys.length - 1;
  while (i > 0 && keys[i].frame > f) i--;
  const k0 = keys[i];
  if (f < k0.frame) return full(rig, keys[0].pose); // before the first key of a one-shot
  let k1 = keys[i + 1], span;
  if (k1) span = k1.frame - k0.frame;
  else if (anim.loop) { k1 = keys[0]; span = n - k0.frame + k1.frame; }
  else return full(rig, k0.pose);
  if (span <= 0) return full(rig, k0.pose);
  const t = (EASES[k0.ease || 'linear'] || EASES.linear)((f - k0.frame) / span);
  return lerpPose(rig, k0.pose, k1.pose, t);
}

export const framePoses = (rig, anim) => Array.from({ length: anim.frames }, (_, f) => poseAt(rig, anim, f));

// How far the loop's seam jumps compared with the other steps: the largest joint movement (pixels) from the last frame back to
// the first, and the largest between any two neighbouring frames. A seam well above the steps is a visible hitch.
export function loopSeam(rig, anim) {
  const P = framePoses(rig, anim).map(p => solve(rig, p)), move = (a, b) => Math.max(...Object.keys(a).map(id => Math.hypot(a[id].x - b[id].x, a[id].y - b[id].y)));
  const steps = P.slice(1).map((p, i) => move(P[i], p));
  return { seam: P.length > 1 ? move(P[P.length - 1], P[0]) : 0, maxStep: steps.length ? Math.max(...steps) : 0 };
}

// ---- the pose guide ----------------------------------------------------------------------------------------------------------
// A picture of the pose for an image model: the bones as thick coloured lines with round joints, near limbs warm, far limbs
// cool, the body and head green, so the model can tell which leg is in front; optionally a grey silhouette (the rig's widths)
// under them. Plain shapes on a plain ground, no anti-aliasing, so the same pose always makes the same bytes.

export const GUIDE_COLORS = { near: [232, 80, 42], far: [52, 104, 216], mid: [40, 160, 80], tail: [150, 70, 200], face: [240, 190, 20], silhouette: [178, 178, 186], joint: [24, 24, 28] };
const sideOf = j => (j.side === 'near' || j.side === 'far') ? j.side : (j.part === 'tail' ? 'tail' : 'mid');
const DEPTH = { far: 0, tail: 1, mid: 2, near: 3 };

// map: sprite pixel (x, y) → picture pixel (ox + x * s, oy + y * s)
export function guideMap(rig, w, h, { margin = 0.1 } = {}) {
  const s = Math.min(w * (1 - 2 * margin) / rig.size.w, h * (1 - 2 * margin) / rig.size.h);
  return { s, ox: (w - rig.size.w * s) / 2, oy: (h - rig.size.h * s) / 2 };
}

function disc(im, cx, cy, r, c) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(im.width - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(im.height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r) im.data.set(c, (y * im.width + x) * 4);
}
// a capsule: every pixel within r of the segment
function capsule(im, ax, ay, bx, by, r, c) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(im.width - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(im.height - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + .5, py = y + .5, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    if ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2 <= r * r) im.data.set(c, (y * im.width + x) * 4);
  }
}

// → { width, height, data } RGBA. mode: 'skeleton' | 'silhouette' | 'combined'. bg: an [r, g, b, a] ground (default white).
export function renderGuide(rig, pose, { w = 256, h = 256, mode = 'combined', map = null, bg = [255, 255, 255, 255], bone = 0.45, joint = 0.7 } = {}) {
  const im = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let i = 0; i < w * h; i++) im.data.set(bg, i * 4);
  const m = map || guideMap(rig, w, h), P = solve(rig, full(rig, pose)), X = x => m.ox + x * m.s, Y = y => m.oy + y * m.s;
  const joints = order(rig), ids = byId(rig);
  const drawn = j => j.parent != null && ids[j.parent].parent != null; // bones from the root are placement, not body
  const C = c => [...c, 255];
  if (mode !== 'skeleton') for (const j of joints) {
    const p = P[j.id];
    if (drawn(j) && j.w) capsule(im, X(P[j.parent].x), Y(P[j.parent].y), X(p.x), Y(p.y), j.w * m.s, C(GUIDE_COLORS.silhouette));
    if (j.shape === 'circle') disc(im, X(p.x), Y(p.y), (j.r || 1) * m.s, C(GUIDE_COLORS.silhouette));
  }
  if (mode === 'silhouette') return im;
  const lw = Math.max(0.5, bone * m.s), jr = Math.max(0.75, joint * m.s);
  const layers = [...joints].sort((a, b) => DEPTH[sideOf(a)] - DEPTH[sideOf(b)]);
  for (const j of layers) {
    const p = P[j.id], col = C(j.part === 'face' ? GUIDE_COLORS.face : GUIDE_COLORS[sideOf(j)]);
    if (j.shape === 'circle') { const r = (j.r || 1) * m.s, ring = Math.max(1, lw * .6); for (let k = 0; k < 96; k++) { const a = k / 96 * 2 * Math.PI, b = (k + 1) / 96 * 2 * Math.PI; capsule(im, X(p.x) + Math.cos(a) * r, Y(p.y) + Math.sin(a) * r, X(p.x) + Math.cos(b) * r, Y(p.y) + Math.sin(b) * r, ring, col); } }
    if (drawn(j)) capsule(im, X(P[j.parent].x), Y(P[j.parent].y), X(p.x), Y(p.y), lw, col);
  }
  for (const j of layers) if (j.parent != null) { const p = P[j.id]; disc(im, X(p.x), Y(p.y), jr, C(GUIDE_COLORS.joint)); disc(im, X(p.x), Y(p.y), jr * .55, C(j.part === 'face' ? GUIDE_COLORS.face : GUIDE_COLORS[sideOf(j)])); }
  return im;
}

// Several guides side by side in one picture (a strip for a model that draws a whole cycle at once): `cols` across, each cell
// cw x ch with the rig placed by guideMap. → { im, cells: [{ x, y, w, h, map }] }
export function guideStrip(rig, poses, { cols = poses.length, cw = 256, ch = 256, mode = 'combined', bg = [255, 255, 255, 255], gap = 0 } = {}) {
  const rows = Math.ceil(poses.length / cols), W = cols * cw + (cols - 1) * gap, H = rows * ch + (rows - 1) * gap;
  const im = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let i = 0; i < W * H; i++) im.data.set(bg, i * 4);
  const cells = poses.map((p, i) => {
    const x = (i % cols) * (cw + gap), y = Math.floor(i / cols) * (ch + gap), g = renderGuide(rig, p, { w: cw, h: ch, mode, bg });
    for (let r = 0; r < ch; r++) im.data.set(g.data.subarray(r * cw * 4, (r + 1) * cw * 4), ((y + r) * W + x) * 4);
    const m = guideMap(rig, cw, ch);
    return { x, y, w: cw, h: ch, map: { s: m.s, ox: x + m.ox, oy: y + m.oy } };
  });
  return { im, cells };
}

// Check a rig: every joint known, one root, no loops, numbers where numbers belong. → list of problems (empty: fine)
export function validateRig(rig) {
  const errs = [];
  if (!rig || !Array.isArray(rig.joints)) return ['a rig needs joints'];
  if (!rig.size || !(rig.size.w > 0) || !(rig.size.h > 0)) errs.push('a rig needs size { w, h }');
  if (!rig.root || !Number.isFinite(rig.root.x) || !Number.isFinite(rig.root.y)) errs.push('a rig needs root { x, y }');
  const seen = new Set();
  for (const j of rig.joints) {
    if (!j.id || seen.has(j.id)) errs.push(`joint id ${JSON.stringify(j.id)} is missing or repeated`); seen.add(j.id);
    if (j.parent != null && !(j.len >= 0)) errs.push(`joint ${j.id} needs a length`);
    if (j.side && !['near', 'far', 'mid'].includes(j.side)) errs.push(`joint ${j.id}: side is near, far or mid`);
  }
  try { order(rig); } catch (e) { errs.push(e.message); }
  return errs;
}
