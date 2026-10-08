/* global console, fetch */
// Parallel e2e runner: node tests/e2e/run-all.mjs [filter-substring ...]
// Runs smoke.mjs + every tests/e2e/*.e2e.mjs, JOBS at a time (default 2, env RUN_ALL_JOBS),
// each job in its own process group on a private block of 4 ports out of 5400-5499 (slots are reused, so the
// per-port vite cacheDir stays warm), 7 minute timeout per file. Suite time ~= sum / JOBS, not the sum.
// Each file opens 2-4 Chromes, so JOBS=2 keeps ~4-8 browsers alive (project cap ~4 browser agents). The old default
// cpus-2 = 6 self-inflicted load 300-600 on 8 cores and killed 95/103 files (launchChrome / game-ready timeouts).
// Load gate: same rule as cdp.mjs (cpuGate.mjs gateDecision): a worker starts its next file only if load1 + 1 <=
// cpus x 0.8 (E2E_CPU_SHARE overrides; 20% stays free for the user), waiting at
// most 3 min so other agents' load can't stall the run forever. The peak load1 seen is printed at the end.
// ONE shared Vite dev server for the whole run (frozen config, own cacheDir, port RUN_ALL_PORT, default 5399): started and
// warmed once (warmPage.mjs imports every /src module the tests import by path), then every file gets E2E_URL + E2E_PORT
// pointing at it, so no file starts its own vite or re-transforms the game. RUN_ALL_OWN_VITE=1 = old behaviour (a vite per
// file/combo); a preset E2E_URL = use that server and don't start one. A file run alone still starts its own vite.
// Exit code: 0 = every file exited 0; 1 = any failure/timeout. Logs: $RUN_ALL_LOGS or <tmp>/idle-rpg-run-all.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cpuShare, gateDecision } from './cpuGate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const JOBS = Number(process.env.RUN_ALL_JOBS ?? 2);
const loadGo = () =>
  gateDecision({ chromes: 0, load1: loadavg()[0], cpuCount: cpus().length, share: cpuShare() }) ===
  'go';
let peakLoad = 0;
setInterval(() => (peakLoad = Math.max(peakLoad, loadavg()[0])), 2000).unref();
const FILE_TIMEOUT_MS = 7 * 60e3;
const BASE = 5400;
const BLOCK = 4; // smoke uses 3 consecutive ports; the rest use 1
const LOGS = process.env.RUN_ALL_LOGS ?? join(tmpdir(), 'idle-rpg-run-all');
mkdirSync(LOGS, { recursive: true });

const filters = process.argv.slice(2);
// Longest-first scheduling: tests/e2e/timings.json holds the last full-suite seconds per file (rewritten after a
// full run), so the slowest files start first and wall time ~= max(slowest file, sum / JOBS).
const TIMINGS = join(HERE, 'timings.json');
const known = existsSync(TIMINGS) ? JSON.parse(readFileSync(TIMINGS, 'utf8')) : {};
const files = [
  'smoke.mjs',
  ...readdirSync(HERE).filter((f) => f.endsWith('.e2e.mjs') && f !== 'TEMPLATE.e2e.mjs'),
]
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort((a, b) => (known[b] ?? 120) - (known[a] ?? 120) || a.localeCompare(b));

