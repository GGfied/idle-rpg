// Status orbs e2e (HP, Prayer, Run), on tests/e2e/lib.mjs. Run: node tests/e2e/orbs.e2e.mjs
// Fast base: runParallel desktop + phone (orbs are DOM; run speed/energy are store state: renderer does not matter,
// webgl), fast ticks, waits on the orb DOM / chat / runEnergy instead of fixed 200/300 ms sleeps and a 40-tick wait,
// budget 60 s.
import { check, expect, runParallel, withCombos } from './lib.mjs';

const PORT = 9463; // combos use 9463..9464
const BUDGET_MS = 60e3;
const COMBOS = await runParallel(import.meta.url, PORT, {
  viewports: ['desktop', 'phone'],
  renderers: ['webgl'],
  budgetMs: BUDGET_MS,
});

const ORBS = `[...document.querySelectorAll('.orb')].map((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, top = document.elementFromPoint(cx, cy);
  return { label: b.getAttribute('aria-label'), text: b.textContent.trim(), disabled: b.disabled, pressed: b.getAttribute('aria-pressed'),
    pct: cs.getPropertyValue('--orb-pct').trim(), color: cs.getPropertyValue('--orb-color').trim(), x: cx, y: cy, w: r.width, h: r.height, top: top === b || b.contains(top) }; })`;
const steps = (tr) => tr.slice(1).map((p, i) => Math.abs(p.x - tr[i].x) + Math.abs(p.y - tr[i].y));
const LOW = "You don't have enough energy to run.";

