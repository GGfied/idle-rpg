/* global fetch, console */
// Shared warm LIVE test server: one frozen-config vite on :5300 (own cacheDir in os.tmpdir, never node_modules/.vite,
// never :5173). Idempotent. Live e2e runs use it with `E2E_SHARED=1 node tests/e2e/<x>.e2e.mjs` (or E2E_URL=...).
//   node tests/e2e/warmServer.mjs          start (if needed) + warm, leave running
//   node tests/e2e/warmServer.mjs stop     kill it by the PID in the pid file
// PID file: <os.tmpdir()>/idle-rpg-warm-5300.pid. It serves the LIVE tree only; mutants start their own server.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { hardTimeout, killTracked, launchChrome, sleep, waitFor } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const WARM_PORT = 5300;
export const PID_FILE = join(tmpdir(), `idle-rpg-warm-${WARM_PORT}.pid`);
const ORIGIN = `http://127.0.0.1:${WARM_PORT}/`;

const serving = async () => {
  try {
    const r = await fetch(ORIGIN);
    return r.ok && (await r.text()).includes('/src/app/main.tsx');
  } catch {
    return false;
  }
};

async function stop() {
  if (!existsSync(PID_FILE)) return console.log('no pid file');
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  try {
    process.kill(pid);
    console.log(`killed warm server pid ${pid}`);
  } catch {
    console.log(`pid ${pid} already gone`);
  }
  rmSync(PID_FILE, { force: true });
}

async function warm() {
  const t0 = Date.now();
  const cdp = await launchChrome({ width: 1280, height: 800 });
  try {
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `${ORIGIN}?tickMs=60` });
    await waitFor(
      () =>
        cdp
          .eval(
            "!!(window.__idleRpg && window.__idleRpg.scene && window.__idleRpg.scene().camera && document.querySelector('canvas'))",
          )
          .catch(() => false),
      { timeoutMs: 90000, label: 'warm: game ready' },
    );
    // also touch modules the e2e helpers import dynamically
    await cdp.eval(
      "Promise.all(['/src/render/projection.ts','/src/render/index.ts','/src/features/world/index.ts','/src/app/registry.ts','/src/core/progression/index.ts'].map((m) => import(m))).then(() => true)",
    );
    await cdp.close().catch(() => {});
  } finally {
    killTracked();
  }
  console.log(`warmed in ${Date.now() - t0} ms`);
}

async function main() {
  hardTimeout(4 * 60e3);
  if (process.argv[2] === 'stop') return stop();
  if (await serving()) {
    console.log(`warm server already up on :${WARM_PORT} (pid file ${PID_FILE})`);
  } else {
    const proc = spawn(
      resolve(ROOT, 'node_modules/.bin/vite'),
      [
        '--config',
        resolve(ROOT, 'tests/e2e/vite.frozen.config.mjs'),
        '--port',
        String(WARM_PORT),
        '--strictPort',
        '--host',
        '127.0.0.1',
      ],
      { cwd: ROOT, stdio: 'ignore', detached: true },
    );
    proc.unref();
    writeFileSync(PID_FILE, String(proc.pid));
    for (let i = 0; i < 150 && !(await serving()); i++) await sleep(200);
    if (!(await serving())) throw new Error(`vite did not come up on :${WARM_PORT}`);
    console.log(`started vite pid ${proc.pid} on :${WARM_PORT}`);
  }
  await warm();
  console.log(`READY ${ORIGIN} pid file ${PID_FILE}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
