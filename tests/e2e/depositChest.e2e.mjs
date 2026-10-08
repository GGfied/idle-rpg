// deposit chest e2e. Run: node tests/e2e/depositChest.e2e.mjs (port 5234, SHOTS_DIR optional)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { check, expect, forEachViewport, withGame } from './lib.mjs';

const CHEST = 'deposit_chest_1';
const inv = (g) =>
  g.eval(
    `(() => { const s = window.__idleRpg.store.getState().game; const c = (a) => a.reduce((n, x) => n + (x ? x.quantity : 0), 0);
      return { inv: c(s.inventory.slots), bank: c(s.bank.items), mode: s.bankMode, open: s.bankOpen }; })()`,
  );
const dialogTitle = (g) =>
  g.eval(`document.querySelector('[role=dialog][data-mode]')?.getAttribute('aria-label') ?? null`);
const pos = (g) => g.state('movement.position');

async function clipShot(g, name, tx, ty) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return '';
  mkdirSync(dir, { recursive: true });
  const p = await g.tileClient(tx, ty, -20);
  const { data } = await g.cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, p.x - 60), y: Math.max(0, p.y - 70), width: 120, height: 120, scale: 4 },
  });
  const f = resolve(dir, `depositChest-${name}.png`);
  writeFileSync(f, Buffer.from(data, 'base64'));
  return f;
}

async function tapMenu(g, re) {
  const r = await g.eval(
    `(() => { const e = [...document.querySelectorAll('.menu-item')].find((x) => ${re}.test(x.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height, all: [...document.querySelectorAll('.menu-item')].map((x) => x.textContent) }; })()`,
  );
  expect(
    r,
    `no menu item ${re}: ${await g.eval(`[...document.querySelectorAll('.menu-item')].map((x) => x.textContent)`)}`,
  );
  await g.tap(r.x, r.y);
  return r;
}

async function openDeposit(g) {
  if ((await inv(g)).open) return;
  const p = await pos(g);
  if (p.x !== 48 || p.y !== 15) await g.teleport(48, 18);
  await g.tapObject(CHEST);
  await g.waitFor(async () => (await pos(g)).x === 48 && (await pos(g)).y === 15, {
    label: 'adjacent tile 48,15',
  });
  await g.waitFor(async () => (await inv(g)).open, { label: 'panel open' });
}

