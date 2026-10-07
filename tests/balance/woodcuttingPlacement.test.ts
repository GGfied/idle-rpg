import { describe, it } from 'vitest';
import type { Tile } from '@core/contracts';
import {
  createGatheringState,
  startGather,
  successChance,
  tickGathering,
  type GatheringState,
} from '@core/skills';
import { levelForXp, xpForLevel } from '@core/progression';
import { seededRng } from '@test-utils/index';
import { findPathToAdjacent } from '@features/movement';
import {
  PLAYER_SPAWN,
  WORLD_OBJECT_SPAWNS,
  WORLD_TREES,
  areaAt,
  createWorldCollisionGrid,
} from '@features/world';
import { WOODCUTTING_NODES } from '@features/skills/woodcutting';

const grid = createWorldCollisionGrid();
const defs = new Map(WOODCUTTING_NODES.map((d) => [d.id, d]));
const booths = WORLD_OBJECT_SPAWNS.filter((o) => o.kind === 'bank_booth');
const OPT = { maxNodes: 400000 };
const len = (from: Tile, to: Tile): number =>
  findPathToAdjacent(grid, from, to, OPT)?.length ?? NaN;
const bankLen = (from: Tile): number => Math.min(...booths.map((b) => len(from, b)));
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;
const pad = (s: unknown, n = 8) => String(s).padEnd(n);

