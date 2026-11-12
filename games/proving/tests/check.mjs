// Is the Proving Ground finishable, and can every coin be reached? The engine's reach search (reachSearch) plays the hero's real controller
// on the real level, in Node with no browser (tests/node/engine-harness.mjs). About a minute.
//   node games/proving/tests/check.mjs
import { loadEngine } from '../../../tests/node/engine-harness.mjs';

const E = loadEngine({ game: 'proving' });
E.run('setResVars(2); setGravity(TUNE.gravity); newLevel(false)');
const r = E.run('provingCheck()');
console.log(JSON.stringify(r));
const ok = r.goal && r.coins[0] === r.coins[1] && r.checkpoints[0] === r.checkpoints[1];
console.log(ok ? `ok   the goal and all ${r.coins[1]} coins and ${r.checkpoints[1]} checkpoints can be reached (${r.spots} standing spots)` : `FAIL the level cannot be finished: goal ${r.goal}, missing coins ${JSON.stringify(r.missing)}`);
process.exit(ok ? 0 : 1);
