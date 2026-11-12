// Reactions, burning and heat (engine plan D2, the second half) with no game and no browser: water meets lava, fire spreads through wood by heat, metal
// carries heat, lava lights what it touches, water puts a fire out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';

// materials: 1 rock, 2 water, 3 lava (hot, thick, heavy: lava + water makes stone and steam), 4 stone, 5 wood (burns), 6 metal (conducts heat)
const hotWorld = () => {
  const E = loadEngine(); E.run('seedRandom(7); setResVars(2)');   // (seeded: fire spreads by chance, and a run on an unlucky seed fails about one time in twenty)
  E.run(`defineMaterial('rock', { tough: 5, anchor: true }); defineMaterial('water', { liquid: true, albedo: [.2, .5, .9], viscosity: .05, density: 1 });
    defineMaterial('lava', { liquid: true, albedo: [1, .4, .1], viscosity: .7, density: 2, hot: 1.2, conduct: .6 }); defineMaterial('stone', { tough: 2, anchor: true });
    defineMaterial('wood', { flammable: .03, ignite: .3, conduct: .4, burnsTo: 0 }); defineMaterial('metal', { conduct: 1, tough: 5, anchor: true });
    setMaterial(3, { reacts: [{ with: 2, makes: 4, heat: .6, chance: .5 }] });
    worldMaterials({ edge: 1 }); worldInit(100 * RES, 60 * RES); globalThis.F = H - 4 * RES; for (let y = F; y < H; y++) for (let x = 0; x < W; x++) setC(x, y, 1);`);
  return E;
};
const count = (E, m) => E.run(`(() => { let n = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === ${m}) n++; return n; })()`);
const run = (E, n) => { let steam = 0; for (let i = 0; i < n; i++) { E.run('frameNo++; stepParticles(DT); simGranular(); coolHeat(0, 0, W, H);'); steam = Math.max(steam, E.run('P.n')); } return steam; };

test('water meets lava: the lava cell turns to stone, the water cell is used up and steams; the numbers add up and the stone is hot', () => {
  const E = hotWorld();
  E.run('globalThis.bx0 = 20 * RES; globalThis.bx1 = 70 * RES; for (let y = F - 20 * RES; y < F; y++) { setC(bx0, y, 1); setC(bx1, y, 1); }');
  E.run('for (let y = F - 6 * RES; y < F; y++) for (let x = bx0 + 1; x < bx0 + 20 * RES; x++) setC(x, y, 3);');   // lava on the left
  const lava0 = count(E, 3); assert.ok(E.run('heat[(F - 1) * W + bx0 + 4]') > 1, 'setC made the lava hot');
  run(E, 120);
  E.run('for (let y = F - 20 * RES; y < F - 10 * RES; y++) for (let x = bx0 + 30 * RES; x < bx0 + 40 * RES; x++) setC(x, y, 2);');   // water poured in on the right
  const water0 = count(E, 2); let steam = 0, hottest = 0;
  for (let i = 0; i < 900; i++) { steam = Math.max(steam, run(E, 1)); hottest = Math.max(hottest, E.run('(() => { let h = 0; for (let i = 0; i < cells.length; i++) if (cells[i] === 4) h = Math.max(h, heat[i]); return h; })()')); }
  const stone = count(E, 4);
  assert.ok(stone > 10, `stone formed (${stone} cells)`); assert.equal(count(E, 3) + stone, lava0, 'every stone cell was a lava cell');
  assert.ok(water0 - count(E, 2) >= stone, `and used up a water cell each (${water0} -> ${count(E, 2)})`); assert.ok(steam > 3, `with steam (${steam} particles at most)`);
  assert.ok(hottest > .5, `the new stone is hot (${hottest.toFixed(2)}) and cools off`);
});

