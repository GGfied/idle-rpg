/* global fetch, console, AbortSignal */
// Minimal Chrome DevTools Protocol client. No dependencies: Node's global WebSocket when present
// (Node 22+, or 20 with --experimental-websocket), otherwise a tiny raw-socket WebSocket client.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Buffer } from 'node:buffer';

export { sleep };

// ---- guaranteed cleanup -------------------------------------------------------------------
// Every child (Chrome, vite) is started in its own process group and killed as a group, so no
// headless Chrome helper or vite server outlives a run, even after Ctrl-C or a crash.
const tracked = new Set();
let hooked = false;
function killGroup(proc) {
  if (!proc || proc.pid === undefined) return;
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}
export function killTracked() {
  for (const p of tracked) killGroup(p);
  tracked.clear();
}

// ---- watchdogs: a script can never hang ---------------------------------------------------
// Armed on first import. Global deadline (E2E_MAX_MS, default 6 min) -> exit 3. Idle deadline
// (E2E_IDLE_MS, default 120 s without any CDP traffic or activity() call) -> "E2E STUCK" exit 4.
let lastAction = 'startup';
let lastActionAt = Date.now();
/** Record progress (called on every CDP message; scripts may call it from check()). */
export function activity(what) {
  lastAction = what;
  lastActionAt = Date.now();
}
const MAX_MS = Number(process.env.E2E_MAX_MS ?? 6 * 60e3);
const IDLE_MS = Number(process.env.E2E_IDLE_MS ?? 120e3);
setTimeout(() => {
  console.error(`E2E TIMEOUT: global deadline ${MAX_MS} ms (last action: ${lastAction})`);
  killTracked();
  process.exit(3);
}, MAX_MS).unref();
setInterval(
  () => {
    if (Date.now() - lastActionAt < IDLE_MS) return;
    console.error(`E2E STUCK: no activity for ${IDLE_MS} ms (last action: ${lastAction})`);
    killTracked();
    process.exit(4);
  },
  Math.min(1000, Math.max(50, IDLE_MS / 4)),
).unref();

/** Default per-call timeout for CDP sends and waits (ms). */
export const CDP_TIMEOUT_MS = Number(process.env.E2E_CDP_TIMEOUT_MS ?? 20e3);

/** Poll `fn` until truthy; rejects with `label` after timeoutMs. Returns the truthy value. */
export async function waitFor(
  fn,
  { timeoutMs = CDP_TIMEOUT_MS, intervalMs = 100, label = 'condition' } = {},
) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    activity(`waitFor ${label}`);
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`waitFor timed out after ${timeoutMs} ms: ${label}`);
    await sleep(intervalMs);
  }
}

/** Run the script body, then kill vite/Chrome and exit (0 ok, 1 on throw or falsy-nonzero code). */
export async function runMain(fn) {
  installHooks();
  let code = 0;
  try {
    const r = await fn();
    if (typeof r === 'number') code = r;
  } catch (e) {
    console.error(e);
    code = 1;
  }
  killTracked();
  process.exit(code);
}
function installHooks() {
  if (hooked) return;
  hooked = true;
  process.on('exit', killTracked);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(sig, () => {
      killTracked();
      process.exit(130);
    });
  for (const ev of ['uncaughtException', 'unhandledRejection'])
    process.on(ev, (e) => {
      console.error(ev, e);
      killTracked();
      process.exit(1);
    });
}
/** Spawn a child in its own process group and kill the whole group on exit/signals/crashes. */
export function spawnTracked(cmd, args, opts = {}) {
  installHooks();
  const proc = spawn(cmd, args, { ...opts, detached: true });
  // Detached children with piped stdio would otherwise keep the event loop alive.
  proc.unref();
  for (const s of [proc.stdin, proc.stdout, proc.stderr]) s?.unref?.();
  tracked.add(proc);
  return proc;
}
/** Hard overall deadline for a script: kill every tracked child and exit 2. */
export function hardTimeout(ms = 8 * 60e3) {
  installHooks();
  setTimeout(() => {
    console.error(`e2e: hard timeout after ${ms} ms`);
    killTracked();
    process.exit(2);
  }, ms).unref();
}
/** Kill a tracked child's whole group now (use in `finally`). */
export function killChild(proc) {
  killGroup(proc);
  tracked.delete(proc);
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH.');
  return found;
}

