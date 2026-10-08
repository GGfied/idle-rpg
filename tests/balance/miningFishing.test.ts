import { describe, it } from 'vitest';
import type { Tile } from '@core/contracts';
import {
  createGatheringState,
  startGather,
  tickGathering,
  successChance,
  type GatherEnv,
  type GatheringState,
} from '@core/skills';
import { xpForLevel } from '@core/progression';
import { seededRng } from '@test-utils/index';
import { findPathToAdjacent } from '@features/movement';
import { QUARRY_ROCKS, FISHING_SPOTS, createWorldCollisionGrid } from '@features/world';
import { MINING_NODES } from '@features/skills/mining';
import { WOODCUTTING_NODES } from '@features/skills/woodcutting';
import {
  addSpot,
  createFishingState,
  startFishing,
  tickFishing,
  FISHING_SPOTS as SPOT_DEFS,
  type FishingEnv,
  type FishingState,
} from '@features/skills/fishing';

const grid = createWorldCollisionGrid();
const BOOTH: Tile = { x: 72, y: 52 };
const OPT = { maxNodes: 400000 };
const TICK_S = 0.6;
const CLICK = 1; // ticks of reaction per re-tap / click
const BANK_TICKS = 2;
const pathCache = new Map<string, Tile[] | null>();
function path(from: Tile, to: Tile): Tile[] | null {
  const k = `${from.x},${from.y}>${to.x},${to.y}`;
  if (!pathCache.has(k)) pathCache.set(k, findPathToAdjacent(grid, from, to, OPT));
  return pathCache.get(k)!;
}
const endOf = (p: Tile[], from: Tile): Tile => p[p.length - 1] ?? from;
const walkTicks = (n: number, speed: number) => Math.ceil(n / speed);
const defs = new Map(MINING_NODES.map((d) => [d.id, d]));

interface Result {
  xph: number;
  perHour: number;
  secPerAction: number;
  baitPerHour?: number;
  walkPct: number;
}

function simMining(
  level: number,
  rockDef: string,
  ticksSaved: number,
  speed: number,
  ticks: number,
  seed = 7,
): Result {
  const rng = seededRng(seed);
  const rocks = QUARRY_ROCKS.filter((r) => r.defId === rockDef);
  const env: GatherEnv = {
    getDef: (id) => defs.get(id),
    level: () => level,
    tool: () => ({ ticksSaved }),
    canFit: () => true,
  };
  let st: GatheringState = createGatheringState();
  let pos: Tile = { x: 72, y: 53 };
  let xp = 0;
  let ores = 0;
  let inv = 0;
  let walking = 0;
  let tick = 0;
  const step = (): { gained: number; stopped: boolean } => {
    tick++;
    const r = tickGathering(st, { tick, rng }, env);
    st = r.state;
    let gained = 0;
    let stopped = false;
    for (const e of r.events) {
      if (e.type === 'xpGranted') {
        xp += e.amount;
        gained++;
        ores++;
        inv++;
      }
      if (e.type === 'gatherStopped') stopped = true;
    }
    return { gained, stopped };
  };
  const wait = (n: number) => {
    for (let i = 0; i < n && tick < ticks; i++) step();
    walking += n;
  };
  while (tick < ticks) {
    if (inv >= 28) {
      const p = path(pos, BOOTH)!;
      const t = walkTicks(p.length, speed) * 2 + BANK_TICKS + CLICK * 2;
      wait(t);
      pos = endOf(p, pos);
      // return trip lands us back near the quarry; next rock path is computed from the bank side.
      inv = 0;
    }
    // choose nearest available rock
    const avail = rocks
      .filter((r) => !st.nodes[r.nodeId])
      .map((r) => ({ r, p: path(pos, r)! }))
      .sort((a, b) => a.p.length - b.p.length);
    if (avail.length === 0) {
      wait(1);
      continue;
    }
    const pick = avail[0]!;
    wait(walkTicks(pick.p.length, speed) + CLICK);
    pos = endOf(pick.p, pos);
    if (st.nodes[pick.r.nodeId]) continue;
    const s = startGather(st, pick.r.nodeId, pick.r.defId, env);
    if (!s.ok) throw new Error('start failed ' + JSON.stringify(s));
    st = s.value.state;
    while (tick < ticks && st.session) step();
  }
  const hours = (tick * TICK_S) / 3600;
  return {
    xph: xp / hours,
    perHour: ores / hours,
    secPerAction: ores ? (tick * TICK_S) / ores : NaN,
    walkPct: walking / tick,
  };
}