test('fire spreads through wood by heat, stops at a rock gap, crosses a metal bar that conducts, and water puts it out', () => {
  const burn = (gap, wet) => {
    const E = hotWorld();
    E.run('for (let y = F - 6 * RES; y < F; y++) for (let x = 20 * RES; x < 40 * RES; x++) setC(x, y, 5);');   // wood block A, then the gap, then wood block B
    if (gap === 'metal') E.run('for (let y = F - 6 * RES; y < F; y++) for (let x = 40 * RES; x < 40 * RES + 4; x++) setC(x, y, 6);');   // a bar of 4 cells
    if (gap === 'rock') E.run('for (let y = F - 6 * RES; y < F; y++) for (let x = 40 * RES; x < 40 * RES + 4; x++) setC(x, y, 1);');
    E.run('for (let y = F - 6 * RES; y < F; y++) for (let x = 40 * RES + 4; x < 52 * RES + 4; x++) setC(x, y, 5);');
    if (wet) E.run('for (let y = F - 7 * RES; y < F - 6 * RES; y++) for (let x = 20 * RES; x < 40 * RES; x++) setC(x, y, 2);');   // a layer of water on top of block A
    const left = (x0, x1) => E.run(`(() => { let n = 0; for (let y = 0; y < H; y++) for (let x = ${x0} * RES; x < ${x1} * RES; x++) if (cells[y * W + x] === 5) n++; return n; })()`);
    const a0 = left(20, 40), b0 = left(40, 54);
    E.run('addHeat(21 * RES, F - 6 * RES, .8)');   // lit in the top row, where the water lies in the wet case
    run(E, 1500);
    return { a: left(20, 40) / a0, b: left(40, 54) / b0 };
  };
  const rock = burn('rock'), metal = burn('metal'), wet = burn('rock', true);
  assert.ok(rock.a < .05, `block A burned (${(rock.a * 100).toFixed(0)}% left)`); assert.ok(rock.b > .95, 'across a rock gap, block B did not catch');
  assert.ok(metal.b < .2, `a metal bar carries the heat across: block B burned (${(metal.b * 100).toFixed(0)}% left)`);
  assert.ok(wet.a > .5, `water on top puts it out (${(wet.a * 100).toFixed(0)}% of A left)`);
});

test('heat flows from hot to cold along a conducting bar and is conserved; lava sets the wood it touches on fire', () => {
  const E = hotWorld();
  E.run('for (let x = 30 * RES; x < 60 * RES; x++) setC(x, F - 1, 6); heat[(F - 1) * W + 30 * RES] = 1.0;');
  const total = () => E.run('(() => { let s = 0; for (let x = 30 * RES; x < 60 * RES; x++) s += heat[(F - 1) * W + x]; return s; })()');
  const t0 = total(); for (let i = 0; i < 200; i++) E.run('conductHeat(0, 0, W, H)');
  assert.ok(Math.abs(total() - t0) < 1e-3, `heat is conserved by conduction (${t0.toFixed(3)} -> ${total().toFixed(3)})`);
  assert.ok(E.run('heat[(F - 1) * W + 30 * RES + 10]') > .02 && E.run('heat[(F - 1) * W + 30 * RES + 1]') < .9, 'it spread along the bar');
  const L = hotWorld();
  L.run('for (let y = F - 4 * RES; y < F; y++) { setC(19 * RES, y, 1); for (let x = 20 * RES; x < 30 * RES; x++) setC(x, y, 3); for (let x = 30 * RES; x < 36 * RES; x++) setC(x, y, 5); }');   // wood against a lava pool
  const w0 = count(L, 5); run(L, 1500);
  assert.ok(count(L, 5) < w0 * .5, `the lava set the wood on fire (${count(L, 5)} of ${w0} cells left)`);
});

test('a world without any of these materials takes none of the reaction paths', () => {
  const E = loadEngine(); E.run("defineMaterial('rock', { tough: 5, anchor: true }); defineMaterial('sand', { granular: true }); worldInit(40, 40)");
  assert.equal(E.run('ANY_COND + ANY_HOT'), 0); assert.equal(E.run('MAT_FALL[2]'), 1, 'sand falls and nothing more'); assert.equal(E.run('MAT_FALL[1]'), 0);
});
