// The pose rig (portal/assets/rig-core.mjs): forward kinematics, angle interpolation the short way round, eases, loops, mirrored
// half cycles and the pose guide pictures, which must be the same bytes every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as R from '../../portal/assets/rig-core.mjs';

// an arm: a root, a shoulder straight up from it, an upper arm pointing right, a forearm bent down
const ARM = { version: 1, size: { w: 20, h: 20 }, root: { x: 10, y: 15 }, joints: [
  { id: 'root', parent: null, angle: 0 },
  { id: 'shoulder', parent: 'root', len: 10, angle: -90, side: 'mid', w: 2 },
  { id: 'elbow_near', parent: 'shoulder', len: 4, angle: 90, side: 'near', w: 1 },
  { id: 'hand_near', parent: 'elbow_near', len: 3, angle: 90, side: 'near', w: 1 },
  { id: 'elbow_far', parent: 'shoulder', len: 4, angle: -90, side: 'far', w: 1 },
  { id: 'hand_far', parent: 'elbow_far', len: 3, angle: -90, side: 'far', w: 1 },
] };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} is not ${b}`);
const PIP = JSON.parse(readFileSync(new URL('../../games/spacemouse/art/anims/pip-walk.json', import.meta.url), 'utf8'));

test('forward kinematics: every joint hangs from its parent at its length and angle', () => {
  const P = R.solve(ARM);
  close(P.shoulder.x, 10, 'shoulder x'); close(P.shoulder.y, 5, 'shoulder y');
  close(P.elbow_near.x, 14, 'elbow x'); close(P.elbow_near.y, 5, 'elbow y'); close(P.elbow_near.a, 0, 'elbow points right');
  close(P.hand_near.x, 14, 'hand x'); close(P.hand_near.y, 8, 'hand hangs down');
  // turning the elbow turns the hand with it, and moving the root moves everything
  const Q = R.solve(ARM, { root: { dx: 1, dy: -2 }, angles: { elbow_near: 0 } });
  close(Q.elbow_near.x, 11, 'elbow up'); close(Q.elbow_near.y, -1, 'elbow up y'); close(Q.hand_near.x, 14, 'hand follows the elbow');
});

test('a rig is checked: unknown parents, loops and two roots are errors', () => {
  assert.deepEqual(R.validateRig(ARM), []);
  assert.deepEqual(R.validateRig(PIP.rig), []);
  assert.match(R.validateRig({ ...ARM, joints: [...ARM.joints, { id: 'x', parent: 'nope', len: 1 }] }).join(), /not in the rig/);
  assert.match(R.validateRig({ ...ARM, joints: [{ id: 'a', parent: 'b', len: 1 }, { id: 'b', parent: 'a', len: 1 }] }).join(), /loops/);
  assert.match(R.validateRig({ ...ARM, joints: [...ARM.joints, { id: 'r2', parent: null }] }).join(), /exactly one root/);
});

test('angles interpolate the short way round', () => {
  close(R.angleLerp(170, -170, 0.5), 180, 'across 180');
  close(R.wrap(R.angleLerp(350, 10, 0.25)), -5, 'across 0');
  close(R.wrap(370), 10, 'wrap'); close(R.wrap(-180), 180, 'wrap -180');
  const mid = R.lerpPose(ARM, { angles: { elbow_near: 170 } }, { angles: { elbow_near: -170 } }, 0.5);
  close(Math.abs(mid.angles.elbow_near), 180, 'pose lerp takes the short way');
});

test('poses between keys follow their ease; a loop wraps back to its first key', () => {
  const a = { angles: { elbow_near: 0 } }, b = { angles: { elbow_near: 80 } };
  const lin = { frames: 8, loop: true, keys: [{ frame: 0, pose: a }, { frame: 4, pose: b }] };
  close(R.poseAt(ARM, lin, 2).angles.elbow_near, 40, 'linear halfway');
  close(R.poseAt(ARM, lin, 6).angles.elbow_near, 40, 'back the other way after the last key');
  close(R.poseAt(ARM, lin, 8).angles.elbow_near, 0, 'frame 8 is frame 0 again');
  close(R.poseAt(ARM, { ...lin, keys: [{ frame: 0, pose: a, ease: 'smooth' }, { frame: 4, pose: b }] }, 1).angles.elbow_near, 80 * R.EASES.smooth(0.25), 'smooth');
  close(R.poseAt(ARM, { ...lin, keys: [{ frame: 0, pose: a, ease: 'hold' }, { frame: 4, pose: b }] }, 3).angles.elbow_near, 0, 'hold keeps the key');
  const once = { frames: 8, loop: false, keys: [{ frame: 0, pose: a }, { frame: 4, pose: b }] };
  close(R.poseAt(ARM, once, 6).angles.elbow_near, 80, 'a one-shot stays on its last key');
  const { seam, maxStep } = R.loopSeam(ARM, lin);
  assert.ok(seam <= maxStep + 1e-9, 'the seam of a symmetric loop is no bigger than its steps');
});

test('mirror swaps near and far limbs by world angle, leaving the attachments alone', () => {
  const pose = { angles: { elbow_near: 45, hand_near: 10, elbow_far: -100, hand_far: 0 } };
  const m = R.mirror(ARM, pose, { keep: [] }), P = R.solve(ARM, pose), M = R.solve(ARM, m);
  close(M.elbow_near.a, P.elbow_far.a, 'near takes the far world angle'); close(M.hand_far.a, P.hand_near.a, 'and the other way');
  close(M.shoulder.a, P.shoulder.a, 'unpaired joints do not move');
  // mirroring twice gives the pose back
  const back = R.solve(ARM, R.mirror(ARM, m));
  for (const id of Object.keys(P)) { close(back[id].x, P[id].x, `${id} x`); close(back[id].y, P[id].y, `${id} y`); }
});

test("Pip's walk: four keys from two, a smooth loop, legs that stay their length", () => {
  const anim = R.expandKeys(PIP.rig, PIP.anim);
  assert.deepEqual(anim.keys.map(k => `${k.frame}:${k.label}`), ['0:contact_a', '2:passing_a', '4:contact_b', '6:passing_b']);
  const poses = R.framePoses(PIP.rig, anim);
  assert.equal(poses.length, 8);
  const { seam, maxStep } = R.loopSeam(PIP.rig, anim);
  assert.ok(seam <= maxStep + 1e-9, `the loop's seam (${seam.toFixed(2)} px) is no bigger than its largest step (${maxStep.toFixed(2)} px)`);
  for (const p of poses) {
    const P = R.solve(PIP.rig, p);
    close(Math.hypot(P.knee_near.x - P.hip_near.x, P.knee_near.y - P.hip_near.y), 2.5, 'thigh length');
    // the feet stay on the sprite's canvas
    for (const id of ['toe_near', 'toe_far', 'ankle_near', 'ankle_far']) assert.ok(P[id].y <= PIP.rig.size.h + .5 && P[id].x >= 0 && P[id].x <= PIP.rig.size.w, `${id} on the canvas`);
  }
  // contact a has the near boot in front, contact b the far one
  const A = R.solve(PIP.rig, anim.keys[0].pose), B = R.solve(PIP.rig, anim.keys[2].pose);
  assert.ok(A.toe_near.x > A.toe_far.x && B.toe_far.x > B.toe_near.x);
});

