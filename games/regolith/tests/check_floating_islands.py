import asyncio, json
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3].as_posix()   # repo root (this file is games/regolith/tests/x.py)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-gpu'])
        page = await b.new_page(viewport={'width': 1000, 'height': 700})
        await page.goto(f'file://{ROOT}/dist/games/regolith/index.html#2d'); await page.wait_for_timeout(600)
        for res in [1, 2, 3]:
            await page.evaluate(f'setDetail({res})')
            for lv in range(1, 9):
                r = await page.evaluate('''(lv) => { genLevel(lv);
                  const mark = new Uint8Array(W * H), st = [];
                  const push = i => { if (!mark[i] && cells[i] !== EMPTY) { mark[i] = 1; st.push(i); } };
                  for (let x = 0; x < W; x++) push((H - 1) * W + x);
                  for (let i = 0; i < W * H; i++) if (cells[i] === BED || cells[i] === METAL) push(i);
                  while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
                  const isl = []; const seen = new Uint8Array(W * H);
                  for (let i = 0; i < W * H; i++) if (cells[i] !== EMPTY && !mark[i] && !seen[i]) {
                    const q = [i]; seen[i] = 1; let n = 0, gran = 0; const mats = {}; let x0 = 1e9, y0 = 1e9;
                    while (q.length) { const j = q.pop(), x = j % W, y = (j / W) | 0; n++; const m = cells[j]; mats[m] = (mats[m] || 0) + 1; if (MAT_GRAN[m]) gran++; x0 = Math.min(x0, x); y0 = Math.min(y0, y);
                      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (k >= 0 && cells[k] !== EMPTY && !mark[k] && !seen[k]) { seen[k] = 1; q.push(k); } }
                    isl.push({ n, gran, mats: JSON.stringify(mats), at: [x0, y0] });
                  }
                  return { n: isl.length, nongran: isl.filter(s => s.gran < s.n).map(s => [s.n, s.mats, s.at]).slice(0, 8), gran: isl.filter(s => s.gran === s.n).length }; }''', lv)
                print('RES', res, 'lv', lv, json.dumps(r))
        await b.close()
asyncio.run(main())
