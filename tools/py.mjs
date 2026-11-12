// Run a Python script with whichever interpreter is installed (python3 on Linux and macOS, python on Windows):
//   node tools/py.mjs tests/smoke.py --all
import { spawnSync } from 'node:child_process';
for (const exe of ['python3', 'python']) {
  const r = spawnSync(exe, process.argv.slice(2), { stdio: 'inherit' });
  if (!r.error) process.exit(r.status ?? 1);
}
console.error('error: neither python3 nor python is installed'); process.exit(1);
