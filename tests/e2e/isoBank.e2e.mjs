// QA slice: bank in isometric (booths + Bankers). Real pointer/touch input at screen positions computed from
// isoProjection.tileToWorld + the live camera. FAST BASE: desktop and phone run as parallel children, ?tickMs=30,
// waits on state. Run: node tests/e2e/isoBank.e2e.mjs (base port 7711; E2E_PORT overrides)
import {
  BANKERS,
  BOOTHS,
  bankOps,
  choices,
  clickBtn,
  closeAll,
  dialogueText,
  dist,
  dom,
  exists,
  key,
  menuLabels,
  snap,
  timed,
  waitBank,
  waitChoices,
  waitDialogue,
  walkSettled,
} from './bankKit.mjs';
import { expect, forEachCombo, runParallel, withGame } from './lib.mjs';

const PORT = 7711;
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  budgetMs: BUDGET_MS,
});
const BOOTH_UP = 14; // px above the tile's feet: booth sign top ~42, banker torso ~25
const BANKER_UP = 22;

await withGame(
  // tickMs 30 = the DEV hook's fastest tick (20x)
  { port: PORT, budgetMs: BUDGET_MS, tickMs: 30 },
  forEachCombo(COMBOS, async (g) => {
    // the follow camera eases after a walk: settle first so the tap point is the final one
    const tapTile = async (t, up = 0) => {
      await g.settle();
      return g.tapTile(t.x, t.y, -up);
    };
    const pointOf = async (t, up) => {
      await g.settle();
      return g.tileClient(t.x, t.y, -up);
    };
    const realClickItem = async (re) => {
      const r = await dom(
        g,
        `const el=[...document.querySelectorAll('[role=menuitem]')].find((e)=>new RegExp(${JSON.stringify(re)}).test(e.textContent||'')); if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};`,
      );
      expect(r, `no menu item ${re}`);
      await g.tap(r.x, r.y);
    };
    const menuClosed = () =>
      g.waitFor(async () => !(await exists(g, '[role=menu]')), { label: 'menu closed' });
    // Desktop right-click right after cancelling another menu is swallowed about every other time (seen in the old
    // script's tap-height probe too, and in a 6-click diag: T T F T F T). Retry once and report it in the evidence.
    const openMenuAt = async (pt) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        await g.longPress(pt.x, pt.y);
        if (
          await g
            .waitFor(() => exists(g, '[role=menu]'), { timeoutMs: 1500 })
            .then(
              () => true,
              () => false,
            )
        )
          return attempt;
      }
      throw new Error(`no menu after 2 gestures at ${Math.round(pt.x)},${Math.round(pt.y)}`);
    };
    const viewport = () => g.eval('({ w: innerWidth, h: innerHeight })');

    await g.teleportSettled(13, 17);

    await timed(
      'door-in',
      'walk into bank via real taps: tap floor (13,12) from outside passes doorway (13,14)',
      async () => {
        await walkSettled(g, 13, 16);
        const stop = await g.trackMoves();
        await tapTile({ x: 13, y: 12 });
        await g.waitIdle();
        const s = await snap(g);
        const seen = await stop();
        await g.screenshot(`${g.viewportName}-inside`);
        expect(
          s.pos.x === 13 && s.pos.y === 12,
          `at ${JSON.stringify(s.pos)}, path ${JSON.stringify(seen)}`,
        );
        expect(
          seen.some((q) => q.x === 13 && q.y === 14),
          `never crossed doorway: ${JSON.stringify(seen)}`,
        );
        return `reached (13,12) via ${seen.map((q) => q.x + ',' + q.y).join(' ')}`;
      },
    );

    await timed(
      'door-diag',
      'diagonal approach: tap (12,12) from (12,16), reach (16,11), tap out (13,16): no stuck tiles',
      async () => {
        await walkSettled(g, 12, 16);
        await tapTile({ x: 12, y: 12 });
        await g.waitIdle();
        let s = await snap(g);
        expect(s.pos.x === 12 && s.pos.y === 12, `in: at ${JSON.stringify(s.pos)}`);
        await walkSettled(g, 16, 11);
        expect((await snap(g)).pos.x === 16, 'could not reach far corner (16,11)');
        await walkSettled(g, 13, 12);
        await g.settle(); // the doorway's screen point must be final before the HUD/canvas hit-test below
        const vp = await viewport();
        let op = null;
        const tried = [];
        for (const t of [
          { x: 13, y: 15 },
          { x: 12, y: 15 },
          { x: 14, y: 15 },
          { x: 13, y: 16 },
          { x: 12, y: 16 },
          { x: 14, y: 16 },
        ]) {
          const q = await g.tileClient(t.x, t.y);
          const onTop =
            q.x > 0 &&
            q.y > 0 &&
            q.x < vp.w &&
            q.y < vp.h &&
            (await g.page(`topIsCanvas(${q.x}, ${q.y})`));
          tried.push(
            `${t.x},${t.y}@${Math.round(q.x)},${Math.round(q.y)}:${onTop ? 'ok' : 'covered'}`,
          );
          if (onTop) {
            op = { ...q, t };
            break;
          }
        }
        expect(op, `no canvas-visible exit tile (HUD covers all): ${tried.join(' ')}`);
        const stop = await g.trackMoves();
        await g.tap(op.x, op.y);
        await g.waitIdle();
        s = await snap(g);
        const seen2 = await stop();
        expect(s.pos.x === op.t.x && s.pos.y === op.t.y, `out: at ${JSON.stringify(s.pos)}`);
        expect(
          seen2.some((q) => q.x === 13 && q.y === 14),
          `exit skipped doorway: ${JSON.stringify(seen2)}`,
        );
        return 'in (diag start) to (12,12), far corner (16,11) reachable, out via doorway ok';
      },
    );

    await timed(
      'booth-menu',
      'long-press / right-click booth: Bank + Examine + Cancel',
      async () => {
        await walkSettled(g, 13, 12);
        const pt = await pointOf(BOOTHS[0], BOOTH_UP);
        await openMenuAt(pt);
        const labels = await menuLabels(g);
        await g.screenshot(`${g.viewportName}-booth-menu`);
        expect(
          labels.some((l) => /^Bank/.test(l)) &&
            labels.some((l) => /^Examine/.test(l)) &&
            labels.some((l) => /^Cancel/.test(l)),
          `menu: ${JSON.stringify(labels)}`,
        );
        await realClickItem('^Cancel');
        await menuClosed();
        expect(!(await snap(g)).bankOpen, 'bank opened by Cancel');
        return JSON.stringify(labels);
      },
    );

    // The old script also probed four tap heights and logged them (console.log only, no assertion); dropped.
    await timed(
      'npc-menu',
      'long-press / right-click Banker: Talk-to + Bank + Examine + Cancel',
      async () => {
        const pt = await pointOf(BANKERS[0], BANKER_UP);
        const attempts = await openMenuAt(pt);
        const labels = await menuLabels(g);
        await g.screenshot(`${g.viewportName}-npc-menu`);
        expect(
          labels.some((l) => /^Talk/.test(l)) &&
            labels.some((l) => /^Bank/.test(l)) &&
            labels.some((l) => /^Examine/.test(l)) &&
            labels.some((l) => /^Cancel/.test(l)),
          `menu: ${JSON.stringify(labels)}`,
        );
        await clickBtn(g, '[role=menuitem]', '^Cancel');
        await menuClosed();
        return `${JSON.stringify(labels)}${attempts > 1 ? ` (first gesture swallowed, ${attempts} attempts)` : ''}`;
      },
    );

    for (const [id, title, tile, up, name] of [
      [
        'booth-menu-bank',
        'booth menu: pick Bank opens the bank panel',
        BOOTHS[0],
        BOOTH_UP,
        'booth',
      ],
      [
        'npc-menu-bank',
        'Banker menu: pick Bank opens the bank panel',
        BANKERS[0],
        BANKER_UP,
        'banker',
      ],
    ])
      await timed(id, title, async () => {
        await walkSettled(g, 13, 12);
        expect(!(await snap(g)).bankOpen, 'bank already open before pick');
        const pt = await pointOf(tile, up);
        await openMenuAt(pt);
        await realClickItem('^Bank');
        await waitBank(g);
        expect(await exists(g, '.bank-overlay'), 'bank overlay not in DOM');
        await g.screenshot(`${g.viewportName}-${name}-menu-bank`);
        const s = await snap(g);
        await closeAll(g);
        return `picked Bank from ${name} menu; player ${JSON.stringify(s.pos)}; bankOpen true`;
      });

    await timed('booth-tap', 'tap booth: walks adjacent, bank panel opens', async () => {
      await walkSettled(g, 16, 12);
      const p0 = (await snap(g)).pos;
      await tapTile(BOOTHS[0], BOOTH_UP);
      await waitBank(g);
      const s = await snap(g);
      await g.screenshot(`${g.viewportName}-bank-open`);
      expect(
        dist(s.pos, BOOTHS[0]) === 1 && s.pos.y >= 9,
        `player ${JSON.stringify(s.pos)} not adjacent to booth (12,9)`,
      );
      expect(await exists(g, '.bank-overlay'), 'bank overlay not in DOM');
      return `from ${JSON.stringify(p0)} to ${JSON.stringify(s.pos)}; bank open`;
    });

    // check() closes overlays first, so bank-ops opens the bank itself
    await timed('bank-ops', 'deposit-all then withdraw 1 log (+ withdraw all)', async () => {
      await tapTile(BOOTHS[0], BOOTH_UP);
      await waitBank(g);
      return bankOps(g);
    });

    await timed(
      'npc-talk',
      'tap Banker: walks within reach, dialogue opens with banker lines',
      async () => {
        await walkSettled(g, 16, 12);
        await tapTile(BANKERS[1], BANKER_UP);
        await waitDialogue(g);
        const s = await snap(g);
        await g.screenshot(`${g.viewportName}-dialogue`);
        const txt = await dialogueText(g);
        expect(/Welcome to Willowbrook Bank/.test(txt ?? ''), `text: ${txt}`);
        expect(
          dist(s.pos, BANKERS[1]) <= 2,
          `player ${JSON.stringify(s.pos)} not within reach of (14,8)`,
        );
        await key(g, 'Enter', 'Enter', 13);
        await waitChoices(g);
        const c = await choices(g);
        expect(c[0] === "I'd like to access my bank.", `choices ${JSON.stringify(c)}`);
        await clickBtn(g, '.dialogue-choice', 'access my bank');
        await waitBank(g, true, 5000);
        await closeAll(g);
        return `player ${JSON.stringify(s.pos)}; "${txt}"; choice 1 opened bank`;
      },
    );

    await timed(
      'npc-talk-1',
      'tap first Banker (12,8) also opens dialogue (not the booth)',
      async () => {
        await walkSettled(g, 12, 12);
        await tapTile(BANKERS[0], BANKER_UP);
        await waitDialogue(g);
        await key(g, 'Escape', 'Escape', 27);
        await g.waitFor(async () => !(await exists(g, '.dialogue')), { label: 'dialogue closed' });
        expect(!(await snap(g)).bankOpen, 'bank opened instead of dialogue');
        return 'ok';
      },
    );
  }),
);
