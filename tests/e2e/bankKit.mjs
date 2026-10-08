// Shared DOM/input helpers for the bank e2e files (bank, isoBank): both drive the Willowbrook bank (booths 12,9 / 14,9,
// bankers 12,8 / 14,8) with the same dialogue, menu and bank-panel selectors. Built on lib.mjs `g`; no own boot code.
import { check, expect } from './lib.mjs';

export const BOOTHS = [
  { x: 12, y: 9 },
  { x: 14, y: 9 },
];
export const BANKERS = [
  { x: 12, y: 8 },
  { x: 14, y: 8 },
];
const J = JSON.stringify;

/** check() with the elapsed ms appended to the evidence (shows where the time goes). */
export const timed = (id, title, fn) =>
  check(id, title, async () => {
    const t0 = Date.now();
    const ev = await fn();
    return `${ev} [${Date.now() - t0} ms]`;
  });

export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const dom = (g, js) => g.eval(`(() => { ${js} })()`);
export const exists = (g, sel) => dom(g, `return !!document.querySelector(${J(sel)});`);
export const clickBtn = (g, sel, re) =>
  dom(
    g,
    `const el=[...document.querySelectorAll(${J(sel)})].find((e)=>new RegExp(${J(re)}).test(e.textContent||'')); if(!el) return false; el.click(); return true;`,
  );
export const menuLabels = (g) =>
  dom(
    g,
    `return [...document.querySelectorAll('[role=menuitem]')].map((b)=>b.textContent.trim());`,
  );
export const dialogueText = (g) =>
  dom(g, `return document.querySelector('.dialogue-text')?.textContent ?? null;`);
export const choices = (g) =>
  dom(
    g,
    `return [...document.querySelectorAll('.dialogue-choice')].map((b)=>b.textContent.replace(/^\\d+/,'').trim());`,
  );
/** Compact game snapshot: tile, path length, inventory, bank, bankOpen. */
export const snap = async (g) => {
  const s = await g.state();
  return {
    pos: s.movement.position,
    pathLen: s.movement.path.length,
    inv: s.inventory.slots.map((x) => x && { id: x.itemId, n: x.quantity }),
    bank: s.bank.items,
    bankOpen: s.bankOpen,
  };
};
export const waitBank = (g, open = true, timeoutMs = 15000) =>
  g.waitState('', `s => s.bankOpen === ${open}`, {
    timeoutMs,
    label: `bank ${open ? 'open' : 'closed'}`,
  });
export const waitMenu = (g, timeoutMs = 3000) =>
  g.waitFor(() => exists(g, '[role=menu]'), { timeoutMs, label: 'menu' });
export const waitDialogue = (g, timeoutMs = 15000) =>
  g.waitFor(() => exists(g, '.dialogue'), { timeoutMs, label: 'dialogue' });
export const waitChoices = (g, n = 3, timeoutMs = 3000) =>
  g.waitFor(async () => (await choices(g)).length === n, {
    timeoutMs,
    label: `${n} dialogue choices`,
  });
/** Walk by the store shortcut (travel only), then wait for the player to stop. Taps settle the camera themselves. */
export const walkSettled = async (g, x, y) => {
  await g.walkTo(x, y);
  await g.waitIdle({ timeoutMs: 30000 });
};
export const key = async (g, k, code, vk) => {
  for (const type of ['keyDown', 'keyUp'])
    await g.cdp.send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      windowsVirtualKeyCode: vk,
      ...(k === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}),
    });
};
export const closeAll = async (g) => {
  await key(g, 'Escape', 'Escape', 27);
  await clickBtn(g, '.bank-overlay button', 'Close');
  await g.sleep(100);
};
/** Put n single logs into the first free inventory slots (tools stay). */
export const seedLogs = (g, n) =>
  g.update(
    `(() => { let i = 0; const slots = g.inventory.slots.map((s) => { if (!s && i < ${n}) { i++; return { itemId: 'logs', quantity: 1 }; } return s; }); return { ...g, inventory: { ...g.inventory, slots } }; })()`,
  );