test('the guide is drawn the same every time, in the mode asked for', () => {
  const pose = R.poseAt(PIP.rig, R.expandKeys(PIP.rig, PIP.anim), 1), hash = im => createHash('sha256').update(im.data).digest('hex');
  const g1 = R.renderGuide(PIP.rig, pose, { w: 128, h: 128 }), g2 = R.renderGuide(PIP.rig, pose, { w: 128, h: 128 });
  assert.equal(hash(g1), hash(g2));
  const count = (im, c) => { let n = 0; for (let i = 0; i < im.data.length; i += 4) if (im.data[i] === c[0] && im.data[i + 1] === c[1] && im.data[i + 2] === c[2]) n++; return n; };
  assert.ok(count(g1, R.GUIDE_COLORS.near) > 20 && count(g1, R.GUIDE_COLORS.far) > 20 && count(g1, R.GUIDE_COLORS.silhouette) > 200, 'combined has both legs and the silhouette');
  const sk = R.renderGuide(PIP.rig, pose, { w: 128, h: 128, mode: 'skeleton' }), si = R.renderGuide(PIP.rig, pose, { w: 128, h: 128, mode: 'silhouette' });
  assert.equal(count(sk, R.GUIDE_COLORS.silhouette), 0, 'no silhouette in the skeleton guide');
  assert.equal(count(si, R.GUIDE_COLORS.near), 0, 'no bones in the silhouette guide');
  // the whole figure fits the picture with its margin
  const m = R.guideMap(PIP.rig, 128, 128);
  assert.ok(m.ox >= 0 && m.oy >= 0 && m.ox + PIP.rig.size.w * m.s <= 128 && m.oy + PIP.rig.size.h * m.s <= 128);
  const { im, cells } = R.guideStrip(PIP.rig, [pose, pose, pose], { cols: 3, cw: 64, ch: 80 });
  assert.equal(im.width, 192); assert.equal(im.height, 80); assert.equal(cells[2].x, 128);
});

test('resolvePose: world directions and reach targets become local angles; the knee bends to the front', () => {
  const p = R.resolvePose(PIP.rig, { root: { dx: 0, dy: 1 }, reach: { ankle_near: { at: [17.5, 31.5], bend: 'front', foot: 0 } }, world: { elbow_near: 130 } });
  const P = R.solve(PIP.rig, p);
  close(Math.round(P.ankle_near.x * 1e6) / 1e6, 17.5, 'the ankle lands on its x'); close(Math.round(P.ankle_near.y * 1e6) / 1e6, 31.5, 'and its y');
  assert.ok(Math.abs(R.wrap(P.toe_near.a)) < 1e-6, 'the toe flat on the floor');
  assert.ok(Math.abs(R.wrap(P.elbow_near.a - 130)) < 1e-6, 'the upper arm points where it was told');
  const hip = P.hip_near, line = (P.ankle_near.x - hip.x) * (P.knee_near.y - hip.y) - (P.ankle_near.y - hip.y) * (P.knee_near.x - hip.x);
  assert.ok(P.knee_near.x > Math.min(hip.x, P.ankle_near.x), 'the knee in front');
  const back = R.solve(PIP.rig, R.resolvePose(PIP.rig, { reach: { ankle_near: { at: [17.5, 31], bend: 'back' } } }));
  assert.ok(back.knee_near.x < P.knee_near.x, 'bend: back puts the knee behind');
  assert.equal(R.resolvePose(PIP.rig, { angles: { knee_near: 10 } }).angles.knee_near, 10, 'a plain pose stays as it is');
  assert.ok(line !== 0);
});
