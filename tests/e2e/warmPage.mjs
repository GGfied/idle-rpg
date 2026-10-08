/* global console */
// Warms a shared e2e server: node tests/e2e/warmPage.mjs <origin>   (run-all.mjs calls it once, before the files)
// Loads the game in one Chrome and imports every /src/... module any e2e file imports by path, so Vite transforms
// them ONCE here instead of once per file. Exits by itself (cdp.mjs watchdogs + killTracked).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hardTimeout, killTracked, launchChrome, waitFor } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const origin = (process.argv[2] ?? process.env.E2E_URL ?? '').replace(/\/?$/, '/');
if (!origin.startsWith('http')) throw new Error('usage: warmPage.mjs <origin>');
hardTimeout(3 * 60e3);
const mods = new Set();
for (const f of readdirSync(HERE).filter((x) => x.endsWith('.mjs')))
  for (const m of readFileSync(join(HERE, f), 'utf8').matchAll(/'(\/src\/[\w./-]+\.tsx?)'/g))
    mods.add(m[1]);
const t0 = Date.now();
let code = 0;
try {
  const cdp = await launchChrome({ width: 1280, height: 800 });
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `${origin}?tickMs=60` });
  await waitFor(
    () =>
      cdp
        .eval(
          "!!(window.__idleRpg && window.__idleRpg.scene && window.__idleRpg.scene().camera && document.querySelector('canvas'))",
        )
        .catch(() => false),
    { timeoutMs: 120000, label: 'warm: game ready' },
  );
  const ok = await cdp.eval(
    `Promise.all(${JSON.stringify([...mods])}.map((m) => import(m).then(() => 1, () => 0))).then((r) => r.reduce((a, b) => a + b, 0))`,
  );
  await cdp.close().catch(() => {});
  console.log(`warmed ${ok}/${mods.size} modules in ${Date.now() - t0} ms`);
} catch (e) {
  console.error('warm failed', e);
  code = 1;
}
killTracked();
process.exit(code);
