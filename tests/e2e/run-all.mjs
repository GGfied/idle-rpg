/* global console */
// Parallel e2e runner: node tests/e2e/run-all.mjs [filter-substring ...]
// Runs smoke.mjs + every tests/e2e/*.e2e.mjs, JOBS at a time (default CPU count / 2, env RUN_ALL_JOBS),
// each job in its own process group on a private block of 4 ports out of 5400-5499 (slots are reused, so the
// per-port vite cacheDir stays warm), 7 minute timeout per file. Suite time ~= sum / JOBS, not the sum.
// Exit code: 0 = every file exited 0; 1 = any failure/timeout. Logs: $RUN_ALL_LOGS or <tmp>/idle-rpg-run-all.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const JOBS = Number(process.env.RUN_ALL_JOBS ?? Math.max(1, cpus().length - 2));
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
const slots = Array.from({ length: JOBS }, (_, i) => BASE + i * BLOCK);
const rows = [];
const live = new Set();

function runOne(file, port) {
  return new Promise((done) => {
    const t0 = Date.now();
    const env = {
      ...process.env,
      E2E_PORT: String(port),
      MM_PORT: String(port),
      SMOKE_PORT: String(port),
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
process.on('SIGINT', () => {
  killAll();
  process.exit(130);
});

const t0 = Date.now();
const total = files.length;
console.log(`run-all: ${total} files, ${JOBS} at a time, ports ${BASE}+, logs ${LOGS}`);
await Promise.all(slots.map(worker));
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
console.log(`\nslowest 3: ${slow.map((r) => `${r.file} ${r.s.toFixed(0)}s`).join(', ')}`);
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
