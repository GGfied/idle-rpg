// QA slice: bank RULES in isometric (walk-away closes, persistence, counter unreachable). Real pointer/touch input at
// screen positions computed from isoProjection.tileToWorld + the live camera.
// FAST BASE: desktop + phone as parallel children (withCombos: one page load each), ?tickMs=60, waits on state,
// teleport preconditions, budget 60 s. Run: node tests/e2e/isoBankRules.e2e.mjs (base port 9551; E2E_PORT overrides)
import { clickBtn, closeAll, dist, exists, key, seedLogs, snap, timed } from './bankKit.mjs';
import { expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9551;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  budgetMs: BUDGET_MS,
});
const BOOTH_UP = 14; // px above the tile's feet (booth sign top ~42, banker torso ~25)
const SAVE_KEY = 'idle-rpg:save:1';
const FORBID = [
  [12, 9],
  [14, 9],
  [12, 8],
  [14, 8],
  [13, 8],
  [11, 8],
  [15, 8],
  [12, 7],
  [13, 7],
  [14, 7],
];
const bad = (q) =>
  FORBID.some(([x, y]) => q.x === x && q.y === y) || (q.y < 9 && q.x >= 9 && q.x <= 17);

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g, vp) => {
  const viewport = () => g.eval('({ w: innerWidth, h: innerHeight })');
  /** Client point of a tile if it is on screen and the canvas is on top there (not HUD), else null. */
  const visible = async (x, y, up = 0) => {
    const v = await viewport();
    const q = await g.tileClient(x, y, -up);
    const ok =
      q.x > 0 && q.y > 0 && q.x < v.w && q.y < v.h && (await g.page(`topIsCanvas(${q.x}, ${q.y})`));
    return ok ? q : null;
  };
  // a tap may be read on the next frame / tick: give it 2 ticks to start a walk, then wait for the walk to end
  const afterTap = async () => {
    await g.waitTicks(2);
    await g.waitIdle({ timeoutMs: 30000 });
    await g.settle();
  };

  await g.teleportSettled(16, 12);

  let bankAfterDeposit = null;
  await timed(
    'walk-away',
    'bank open, tap ground away from booth: player walks away, bank panel closes',
    async () => {
      await g.tapTile(12, 9, -BOOTH_UP);
      await g.waitState('', 's => s.bankOpen === true', { label: 'bank open' });
      await g.waitIdle();
      await g.settle();
      const s0 = await snap(g);
      expect(await exists(g, '.bank-overlay'), 'overlay missing');
      expect(dist(s0.pos, { x: 12, y: 9 }) === 1, `not adjacent: ${JSON.stringify(s0.pos)}`);
      // deposit first (logs) so the persistence check has content
      await seedLogs(g, 5);
      await g.waitState(
        '',
        `s => s.inventory.slots.filter((x) => x && x.itemId === 'logs').length >= 5`,
        {
          label: 'seeded 5 logs',
        },
      );
      expect(await clickBtn(g, '.bank-overlay button', 'Deposit inventory'), 'no deposit button');
      await g.waitState('', `s => s.inventory.slots.every((x) => !x || x.itemId !== 'logs')`, {
        timeoutMs: 5000,
        label: 'logs deposited',
      });
      bankAfterDeposit = (await snap(g)).bank;
      const logs = bankAfterDeposit.find((b) => b.itemId === 'logs')?.quantity ?? 0;
      expect(logs >= 5, `deposit logged ${logs}`);
      const cands = [
        { x: 16, y: 12 },
        { x: 15, y: 13 },
        { x: 16, y: 11 },
        { x: 13, y: 13 },
        { x: 13, y: 15 },
        { x: 13, y: 16 },
        { x: 18, y: 15 },
      ];
      for (let y = 9; y <= 22; y++)
        for (let x = 6; x <= 26; x++)
          if (x === 18 || (y > 14 && x > 10 && x < 20) || (y <= 14 && x >= 10 && x <= 16))
            cands.push({ x, y });
      let op = null;
      for (const t of cands) {
        if (dist(t, s0.pos) < 3) continue;
        const q = await visible(t.x, t.y);
        if (q) {
          op = { ...q, t };
          break;
        }
      }
      expect(op, 'no canvas-visible ground tile while bank open (overlay covers all)');
      await g.screenshot(`${vp}-before-away`);
      await g.tap(op.x, op.y);
      await g.waitState('', 's => s.bankOpen === false', { timeoutMs: 5000, label: 'bank closed' });
      const closedEarly = await snap(g);
      await g.waitIdle({ timeoutMs: 30000 });
      const s1 = await snap(g);
      await g.screenshot(`${vp}-after-away`);
      expect(!(await exists(g, '.bank-overlay')), 'overlay still in DOM');
      expect(
        dist(s1.pos, s0.pos) >= 3,
        `moved only ${dist(s1.pos, s0.pos)}: ${JSON.stringify(s0.pos)} -> ${JSON.stringify(s1.pos)}`,
      );
      return `deposit logs ${logs}; tapped ${JSON.stringify(op.t)}; closed while at ${JSON.stringify(closedEarly.pos)}; ${JSON.stringify(s0.pos)} -> ${JSON.stringify(s1.pos)}`;
    },
  );

  await timed('persist', 'reload: bank contents identical', async () => {
    const bank = (await snap(g)).bank;
    const before = JSON.stringify(bank);
    expect(JSON.stringify(bankAfterDeposit) === before, 'bank changed without action');
    // wait for the autosave to hold this bank (replaces a fixed 3.5 s sleep), then a real reload (keeps storage)
    await g.waitFor(
      () =>
        g.eval(`(() => { const s = localStorage.getItem(${JSON.stringify(SAVE_KEY)}); if (!s) return false;
          return JSON.stringify(JSON.parse(s).data.bank).includes(${JSON.stringify(before)}); })()`),
      { timeoutMs: 15000, label: 'autosave holds the bank' },
    );
    await g.cdp.send('Page.reload', { ignoreCache: false });
    await g.waitFor(() => g.page('ready()').catch(() => false), {
      timeoutMs: 25000,
      label: 'game ready after reload',
    });
    const after = JSON.stringify((await snap(g)).bank);
    expect(after === before, `bank before ${before} after ${after}`);
    return `bank identical (${before.length} bytes): ${before.slice(0, 120)}`;
  });

  await timed(
    'counter-blocked',
    'tap staff tiles / booths / wall behind counter: player never enters them',
    async () => {
      const log = [];
      const targets = [
        [12, 8, 0],
        [14, 8, 0],
        [12, 8, 22],
        [13, 8, 0],
        [12, 9, 0],
        [14, 9, 0],
        [13, 7, 0],
        [11, 8, 0],
      ];
      for (const [x, y, up] of targets) {
        await closeAll(g);
        await g.teleportSettled(13, 11); // precondition: public side of the counter
        const q = await visible(x, y, up);
        if (!q) {
          log.push(`${x},${y},${up}:offscreen/HUD`);
          continue;
        }
        const stop = await g.trackMoves();
        await g.tap(q.x, q.y);
        await afterTap();
        const seen = await stop();
        const s = await snap(g);
        if (await exists(g, '.dialogue')) await key(g, 'Escape', 'Escape', 27);
        await closeAll(g);
        const visited = seen.filter(bad);
        log.push(
          `${x},${y},${up}->end ${s.pos.x},${s.pos.y} visited ${seen.map((z) => z.x + ',' + z.y).join('>')}`,
        );
        expect(
          visited.length === 0 && !bad(s.pos),
          `entered forbidden: ${JSON.stringify(visited)} end ${JSON.stringify(s.pos)} (tap ${x},${y})`,
        );
        expect(s.pos.y >= 9, `end not on public side: ${JSON.stringify(s.pos)}`);
      }
      const tapped = log.filter((l) => !/offscreen/.test(l)).length;
      expect(tapped >= 4, `only ${tapped} targets tappable: ${log.join(' | ')}`);
      return log.join(' | ');
    },
  );
});