function simFishing(
  level: number,
  spotDefId: string,
  speed: number,
  ticks: number,
  seed = 11,
): Result {
  const rng = seededRng(seed);
  const spawn = FISHING_SPOTS.find((s) => s.defId === spotDefId)!;
  const hasBait = SPOT_DEFS.find((d) => d.id === spotDefId)!.methods.bait !== undefined;
  const slots = hasBait ? 27 : 28;
  const env: FishingEnv = {
    level: () => level,
    tool: () => ({ ticksSaved: 0 }),
    hasItem: () => true,
    canFit: () => true,
  };
  let st: FishingState = addSpot(
    createFishingState(),
    spawn.spotId,
    spotDefId,
    spawn.tiles.length,
    {
      tick: 0,
      rng,
    },
  );
  let pos: Tile = { x: 72, y: 53 };
  let xp = 0;
  let fish = 0;
  let bait = 0;
  let inv = 0;
  let walking = 0;
  let tick = 0;
  const step = () => {
    tick++;
    const r = tickFishing(st, { tick, rng }, env);
    st = r.state;
    for (const e of r.events) {
      if (e.type === 'xpGranted') {
        xp += e.amount;
        fish++;
        inv++;
      }
      if (e.type === 'baitConsumed') bait++;
    }
  };
  const wait = (n: number) => {
    for (let i = 0; i < n && tick < ticks; i++) step();
    walking += n;
  };
  const tileNow = () => spawn.tiles[st.spots[spawn.spotId]!.tile]!;
  while (tick < ticks) {
    if (inv >= slots) {
      const p = path(pos, BOOTH)!;
      wait(walkTicks(p.length, speed) * 2 + BANK_TICKS + CLICK * 2);
      pos = endOf(p, pos);
      inv = 0;
    }
    const t = tileNow();
    const p = path(pos, t)!;
    wait(walkTicks(p.length, speed) + CLICK);
    pos = endOf(p, pos);
    // spot may have moved during the walk; loop re-targets
    const t2 = tileNow();
    if (t2.x !== t.x || t2.y !== t.y) continue;
    const s = startFishing(st, spawn.spotId, spotDefId, env);
    if (!s.ok) throw new Error('fish start failed ' + s.error);
    st = s.value.state;
    while (tick < ticks && st.session && inv < slots) step();
    if (inv >= slots) st = { ...st, session: null };
  }
  const hours = (tick * TICK_S) / 3600;
  return {
    xph: xp / hours,
    perHour: fish / hours,
    secPerAction: fish ? (tick * TICK_S) / fish : NaN,
    baitPerHour: bait / hours,
    walkPct: walking / tick,
  };
}

const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n) : 'n/a');
const pad = (s: unknown, n = 9) => String(s).padEnd(n);
const LEVELS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 99];
const SIM_TICKS = 30000; // 5 h

/** Hours to climb from level a to b given xp/h per level (index = level). */
function hoursBetween(rate: (l: number) => number, a: number, b: number): number {
  let h = 0;
  for (let l = a; l < b; l++) h += (xpForLevel(l + 1) - xpForLevel(l)) / rate(l);
  return h;
}