describe('placement', () => {
  it('distances per area', () => {
    const rows: Record<string, { n: number; spawn: number[]; bank: number[]; sample: number[] }> =
      {};
    for (const t of WORLD_TREES) {
      const key = `${areaAt(t.x, t.y).name} | ${t.defId}`;
      const r = (rows[key] ??= { n: 0, spawn: [], bank: [], sample: [] });
      r.n++;
      r.spawn.push(len(PLAYER_SPAWN, t));
      r.bank.push(bankLen(t) /* path from the tree tile's neighbour is symmetric enough */);
    }
    console.log(
      'AREA | TREE | n | spawn->tree min/med/max | nearest-bank->tree min/med/max (tiles; walk ticks = tiles, run = tiles/2)',
    );
    for (const [k, r] of Object.entries(rows).sort()) {
      const f = (a: number[]) => `${Math.min(...a)}/${med(a)}/${Math.max(...a)}`;
      console.log(pad(k, 36), pad(r.n, 4), pad(f(r.spawn), 14), f(r.bank));
    }
    // Unreachable trees?
    const bad = WORLD_TREES.filter((t) => Number.isNaN(len(PLAYER_SPAWN, t)));
    console.log(
      'unreachable from spawn:',
      bad.length,
      bad.slice(0, 5).map((t) => t.nodeId),
    );
    const near = (id: string) => {
      const ts = WORLD_TREES.filter((t) => t.defId === id);
      return ts
        .map((t) => ({
          id: t.nodeId,
          d: len(PLAYER_SPAWN, t),
          b: bankLen(t),
          a: areaAt(t.x, t.y).name,
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
    };
    console.log('nearest normal', JSON.stringify(near('tree')));
    console.log('nearest oak', JSON.stringify(near('oak_tree')));
    for (const b of booths) console.log('booth', b.objectId, 'from spawn', len(PLAYER_SPAWN, b));
    const fb = WORLD_OBJECT_SPAWNS.find((o) => o.objectId === 'bank_booth_3')!;
    console.log(
      'Fernhaven bank from Whispering Wood loc (48,15):',
      len({ x: 48, y: 15 }, fb),
      ' from oak_ridge (66,10):',
      len({ x: 66, y: 10 }, fb),
      ' from spawn',
      len(PLAYER_SPAWN, fb),
    );
    const wb = booths[0]!;
    console.log(
      'Willowbrook bank from Oak Ridge (66,10):',
      len({ x: 66, y: 10 }, wb),
      'from Whispering (48,15):',
      len({ x: 48, y: 15 }, wb),
    );
    console.log(
      'tile counts by tree def:',
      WORLD_TREES.filter((t) => t.defId === 'tree').length,
      WORLD_TREES.filter((t) => t.defId === 'oak_tree').length,
    );
  });
});

interface Sim {
  ticks: number;
  walk: number;
  chop: number;
  bank: number;
  wait: number;
  logs: number;
  trips: number;
  xp: number;
}

/** Full-loop sim with the real gathering loop. Trees chosen by exact path length among allowed ids. */
function sim(opts: {
  seed: number;
  startXp: number;
  goalLevel: number;
  run: boolean;
  allow: (t: { nodeId: string; defId: string; x: number; y: number }) => boolean;
  start?: Tile;
  maxTicks?: number;
}): Sim {
  const rng = seededRng(opts.seed);
  let g: GatheringState = createGatheringState();
  let xp = opts.startXp;
  let pos: Tile = opts.start ?? PLAYER_SPAWN;
  const o: Sim = { ticks: 0, walk: 0, chop: 0, bank: 0, wait: 0, logs: 0, trips: 0, xp: 0 };
  let inv = 0;
  const env = {
    getDef: (id: string) => defs.get(id),
    level: () => levelForXp(xp),
    tool: () => ({ ticksSaved: 0 }),
    canFit: () => inv < 28,
  };
  const adv = (n: number, kind: 'walk' | 'wait' | 'bank') => {
    for (let i = 0; i < n; i++) {
      o.ticks++;
      o[kind]++;
      g = tickGathering(g, { tick: o.ticks, rng }, env).state;
    }
  };
  const cand = WORLD_TREES.filter(opts.allow);
  const dist = (t: Tile) => Math.max(Math.abs(t.x - pos.x), Math.abs(t.y - pos.y));
  const goal = xpForLevel(opts.goalLevel);
  const cap = opts.maxTicks ?? 400000;
  while (xp < goal && o.ticks < cap) {
    if (inv >= 28) {
      const bl = bankLen(pos);
      adv(Math.ceil(opts.run ? bl / 2 : bl) * 2, 'walk');
      adv(1, 'bank');
      inv = 0;
      o.trips++;
      // return leg approximated as symmetrical; position is left at bank side, next pick re-evaluates
      continue;
    }
    const lvl = levelForXp(xp);
    const avail = cand.filter(
      (t) => lvl >= (defs.get(t.defId)?.requiredLevel ?? 99) && !g.nodes[t.nodeId],
    );
    if (avail.length === 0) {
      adv(1, 'wait');
      continue;
    }
    const top = avail.sort((a, b) => dist(a) - dist(b)).slice(0, 4);
    let best = top[0]!;
    let bl = Infinity;
    for (const t of top) {
      const l = len(pos, t);
      if (l < bl) {
        bl = l;
        best = t;
      }
    }
    const path = findPathToAdjacent(grid, pos, best, OPT) ?? [];
    adv(opts.run ? Math.ceil(path.length / 2) : path.length, 'walk');
    pos = path.at(-1) ?? pos;
    const r = startGather(g, best.nodeId, best.defId, env);
    if (!r.ok) {
      adv(1, 'wait');
      continue;
    }
    g = r.value.state;
    while (g.session && o.ticks < cap) {
      o.ticks++;
      o.chop++;
      const res = tickGathering(g, { tick: o.ticks, rng }, env);
      g = res.state;
      for (const e of res.events) {
        if (e.type === 'itemGathered') {
          inv++;
          o.logs++;
        }
        if (e.type === 'xpGranted') xp += e.amount;
      }
    }
  }
  o.xp = xp;
  return o;
}

const avg = (xs: Sim[]): Sim => {
  const k = Object.keys(xs[0]!) as (keyof Sim)[];
  const r = {} as Sim;
  for (const key of k) r[key] = xs.reduce((s, x) => s + x[key], 0) / xs.length;
  return r;
};
const secs = (t: number) => `${(t * 0.6).toFixed(0)}s (${((t * 0.6) / 60).toFixed(1)}min)`;
const show = (name: string, a: Sim) =>
  console.log(
    pad(name, 44),
    'time',
    secs(a.ticks),
    '| walk',
    a.walk.toFixed(0),
    'chop',
    a.chop.toFixed(0),
    'wait',
    a.wait.toFixed(0),
    'bank',
    a.bank.toFixed(0),
    '| logs',
    a.logs.toFixed(0),
    'trips',
    a.trips.toFixed(1),
    '| xp/h',
    ((a.xp - 0) / ((a.ticks * 0.6) / 3600)).toFixed(0),
  );

describe('time to level', () => {
  it('woodcutting 1 -> 15 by area', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const run = (name: string, o: Omit<Parameters<typeof sim>[0], 'seed'>) =>
      show(name, avg(seeds.map((seed) => sim({ ...o, seed }))));
    const isVillage = (t: { nodeId: string }) => /^(tree|oak)_\d+$/.test(t.nodeId);
    const normal = (t: { defId: string }) => t.defId === 'tree';
    const inBox =
      (x0: number, y0: number, x1: number, y1: number) => (t: { x: number; y: number }) =>
        t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1;
    for (const runFlag of [false, true]) {
      const tag = runFlag ? 'run ' : 'walk';
      run(`${tag} 1->15 village normal trees (12)`, {
        startXp: 0,
        goalLevel: 15,
        run: runFlag,
        allow: (t) => isVillage(t) && normal(t),
      });
      run(`${tag} 1->15 all normal trees reachable`, {
        startXp: 0,
        goalLevel: 15,
        run: runFlag,
        allow: (t) => normal(t) && Math.max(Math.abs(t.x - 18), Math.abs(t.y - 15)) < 40,
      });
      run(`${tag} 1->15 only Whispering Wood normal`, {
        startXp: 0,
        goalLevel: 15,
        run: runFlag,
        allow: (t) => normal(t) && inBox(40, 0, 79, 25)(t),
        start: { x: 41, y: 15 },
      });
    }
    console.log('--- oaks from lvl 15 to 30 (start at 15, xp 1154)');
    for (const runFlag of [false, true]) {
      const tag = runFlag ? 'run ' : 'walk';
      run(`${tag} 15->30 village oaks (4)`, {
        startXp: xpForLevel(15),
        goalLevel: 30,
        run: runFlag,
        allow: (t) => t.defId === 'oak_tree' && isVillage(t),
      });
      run(`${tag} 15->30 village normal (12)`, {
        startXp: xpForLevel(15),
        goalLevel: 30,
        run: runFlag,
        allow: (t) => t.defId === 'tree' && isVillage(t),
      });
      run(`${tag} 15->30 Oak Ridge oaks`, {
        startXp: xpForLevel(15),
        goalLevel: 30,
        run: runFlag,
        allow: (t) => t.defId === 'oak_tree' && inBox(62, 0, 79, 25)(t),
        start: { x: 66, y: 10 },
      });
    }
  });

  it('xp/h at fixed level, infinite trees, 3 ticks walk per felled normal tree', () => {
    console.log(
      'lvl | tree s/log | oak s/log | tree xp/h | oak xp/h (overhead: 3-tick walk per felled tree, none for oak surviving)',
    );
    for (const L of [1, 5, 10, 15, 20, 30, 40, 50, 60, 70, 99]) {
      const rng = seededRng(7);
      const out: number[] = [];
      for (const id of ['tree', 'oak_tree']) {
        const d = defs.get(id)!;
        if (L < d.requiredLevel) {
          out.push(NaN, NaN);
          continue;
        }
        let g = createGatheringState();
        let t = 0;
        let xp = 0;
        let logs = 0;
        const env = {
          getDef: () => d,
          level: () => L,
          tool: () => ({ ticksSaved: 0 }),
          canFit: () => true,
        };
        let nodeSeq = 0;
        while (t < 200000) {
          const r = startGather(g, `n${nodeSeq++}`, id, env);
          if (!r.ok) throw new Error('x');
          g = r.value.state;
          while (g.session) {
            t++;
            const res = tickGathering(g, { tick: t, rng }, env);
            g = res.state;
            for (const e of res.events) {
              if (e.type === 'xpGranted') {
                xp += e.amount;
                logs++;
              }
            }
          }
          t += 3; // walk to next
        }
        out.push((t / logs) * 0.6, xp / ((t * 0.6) / 3600));
      }
      console.log(
        pad(L, 4),
        out[0]!.toFixed(1),
        out[2]!.toFixed(1),
        Math.round(out[1]!),
        Math.round(out[3]!),
        ' p=',
        successChance(L, 64, 200).toFixed(3),
        successChance(L, 32, 100).toFixed(3),
      );
    }
  });
});