export const logsInBank = (s) => s.bank.find((b) => b.itemId === 'logs')?.quantity ?? 0;
export const logsInInv = (s) => s.inv.filter((i) => i?.id === 'logs').length;
/** Real tap on a visible bank-grid slot (aria-label prefix `label`); waits for its menu. */
export async function bankSlotMenu(g, label) {
  const sp = await dom(
    g,
    `const s=document.querySelector('.bank-overlay .bank-grid button[aria-label^=${J(label)}]'); const r=s.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`,
  );
  await g.tap(sp.x, sp.y);
  await waitMenu(g);
}
/** Deposit-all, withdraw 1, withdraw all of `logs`; asserts every count. Returns evidence. Bank panel must be open. */
export async function bankOps(g, { realItemTap = false } = {}) {
  await seedLogs(g, 4);
  const before = await snap(g);
  const bank0 = logsInBank(before);
  const inv0 = logsInInv(before);
  expect(inv0 >= 4, `seed failed: ${inv0} logs`);
  expect(await clickBtn(g, '.bank-overlay button', 'Deposit inventory'), 'no Deposit button');
  await g.waitState('', `s => s.inventory.slots.every((x) => !x || x.itemId !== 'logs')`, {
    timeoutMs: 5000,
    label: 'logs deposited',
  });
  const a = await snap(g);
  const bank1 = logsInBank(a);
  expect(bank1 === bank0 + inv0, `bank logs ${bank0}+${inv0} -> ${bank1}`);
  expect(
    a.inv.every((i) => !i || /_(axe|pickaxe|net|rod)$/.test(i.id)),
    `deposit-all left non-tools: ${JSON.stringify(a.inv.filter(Boolean))}`,
  );
  const pick = async (re) => {
    await bankSlotMenu(g, 'Logs');
    const lab = await menuLabels(g);
    if (realItemTap) {
      const r = await dom(
        g,
        `const el=[...document.querySelectorAll('[role=menuitem]')].find((e)=>new RegExp(${J(re)}).test(e.textContent||'')); if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2};`,
      );
      expect(r, `no menu item ${re}`);
      await g.tap(r.x, r.y);
    } else await clickBtn(g, '[role=menuitem]', re);
    return lab;
  };
  const lab = await pick('^Withdraw 1$');
  expect(
    lab.includes('Withdraw 1') && lab.includes('Withdraw all'),
    `slot menu ${JSON.stringify(lab)}`,
  );
  await g.waitState(
    '',
    `s => s.inventory.slots.filter((x) => x && x.itemId === 'logs').length === 1`,
    {
      label: 'withdraw 1',
    },
  );
  const w1 = await snap(g);
  expect(logsInInv(w1) === 1, `after withdraw 1 inv logs=${logsInInv(w1)}`);
  expect(
    logsInBank(w1) === bank1 - 1,
    `bank ${logsInBank(w1)} after withdraw 1, want ${bank1 - 1}`,
  );
  await pick('^Withdraw all$');
  await g.waitState('', `s => s.bank.items.every((b) => b.itemId !== 'logs')`, {
    label: 'withdraw all',
  });
  const wa = await snap(g);
  expect(
    logsInInv(wa) === bank1,
    `after withdraw all inv logs ${logsInInv(wa)}, expected ${bank1}`,
  );
  expect(!wa.bank.some((b) => b.itemId === 'logs'), 'logs remain in bank after withdraw all');
  await clickBtn(g, '.bank-overlay button', 'Deposit inventory'); // leave logs banked
  await g.waitState('', `s => s.inventory.slots.every((x) => !x || x.itemId !== 'logs')`, {
    label: 'redeposit',
  });
  return `bank logs ${bank0}->${bank1}; wd1 ok (inv 1, bank ${bank1 - 1}); wd-all ok (inv ${logsInInv(wa)}); redeposited`;
}