describe('mining + fishing balance', () => {
  it('woodcutting reference (no walking, pure rate)', () => {
    console.log(
      'WC ref: level | tree s/log xp/h | oak s/log xp/h (bronze axe, 4 ticks, no walk/depletion)',
    );
    for (const l of LEVELS) {
      const row = WOODCUTTING_NODES.map((d) => {
        if (l < d.requiredLevel) return '-';
        const p = successChance(l, d.successLow, d.successHigh);
        const sec = (d.baseTicks * TICK_S) / p;
        return `${sec.toFixed(1)}s ${f0((3600 / sec) * d.xp)}`;
      });
      console.log(pad(l, 4), row.join(' | '));
    }
  });

  it('mining table', () => {
    const picks: [string, number][] = [
      ['bronze', 0],
      ['iron', 1],
      ['steel', 2],
    ];
    console.log('MINING walk(1 t/tick) xp/h | pure (no walk) xp/h; cols: rock/pick');
    const rate: Record<string, number[]> = {};
    for (const rock of ['copper_rock', 'tin_rock', 'iron_rock']) {
      for (const [pn, ts] of picks) {
        const key = `${rock}/${pn}`;
        rate[key] = [];
        const d = defs.get(rock)!;
        const lines: string[] = [];
        for (let l = 1; l <= 99; l++) {
          if (l < d.requiredLevel) {
            rate[key]![l] = NaN;
            continue;
          }
          const r = simMining(
            l,
            rock,
            ts,
            1,
            l % 1 === 0 && LEVELS.includes(l) ? SIM_TICKS : 12000,
          );
          const p = successChance(l, d.successLow, d.successHigh);
          const pureSec = (Math.max(1, d.baseTicks - ts) * TICK_S) / p;
          rate[key]![l] = r.xph;
          if (LEVELS.includes(l))
            lines.push(
              `${pad(l, 3)} walk: ${pad(f0(r.xph), 6)} ${r.secPerAction.toFixed(1)}s/ore walk%=${(r.walkPct * 100).toFixed(0)}  pure: ${f0((3600 / pureSec) * d.xp)} (${pureSec.toFixed(1)}s)`,
            );
        }
        console.log('--', key);
        for (const x of lines) console.log(x);
      }
    }
    // run variant for headline
    console.log('RUN(2 t/tick) iron_rock/steel L15,30,60,99 and copper/bronze L1,10:');
    for (const [rk, pk, ls] of [
      ['iron_rock', 2, [15, 30, 60, 99]],
      ['copper_rock', 0, [1, 10]],
    ] as const)
      for (const l of ls) console.log(rk, l, f0(simMining(l, rk, pk, 2, SIM_TICKS).xph));
    // best-method progression, realistic: pick = best owned by level (assume obtained), rock = best xp/h
    const bestAt = (l: number) => {
      const pick = l >= 6 ? 'steel' : l >= 5 ? 'iron' : 'bronze';
      const cands = ['copper_rock', 'tin_rock', 'iron_rock'].map((r) => rate[`${r}/${pick}`]![l]!);
      return Math.max(...cands.filter((x) => !Number.isNaN(x)));
    };
    const bronzeBest = (l: number) =>
      Math.max(
        ...['copper_rock', 'tin_rock', 'iron_rock']
          .map((r) => rate[`${r}/bronze`]![l]!)
          .filter((x) => !Number.isNaN(x)),
      );
    console.log(
      'TIME mining best-rock w/ best pickaxe: 1->15',
      hoursBetween(bestAt, 1, 15).toFixed(2),
      'h; 1->30',
      hoursBetween(bestAt, 1, 30).toFixed(2),
      'h; 1->60',
      hoursBetween(bestAt, 1, 60).toFixed(1),
      '1->99',
      hoursBetween(bestAt, 1, 99).toFixed(1),
    );
    console.log(
      'TIME mining bronze-only (only reachable tool): 1->15',
      hoursBetween(bronzeBest, 1, 15).toFixed(2),
      '1->30',
      hoursBetween(bronzeBest, 1, 30).toFixed(2),
      '1->99',
      hoursBetween(bronzeBest, 1, 99).toFixed(1),
    );
    console.log(
      'xp thresholds',
      [10, 15, 30, 60, 99].map((l) => `${l}:${xpForLevel(l)}`).join(' '),
    );
    for (const l of [1, 5, 10, 14, 15, 16, 20, 30])
      console.log('best rate L', l, f0(bestAt(l)), 'bronze', f0(bronzeBest(l)));
  });

  it('fishing table', () => {
    const rate: Record<string, number[]> = { net_spot: [], bait_spot: [] };
    for (const id of ['net_spot', 'bait_spot']) {
      console.log('--', id, '(walk 1 t/tick, bank trips, spot hops with re-tap)');
      for (let l = 1; l <= 99; l++) {
        const minL = id === 'net_spot' ? 1 : 5;
        if (l < minL) {
          rate[id]![l] = NaN;
          continue;
        }
        const big = LEVELS.includes(l);
        const r = simFishing(l, id, 1, big ? SIM_TICKS : 12000);
        rate[id]![l] = r.xph;
        if (big)
          console.log(
            pad(l, 3),
            pad(f0(r.xph), 7),
            `${r.secPerAction.toFixed(1)}s/fish`,
            `fish/h=${f0(r.perHour)}`,
            `bait/h=${f0(r.baitPerHour!)}`,
            `walk%=${(r.walkPct * 100).toFixed(0)}`,
          );
      }
    }
    console.log('RUN variant L1/net, L10/bait, L50/net, L99/bait:');
    for (const [id, l] of [
      ['net_spot', 1],
      ['bait_spot', 10],
      ['net_spot', 50],
      ['bait_spot', 99],
    ] as const)
      console.log(id, l, f0(simFishing(l, id, 2, SIM_TICKS).xph));
    const best = (l: number) =>
      Math.max(
        ...['net_spot', 'bait_spot'].map((i) => rate[i]![l]!).filter((x) => !Number.isNaN(x)),
      );
    console.log(
      'TIME fishing best-spot: 1->15',
      hoursBetween(best, 1, 15).toFixed(2),
      '1->30',
      hoursBetween(best, 1, 30).toFixed(2),
      '1->60',
      hoursBetween(best, 1, 60).toFixed(1),
      '1->99',
      hoursBetween(best, 1, 99).toFixed(1),
    );
    for (const l of [1, 5, 10, 14, 15, 16, 20, 30])
      console.log(
        'best L',
        l,
        f0(best(l)),
        'net',
        f0(rate.net_spot![l]!),
        'bait',
        f0(rate.bait_spot![l]!),
      );
    const wc = (l: number) => {
      const t = WOODCUTTING_NODES[0]!;
      return (
        (3600 / ((t.baseTicks * TICK_S) / successChance(l, t.successLow, t.successHigh))) * t.xp
      );
    };
    console.log(
      'TIME woodcutting normal tree no-walk 1->15',
      hoursBetween(wc, 1, 15).toFixed(2),
      '1->30',
      hoursBetween(wc, 1, 30).toFixed(2),
    );
    console.log(
      'fishing hop interval s:',
      SPOT_DEFS.map((d) => `${d.id} ${d.moveTicksMin * TICK_S}-${d.moveTicksMax * TICK_S}`).join(
        ' ',
      ),
    );
  });
});