await withGame(
  { port: 5234 },
  forEachViewport(['desktop', 'phone'], async (g, vp) => {
    await check('c1', 'chest drawn (close-up screenshot taken)', async () => {
      await g.teleport(48, 17);
      const f = await clipShot(g, `${vp}-chest`, 48, 14);
      return `shot=${f}`;
    });
    await check('c2', 'tap chest walks adjacent, Deposit-only panel opens', async () => {
      await g.setInventory([
        { itemId: 'logs', quantity: 5 },
        'bronze_axe',
        { itemId: 'oak_logs', quantity: 3 },
      ]);
      await openDeposit(g);
      const st = await inv(g);
      expect(st.mode === 'depositOnly', `mode ${st.mode}`);
      expect((await dialogTitle(g)) === 'Deposit chest', `title ${await dialogTitle(g)}`);
      const grids = await g.eval(`document.querySelectorAll('[role=dialog] .bank-grid').length`);
      expect(grids === 1, `grids ${grids}`);
      await g.screenshot(`depositChest-${vp}-panel`);
      return `pos ${JSON.stringify(await pos(g))} mode=${st.mode} grids=${grids}`;
    });
    await check('c3', 'per-slot Deposit 1 / Deposit all / Deposit all button', async () => {
      await g.setInventory([
        { itemId: 'logs', quantity: 5 },
        'bronze_axe',
        { itemId: 'oak_logs', quantity: 3 },
      ]);
      await openDeposit(g);
      const a = await inv(g);
      await g.tapSelector('[role=dialog] .slot-full');
      await tapMenu(g, /^Deposit 1/);
      const b = await inv(g);
      expect(b.inv === a.inv - 1 && b.bank === a.bank + 1, `1: ${JSON.stringify([a, b])}`);
      await g.tapSelector('[role=dialog] .slot-full');
      await tapMenu(g, /^Deposit all/);
      const c = await inv(g);
      expect(c.inv === a.inv - 5 && c.bank === a.bank + 5, `all: ${JSON.stringify(c)}`);
      const btn = await g.rect('[role=dialog] .bank-btn');
      if (vp === 'phone') expect(btn.h >= 44, `button h ${btn.h}`);
      await g.tapSelector('[role=dialog] .bank-btn');
      const d = await inv(g);
      expect(
        d.inv === 1 && d.bank === a.bank + 8, // bronze_axe (a tool) stays by design
        `button: ${JSON.stringify(d)}`,
      );
      return `inv ${a.inv}->${b.inv}->${c.inv}->${d.inv}, bank ${a.bank}->${d.bank}`;
    });
    await check('c4', 'no withdraw controls; forced withdraw changes nothing', async () => {
      await g.update(`({ ...g, bank: { ...g.bank, items: [{ itemId: 'logs', quantity: 4 }] } })`);
      await g.setInventory(['bronze_axe']);
      await openDeposit(g);
      const ctl = await g.eval(
        `[...document.querySelectorAll('[role=dialog] button')].map((b) => b.textContent).join('|')`,
      );
      expect(!/withdraw/i.test(ctl), `buttons ${ctl}`);
      expect(
        /In the bank/.test(await g.eval('document.body.innerText')) === false,
        'bank grid text',
      );
      const a = await inv(g);
      await g.eval(`window.__idleRpg.store.getState().bankWithdraw('logs', 'all')`);
      const b = await inv(g);
      expect(b.inv === a.inv && b.bank === a.bank && b.bank > 0, `${JSON.stringify([a, b])}`);
      return `buttons=${ctl}; forced withdraw: bank ${a.bank}->${b.bank}, inv ${a.inv}->${b.inv}`;
    });
    await check('c5', 'empty inventory: "Nothing to deposit." and dimmed button', async () => {
      await g.setInventory([]);
      await openDeposit(g);
      const txt = await g.eval(`document.querySelector('[role=dialog] .bank-empty')?.textContent`);
      expect(txt === 'Nothing to deposit.', `text ${txt}`);
      const dim = await g.eval(
        `(() => { const b = document.querySelector('[role=dialog] .bank-btn'); return { dim: b.dataset.dim, aria: b.getAttribute('aria-disabled'), op: getComputedStyle(b).opacity }; })()`,
      );
      expect(dim.dim === 'true' && dim.aria === 'true', JSON.stringify(dim));
      const before = await inv(g);
      await g.tapSelector('[role=dialog] .bank-btn');
      expect(JSON.stringify(await inv(g)) === JSON.stringify(before), 'dimmed tap changed state');
      return `${txt} ${JSON.stringify(dim)}`;
    });
    await check('c6', 'Close then a real bank opens full', async () => {
      await openDeposit(g);
      const cl = await g.eval(
        `[...document.querySelectorAll('[role=dialog] .bank-btn')].find((b) => b.textContent === 'Close').getBoundingClientRect().height`,
      );
      if (vp === 'phone') expect(cl >= 44, `close h ${cl}`);
      await g.eval(
        `[...document.querySelectorAll('[role=dialog] .bank-btn')].find((b) => b.textContent === 'Close').click()`,
      );
      await g.waitFor(async () => !(await inv(g)).open, { label: 'closed' });
      expect((await inv(g)).mode === 'full', 'mode after close');
      const booth = await g.targetOfKind('bank_booth');
      await g.teleport(booth.x, booth.y + 2);
      await g.tapObject(booth.id);
      await g.waitFor(async () => (await inv(g)).open, { label: 'bank open' });
      const st = await inv(g);
      expect(
        st.mode === 'full' && (await dialogTitle(g)) === 'Bank',
        `mode ${st.mode} ${await dialogTitle(g)}`,
      );
      expect(
        (await g.eval(`document.querySelectorAll('[role=dialog] .bank-grid').length`)) === 2,
        'bank grids',
      );
      return `bank title=${await dialogTitle(g)} mode=${st.mode}`;
    });
    await check('c7', 'walking away resets to full mode; menu Deposit via long-press', async () => {
      await g.eval(`window.__idleRpg.store.getState().closeBank()`);
      await g.teleport(48, 18);
      const t = (await g.targets()).find((o) => o.id === CHEST);
      const p = await g.tileClient(t.x, t.y, -t.up / 2);
      await g.longPress(p.x, p.y);
      const items = await g.eval(
        `[...document.querySelectorAll('[role=menu] .menu-item')].map((e) => e.textContent)`,
      );
      expect(
        items.some((x) => /^Deposit/.test(x)),
        `menu ${items}`,
      );
      await g.tapSelector('[role=menu] .menu-item');
      await g.waitFor(async () => (await inv(g)).open, { label: 'panel via menu' });
      expect((await inv(g)).mode === 'depositOnly', 'mode via menu');
      await g.walkTo(48, 20);
      await g.waitFor(async () => !(await inv(g)).open, { label: 'closed on walk' });
      const st = await inv(g);
      expect(st.mode === 'full', `mode after walk ${st.mode}`);
      return `menu=${items.join('/')}, after walk open=${st.open} mode=${st.mode}`;
    });
  }),
);