const portBusy = (p) => {
  try {
    return (
      execFileSync('lsof', ['-nP', `-iTCP:${p}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim() !==
      ''
    );
  } catch {
    return false; // lsof exits 1 when nothing listens
  }
};
const SHARED_PORT = Number(process.env.RUN_ALL_PORT ?? 5399);
let sharedUrl = process.env.E2E_URL ?? '';
let viteProc = null;
const stopVite = () => {
  if (!viteProc) return;
  try {
    process.kill(-viteProc.pid, 'SIGTERM'); // our own vite's process group only
  } catch {
    /* gone */
  }
  viteProc = null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startShared() {
  if (sharedUrl || process.env.RUN_ALL_OWN_VITE) return;
  if (portBusy(SHARED_PORT))
    throw new Error(`shared vite port ${SHARED_PORT} is busy (RUN_ALL_PORT)`);
  const t = Date.now();
  viteProc = spawn(
    join(ROOT, 'node_modules/.bin/vite'),
    [
      '--config',
      join(HERE, 'vite.frozen.config.mjs'),
      '--port',
      String(SHARED_PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { cwd: ROOT, detached: true, stdio: 'ignore' },
  );
  viteProc.unref();
  const url = `http://127.0.0.1:${SHARED_PORT}/`;
  for (let up = false; !up;) {
    if (Date.now() - t > 120e3) throw new Error('shared vite did not start within 120 s');
    up = await fetch(url).then(
      (r) => r.ok,
      () => false,
    );
    if (!up) await sleep(200);
  }
  const t1 = Date.now();
  const out = execFileSync(process.execPath, [join(HERE, 'warmPage.mjs'), url], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 200e3,
  });
  sharedUrl = url;
  console.log(`shared vite ${url}: up ${t1 - t} ms, ${out.trim()}`);
}
const slots = Array.from({ length: JOBS }, (_, i) => BASE + i * BLOCK);
const rows = [];
const live = new Set();

function runOne(file, port) {
  return new Promise((done) => {
    const t0 = Date.now();
    const own = sharedUrl ? Number(new URL(sharedUrl).port) || 80 : port;
    const env = {
      ...process.env,
      E2E_PORT: String(own), // files that build their own URL from the port get the shared server's
      MM_PORT: String(own),
      SMOKE_PORT: String(own),
      ...(sharedUrl ? { E2E_URL: sharedUrl } : {}),
    };
    const kid = spawn(process.execPath, [join(HERE, file)], {
      cwd: ROOT,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    live.add(kid);
    let out = '';
    kid.stdout.on('data', (d) => (out += d));
    kid.stderr.on('data', (d) => (out += d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-kid.pid, 'SIGKILL'); // our own process group only
      } catch {
        /* already gone */
      }
    }, FILE_TIMEOUT_MS);
    kid.on('close', (code) => {
      clearTimeout(timer);
      live.delete(kid);
      writeFileSync(join(LOGS, `${file}.log`), out);
      const pass = (out.match(/^(PASS|XFAIL)\b/gm) ?? []).length;
      const fail = (out.match(/^(FAIL|XPASS)\b/gm) ?? []).length;
      rows.push({
        file,
        code: timedOut ? 'TIMEOUT' : code,
        pass,
        fail,
        s: (Date.now() - t0) / 1000,
        port,
      });
      done();
    });
  });
}

async function worker(base) {
  for (;;) {
    const file = files.shift();
    if (!file) return;
    for (let w = 0; !loadGo() && w < 180; w += 2) await new Promise((r) => setTimeout(r, 2000));
    let port = base;
    while (Array.from({ length: BLOCK }, (_, k) => port + k).some(portBusy)) port += BLOCK * JOBS; // never share a port
    if (port > 5499 - BLOCK) {
      rows.push({ file, code: 'NOPORT', pass: 0, fail: 0, s: 0, port: 0 });
      continue;
    }
    await runOne(file, port);
    process.stdout.write(
      `  done ${file} ${rows.at(-1).code === 0 ? 'ok' : 'FAILED'} (${rows.at(-1).s.toFixed(0)}s)\n`,
    );
  }
}

const killAll = () => {
  for (const k of live) {
    try {
      process.kill(-k.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
};
process.on('exit', stopVite);
for (const sig of ['SIGTERM', 'SIGHUP'])
  process.on(sig, () => {
    killAll();
    stopVite();
    process.exit(143);
  });
process.on('SIGINT', () => {
  killAll();
  stopVite();
  process.exit(130);
});

const t0 = Date.now();
const total = files.length;
console.log(`run-all: ${total} files, ${JOBS} at a time, ports ${BASE}+, logs ${LOGS}`);
try {
  await startShared();
} catch (e) {
  console.error(String(e));
  stopVite();
  process.exit(2);
}
console.log(sharedUrl ? `shared server ${sharedUrl}` : 'own vite per file (RUN_ALL_OWN_VITE)');
await Promise.all(slots.map(worker));
stopVite();
const wall = (Date.now() - t0) / 1000;
rows.sort((a, b) => a.file.localeCompare(b.file));
console.log(
  '\nfile'.padEnd(34) + 'exit'.padEnd(9) + 'pass'.padEnd(6) + 'fail'.padEnd(6) + 'seconds',
);
for (const r of rows)
  console.log(
    `${r.file.padEnd(33)} ${String(r.code).padEnd(8)}${String(r.pass).padEnd(6)}${String(r.fail).padEnd(6)}${r.s.toFixed(1)}`,
  );
if (!filters.length) {
  // full run: refresh the schedule hints (only files that really ran to the end)
  const next = { ...known };
  for (const r of rows) if (r.code === 0 || r.code === 1) next[r.file] = Math.round(r.s * 10) / 10;
  writeFileSync(TIMINGS, JSON.stringify(next, null, 2) + '\n');
}
const bad = rows.filter((r) => r.code !== 0);
const slow = [...rows].sort((a, b) => b.s - a.s).slice(0, 3);
console.log(
  `\npeak load1 ${peakLoad.toFixed(1)} (gate: load1 + 1 <= ${cpus().length * cpuShare()}, ${cpus().length} cpus)`,
);
console.log(`slowest 3: ${slow.map((r) => `${r.file} ${r.s.toFixed(0)}s`).join(', ')}`);
console.log(
  `over 60 s: ${
    rows
      .filter((r) => r.s > 60)
      .map((r) => `${r.file} ${r.s.toFixed(0)}s`)
      .join(', ') || '-'
  }`,
);
console.log(
  `BUDGET (qa bug if exceeded): file <= 60 s, full suite <= 300 s: ${rows.filter((r) => r.s > 60).length} files over, suite ${wall > 300 ? 'OVER' : 'ok'}`,
);
console.log(
  `RUN-ALL ${bad.length ? 'FAIL' : 'PASS'}: ${rows.length - bad.length}/${rows.length} files ok, wall ${wall.toFixed(0)}s (budget 300s)`,
);
if (bad.length) console.log(`failed: ${bad.map((r) => `${r.file}(${r.code})`).join(' ')}`);
process.exit(bad.length ? 1 : 0);