/** Raw RFC 6455 client: text frames only, enough for CDP. Same surface as the bits of WebSocket we use. */
class RawWebSocket {
  constructor(url) {
    const u = new URL(url);
    this.listeners = { open: [], message: [], close: [], error: [] };
    this.buf = Buffer.alloc(0);
    this.upgraded = false;
    this.fragments = [];
    const key = randomBytes(16).toString('base64');
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    this.sock = netConnect(Number(u.port), u.hostname, () => {
      this.sock.write(
        `GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    this.sock.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      if (!this.upgraded) {
        const end = this.buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = this.buf.subarray(0, end).toString();
        if (!head.includes(accept)) return this.emit('error', new Error('bad upgrade: ' + head));
        this.buf = this.buf.subarray(end + 4);
        this.upgraded = true;
        this.emit('open', {});
      }
      this.drain();
    });
    this.sock.on('error', (e) => this.emit('error', e));
    this.sock.on('close', () => this.emit('close', {}));
  }
  addEventListener(type, fn) {
    this.listeners[type].push(fn);
  }
  emit(type, ev) {
    for (const fn of this.listeners[type]) fn(ev);
  }
  drain() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        off = 10;
      }
      if (b.length < off + len) return;
      const payload = b.subarray(off, off + len);
      this.buf = b.subarray(off + len);
      if (op === 8) return this.sock.end();
      if (op === 1 || op === 0) {
        this.fragments.push(payload);
        if (fin) {
          const data = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.emit('message', { data });
        }
      }
    }
  }
  send(text) {
    const p = Buffer.from(text);
    const mask = randomBytes(4);
    let head;
    if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
    else if (p.length < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x81;
      head[1] = 0x80 | 126;
      head.writeUInt16BE(p.length, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x81;
      head[1] = 0x80 | 127;
      head.writeBigUInt64BE(BigInt(p.length), 2);
    }
    const masked = Buffer.from(p.map((byte, i) => byte ^ mask[i % 4]));
    this.sock.write(Buffer.concat([head, mask, masked]));
  }
  close() {
    this.sock.end();
  }
}

const WS = typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : RawWebSocket;
export const wsKind = WS === RawWebSocket ? 'raw-socket' : 'global WebSocket';

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('openSocket: timeout')), CDP_TIMEOUT_MS);
    t.unref();
    const ws = new WS(url);
    ws.addEventListener('open', () => clearTimeout(t));
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(e instanceof Error ? e : new Error('ws error')));
  });
}

/** Launch headless Chrome with a throwaway profile and attach to its first page. */
export async function launchChrome({ width = 1280, height = 800 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), `idle-rpg-e2e-${process.pid}-`));
  const proc = spawnTracked(
    findChrome(),
    [
      '--headless=new',
      '--mute-audio',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  console.log(`e2e: Chrome pid ${proc.pid} profile ${profile}`);
  // Chrome writes the port it picked into <profile>/DevToolsActivePort.
  let port = null;
  for (let i = 0; i < 100 && port === null; i++) {
    await sleep(100);
    const file = join(profile, 'DevToolsActivePort');
    if (existsSync(file)) port = Number(readFileSync(file, 'utf8').split('\n')[0]);
  }
  if (port === null) {
    killChild(proc);
    throw new Error('Chrome did not start');
  }
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(CDP_TIMEOUT_MS) })
    ).json();
    page = targets.find((t) => t.type === 'page');
    if (!page) await sleep(100);
  }
  const ws = await openSocket(page.webSocketDebuggerUrl);

  let nextId = 0;
  const pending = new Map();
  const handlers = [];
  let dead = null;
  const failAll = (reason) => {
    dead ??= reason;
    for (const [id, p] of pending) {
      pending.delete(id);
      clearTimeout(p.timer);
      p.reject(new Error(`${p.method}: ${reason}`));
    }
  };
  proc.on('exit', () => failAll('Chrome exited'));
  ws.addEventListener('close', () => failAll('Chrome exited (CDP socket closed)'));
  ws.addEventListener('error', () => failAll('Chrome exited (CDP socket error)'));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    activity(`cdp message ${msg.method ?? '#' + msg.id}`);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    } else for (const h of handlers) h(msg);
  });

  const cdp = {
    send(method, params = {}, { timeoutMs = CDP_TIMEOUT_MS } = {}) {
      return new Promise((resolve, reject) => {
        if (dead) return reject(new Error(`${method}: ${dead}`));
        const id = ++nextId;
        activity(`cdp send ${method}`);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method}: no response after ${timeoutMs} ms`));
        }, timeoutMs);
        timer.unref();
        pending.set(id, { resolve, reject, method, timer });
        try {
          ws.send(JSON.stringify({ id, method, params }));
        } catch (e) {
          pending.delete(id);
          clearTimeout(timer);
          reject(e);
        }
      });
    },
    on(fn) {
      handlers.push(fn);
    },
    /** Evaluate a JS expression in the page (awaits promises) and return its JSON value. */
    async eval(expression, opts) {
      const r = await cdp.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        opts,
      );
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result.value;
    },
    async close() {
      dead ??= 'closed';
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      killChild(proc);
      await sleep(200);
      rmSync(profile, { recursive: true, force: true });
    },
  };
  return cdp;
}
