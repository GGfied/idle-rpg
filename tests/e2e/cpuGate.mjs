/* global console */
// CPU gate for headless Chrome launches (user, 2026-10-09: "check available cpu before even deciding to spawn the
// headless"). Pure decision + the machine-wide probes; cdp.mjs startChrome waits on it before spawning.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

export const DEFAULT_CHROME_CAP = 4;
export const DEFAULT_CPU_SHARE = 0.8;
export const GATE_VALVE_MS = 10 * 60e3;

/**
 * Decide: 'go' or 'wait'. chromes = headless root Chromes machine-wide (must be < chromeCap). CPU rule (user,
 * 2026-10-09: keep 20% of the CPU free for his other work): launch only if load1 + 1 (the new Chrome's expected
 * cost, ~1 core) <= cpuCount x share (default 0.8; 8 cores -> load1 <= 5.4).
 */
export function gateDecision({
  chromes,
  load1,
  cpuCount,
  chromeCap = DEFAULT_CHROME_CAP,
  share = DEFAULT_CPU_SHARE,
}) {
  return chromes < chromeCap && load1 + 1 <= cpuCount * share + 1e-9 ? 'go' : 'wait';
}

/** Count root headless Chromes of ALL agents (renderer/gpu/utility helpers carry --type= and are skipped). */
export function countHeadlessChromes(psOutput) {
  return psOutput
    .split('\n')
    .filter((l) => l.includes('--headless') && !l.includes('--type=') && !l.includes('cpuGate'))
    .length;
}

function psChromes() {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'pid,command'], { maxBuffer: 64e6 }, (err, out) =>
      resolve(err ? 0 : countHeadlessChromes(out)),
    );
  });
}

const snapshot = async () => ({
  chromes: await psChromes(),
  load1: loadavg()[0],
  cpuCount: cpus().length,
});
/** Share of the CPU the tests may use (E2E_CPU_SHARE, default 0.8). */
export const cpuShare = () => Number(process.env.E2E_CPU_SHARE) || DEFAULT_CPU_SHARE;
const limits = () => ({
  chromeCap: Number(process.env.E2E_CHROME_CAP) || DEFAULT_CHROME_CAP,
  share: cpuShare(),
});
const state = (s) => {
  const { share } = limits();
  return `${s.chromes} chromes (cap ${limits().chromeCap}), load ${s.load1.toFixed(1)} / budget ${(s.cpuCount * share - 1).toFixed(1)} (${Math.round(share * 100)}% of ${s.cpuCount} cores, minus 1 for the new Chrome)`;
};
// Slot claims: a spawned Chrome shows up in `ps` only after ~0.5-2 s, so concurrent waiters would all see the same free
// slot (measured: 5 Chromes with cap 4). The check + claim runs under a mkdir lock; a claim counts for CLAIM_MS.
const CLAIM_DIR = join(tmpdir(), 'idle-rpg-e2e-cpu-gate');
const CLAIM_MS = 5000;
const freshClaims = () => {
  mkdirSync(CLAIM_DIR, { recursive: true });
  const now = Date.now();
  return readdirSync(CLAIM_DIR).filter((f) => {
    if (f === 'lock') return false;
    try {
      const age = now - statSync(join(CLAIM_DIR, f)).mtimeMs;
      if (age > 60e3) rmSync(join(CLAIM_DIR, f), { force: true });
      return age < CLAIM_MS;
    } catch {
      return false;
    }
  }).length;
};
const claim = () =>
  writeFileSync(join(CLAIM_DIR, `${process.pid}-${Date.now()}-${Math.random()}`), '');
async function withLock(fn) {
  mkdirSync(CLAIM_DIR, { recursive: true });
  const lock = join(CLAIM_DIR, 'lock');
  for (let i = 0; ; i++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10e3)
          rmSync(lock, { recursive: true, force: true });
      } catch {
        /* lock vanished */
      }
      await nap(30 + Math.random() * 120);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms + Math.random() * ms;

/** Resolve when the machine has room for one more headless Chrome (or after the 10 min safety valve). */
export async function waitForCpu({
  valveMs = GATE_VALVE_MS,
  pollMs = 2000,
  onWait = () => {},
} = {}) {
  const t0 = Date.now();
  let waited = false;
  let lastBeat = Date.now();
  for (;;) {
    const s = await withLock(async () => {
      const snap = await snapshot();
      snap.chromes += freshClaims();
      if (gateDecision({ ...snap, ...limits() }) === 'go') claim();
      else snap.wait = true;
      return snap;
    });
    if (!s.wait) {
      if (waited) console.log(`[cpu-gate] proceeding after ${Date.now() - t0} ms: ${state(s)}`);
      return Date.now() - t0;
    }
    if (!waited) {
      waited = true;
      console.log(`[cpu-gate] waiting: ${state(s)}`);
    }
    if (Date.now() - t0 > valveMs) {
      console.log(
        `[cpu-gate] WARNING: waited ${Date.now() - t0} ms (safety valve), launching anyway: ${state(s)}`,
      );
      return Date.now() - t0;
    }
    onWait();
    // Heartbeat line: a runParallel parent counts child output as activity, so it does not call the wait STUCK.
    if (Date.now() - lastBeat >= 30e3) {
      lastBeat = Date.now();
      console.log(`[cpu-gate] still waiting ${Math.round((lastBeat - t0) / 1000)} s: ${state(s)}`);
    }
    await nap(jitter(pollMs));
  }
}

/**
 * Budget maths (pure). Wall time spent queued in the CPU gate is not the test's own time: judged wall = tookMs - gateMs
 * (never below 0). The limit is baseMs x slowdown; the CPU-seconds limit (baseMs/1000 x cpuUnits) is unchanged.
 */
export function budgetJudge({
  tookMs,
  gateMs = 0,
  baseMs,
  slowdown = 1,
  cpuSec = 0,
  cpuUnits = 1,
}) {
  const judgedMs = Math.max(0, tookMs - Math.max(0, gateMs));
  const effMs = Math.round(baseMs * Math.max(1, slowdown));
  const cpuMax = (baseMs / 1000) * cpuUnits;
  const wallOk = judgedMs <= effMs;
  const cpuOk = cpuSec <= cpuMax;
  return { ok: wallOk && cpuOk, wallOk, cpuOk, judgedMs, effMs, cpuMax };
}