await withCombos({ port: PORT, budgetMs: BUDGET_MS }, COMBOS, async (g) => {
  const orbs = () => g.eval(ORBS);
  const tapRun = async () => g.tap(...Object.values((({ x, y }) => ({ x, y }))((await orbs())[2])));
  const running = () => g.state('movement.running');
  const idle = () =>
    g.waitFor(async () => (await g.state('movement.path.length')) === 0, {
      timeoutMs: 15000,
      label: 'walk done',
    });
  const atRow = async () => (
    await g.teleport(18, 15, { settleMs: 0 }), // orbs are DOM and walks go through walkTo: no camera wait
    g.setMovement('running: false, runEnergy: 10000')
  );

  await check('o1', 'HP + Prayer orbs show current/max matching the store', async () => {
    const o = await orbs();
    expect(o.length === 3, 'orb count ' + o.length);
    const info =
      await g.eval(`(async () => { const m = await import('/src/core/progression/index.ts'); const g = window.__e.game();
        return { hp: g.hp.current, hpMax: m.getLevel(g.progression, 'hitpoints'), pr: g.prayer.current }; })()`);
    expect(
      o[0].text.includes(String(info.hp)) && o[1].text.includes(String(info.pr)),
      `text ${JSON.stringify(o.map((x) => x.text))} vs ${JSON.stringify(info)}`,
    );
    await g.update('({ ...g, hp: { ...g.hp, current: 4 }, prayer: { ...g.prayer, current: 1 } })');
    await g
      .waitFor(
        async () => {
          const o = await orbs();
          return o[0].text.startsWith('4') && o[1].text.startsWith('1');
        },
        { label: 'orbs show 4/1', timeoutMs: 3000 },
      )
      .catch(() => {}); // expect() below reports the actual text
    const o2 = await orbs();
    expect(
      o2[0].text.startsWith('4') && o2[1].text.startsWith('1'),
      `after 4/1: ${o2[0].text} ${o2[1].text}`,
    );
    expect(
      Math.abs(parseFloat(o2[0].pct) - 400 / info.hpMax) < 1,
      `hp fill ${o2[0].pct} expected ${(400 / info.hpMax).toFixed(1)}%`,
    );
    await g.update(
      `({ ...g, hp: { ...g.hp, current: ${info.hp} }, prayer: { ...g.prayer, current: ${info.pr} } })`,
    );
    return `store ${JSON.stringify(info)}; text ${JSON.stringify(o.map((x) => x.text))}; fill at hp4 ${o2[0].pct}`;
  });

  await check('o2', 'Tap Run orb toggles run on/off (store + visual)', async () => {
    await atRow();
    const before = (await orbs())[2];
    expect((await running()) === false, 'running initially');
    await tapRun();
    expect((await running()) === true, 'tap did not enable run');
    const on = (await orbs())[2];
    expect(
      on.pressed === 'true' && on.label.startsWith('Run on') && on.color !== before.color,
      `on ${JSON.stringify(on)} vs ${JSON.stringify(before)}`,
    );
    await tapRun();
    expect((await running()) === false, 'tap did not disable run');
    const off = (await orbs())[2];
    expect(
      off.pressed === 'false' && off.label.startsWith('Run off') && off.color === before.color,
      'off ' + JSON.stringify(off),
    );
    return `${before.label}/${before.color} -> ${on.label}/${on.color} -> ${off.label}`;
  });

  await check('o3', 'Run cannot be enabled at 0 energy, with feedback', async () => {
    await atRow();
    await g.setMovement('runEnergy: 0, running: false');
    const o = (await orbs())[2];
    const chatBefore = (await g.chatLines()).length;
    await tapRun();
    await g.waitChat(LOW, { timeoutMs: 3000 }).catch(() => {}); // the count check below reports a miss
    expect((await running()) === false, 'run turned on at 0 energy');
    const n = await g.chatCount(LOW);
    expect(
      n === 1,
      `chat line "${LOW}" count ${n} (expected 1; orb disabled=${o.disabled}, chat ${chatBefore}->${(await g.chatLines()).length}). A native-disabled button swallows the tap`,
    );
    return `disabled=${o.disabled} label=${o.label}; feedback x${n}`;
  });

  await check(
    'o4',
    'Run = 2 tiles/tick, walk = 1; energy drains running, regens walking/idle',
    async () => {
      await atRow();
      await g.setMovement('runEnergy: 6000');
      await tapRun();
      expect((await running()) === true, 'run not on');
      const e0 = await g.state('movement.runEnergy');
      let stop = await g.trackMoves();
      await g.walkTo(30, 15);
      await idle();
      const rs = steps(await stop());
      const e1 = await g.state('movement.runEnergy');
      expect(
        rs.length >= 3 && rs.filter((s) => s === 2).length >= rs.length - 1,
        `run steps/tick ${rs}`,
      );
      expect(e1 < e0, `energy did not drain ${e0}->${e1}`);
      // idle regen: wait (up to the old 40 ticks + slack) for the energy to rise instead of always 40 ticks
      await g
        .waitState('movement.runEnergy', `v => v > ${e1}`, { timeoutMs: 40 * 60 * 1.25 + 2000 })
        .catch(() => {});
      const e2 = await g.state('movement.runEnergy');
      expect(e2 > e1, `no idle regen ${e1}->${e2}`);
      await tapRun();
      expect((await running()) === false, 'run not off');
      const e3 = await g.state('movement.runEnergy');
      stop = await g.trackMoves();
      await g.walkTo(18, 15);
      await idle();
      const ws = steps(await stop());
      const e4 = await g.state('movement.runEnergy');
      expect(ws.length >= 3 && ws.every((s) => s === 1), `walk steps/tick ${ws}`);
      expect(e4 > e3, `no regen while walking ${e3}->${e4}`);
      return `run steps ${JSON.stringify(rs)} energy ${e0}->${e1} idle ->${e2}; walk steps ${JSON.stringify(ws)} energy ${e3}->${e4}`;
    },
  );

  await check('o5', 'Running with low energy auto-disables at 0 and the orb follows', async () => {
    await atRow();
    await g.setMovement('runEnergy: 150');
    await tapRun();
    expect((await running()) === true, 'run not on at 1.5%');
    await g.walkTo(30, 15);
    await g.waitFor(async () => (await running()) === false, {
      timeoutMs: 8000,
      label: 'run auto-off',
    });
    await g
      .waitFor(async () => (await orbs())[2].pressed === 'false', {
        label: 'orb follows auto-off',
        timeoutMs: 3000,
      })
      .catch(() => {});
    const o = (await orbs())[2];
    expect(
      o.label.startsWith('Run off') && o.pressed === 'false',
      'orb after auto-off ' + JSON.stringify(o),
    );
    const n = await g.chatCount("You're out of run energy.");
    expect(n === 1, `run-out chat line count ${n} (expected 1)`);
    return `auto-off, orb ${o.label}; run-out chat line x${n}`;
  });

  await check('o6', 'Orb tap targets >= 44px and topmost', async () => {
    const o = await orbs();
    const bad = o.filter((x) => x.w < 44 || x.h < 44 || !x.top);
    expect(bad.length === 0, 'small/covered orbs ' + JSON.stringify(bad));
    return o.map((x) => `${x.w.toFixed(0)}x${x.h.toFixed(0)}`).join(' ');
  });
});
