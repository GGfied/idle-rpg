// Minimap label keep-out e2e: with an area/facility label anchored right at the player, no label text pixels may touch the
// player marker box; marker stays white+black-outlined; facing arrow still draws. Run: node tests/e2e/mmLabel.e2e.mjs (port 5286)
import { check, expect, withGame } from './lib.mjs';

// Spy: last frame (after clearRect) fillText boxes + alpha, and arrow strokes (lineWidth 2.4*dpr black stroke with 4-pt path).
const SPY = `(() => {
  const P = CanvasRenderingContext2D.prototype, oc = P.clearRect, of = P.fillText, ol = P.lineTo, os = P.stroke, om = P.moveTo;
  window.__mm = { frame: [], arrow: 0, pts: 0 };
  const mine = (c) => c.canvas && c.canvas.className === 'minimap';
  P.clearRect = function (...a) { if (mine(this)) { window.__mm.frame = []; window.__mm.arrow = 0; } return oc.apply(this, a); };
  P.moveTo = function (...a) { if (mine(this)) window.__mm.pts = 0; return om.apply(this, a); };
  P.lineTo = function (...a) { if (mine(this)) window.__mm.pts++; return ol.apply(this, a); };
  P.stroke = function () { if (mine(this) && this.lineJoin === 'round' && this.strokeStyle === '#000000' && window.__mm.pts === 3 &&
    Math.abs(this.lineWidth - 2.4 * (this.canvas.width / this.canvas.clientWidth)) < 0.01) window.__mm.arrow++; return os.apply(this, arguments); };
  P.fillText = function (t, x, y) { if (mine(this)) window.__mm.frame.push({ t, x, y, a: this.globalAlpha, font: this.font, al: this.textAlign, w: this.measureText(t).width }); return of.call(this, t, x, y); };
})();`;

const SNAP = `(() => {
  const cv = document.querySelector('canvas.minimap'), dpr = cv.width / cv.clientWidth, r = cv.width / 2;
  const ctx = cv.getContext('2d'), n = cv.width, d = ctx.getImageData(0, 0, n, n).data;
  const px = (x, y) => { const i = (y * n + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  let inner = 0, innerTot = 0, ring = 0, ringDark = 0, ringTot = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dist = Math.hypot(x + 0.5 - r, y + 0.5 - r), [R, G, B] = px(x, y);
    if (dist <= 1 * dpr) { innerTot++; if (R > 245 && G > 245 && B > 245) inner++; }
    else if (dist >= 2.1 * dpr && dist <= 3.0 * dpr) { ringTot++; if (R < 60 && G < 60 && B < 60) ringDark++; }
    else if (dist >= 3.7 * dpr && dist <= 6 * dpr && R > 245 && G > 245 && B > 245) ring++;
  }
  return { dpr, r, inner, innerTot, ringDark, ringTot, whiteOutside: ring, frame: window.__mm.frame.slice(), arrow: window.__mm.arrow };
})()`;

const overlapsMarker = (s, f) => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(f.font)[1]);
  const l = f.al === 'center' ? f.x - f.w / 2 : f.al === 'right' ? f.x - f.w : f.x;
  const m = 7 * s.dpr; // marker half-extent (arrow tip 5.5) + text outline stroke 1.5
  return l < s.r + m && l + f.w > s.r - m && f.y - px / 2 < s.r + m && f.y + px / 2 > s.r - m;
};

await withGame({ port: 5286 }, async (g) => {
  await g.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  for (const vp of ['desktop', 'phone']) {
    await g.setViewport(vp);
    await g.load();
    const labels = await g.eval(
      `(async () => { const W = await import('/src/features/world/index.ts'); return W.WORLD_DEF.labels.map((l) => ({ t: l.text, k: l.kind, x: l.x, y: l.y })); })()`,
    );
    const pick = (re, kind) => labels.find((l) => re.test(l.t) && (!kind || l.k === kind));
    const spots = [
      ['greatmere', pick(/Greatmere/, 'region')],
      ['fernhaven', pick(/Fernhaven/, 'region')],
      ['willowbrook', pick(/Willowbrook/, 'region')],
      ['bank', pick(/Bank/, 'facility')],
    ].filter(([, l]) => l);
    await check('spots', 'found label spots', () => {
      expect(spots.length >= 3, `only ${spots.length} spots: ${labels.map((l) => l.t)}`);
      return spots.map(([n, l]) => `${n}=${l.t}@${l.x},${l.y}`).join(' ');
    });
    for (const [name, l] of spots) {
      await g.teleport(l.x, l.y, { settleMs: 3000 });
      await g.sleep(250);
      const s = await g.eval(SNAP);
      await check(
        `${vp}-${name}-text`,
        `${name}: no solid label text over the player marker box`,
        () => {
          const bad = s.frame.filter((f) => overlapsMarker(s, f) && f.a >= 0.99);
          expect(bad.length === 0, `solid label over marker: ${JSON.stringify(bad)}`);
          return `dpr${s.dpr} labels=[${s.frame.map((f) => f.t + '@' + f.a)}]`;
        },
      );
      await check(
        `${vp}-${name}-px`,
        `${name}: marker core pixels intact (white core, dark ring just outside)`,
        () => {
          expect(s.inner === s.innerTot, `marker core not white ${s.inner}/${s.innerTot}`);
          expect(s.ringDark > 0, 'no dark outline pixels around marker core');
          return `core ${s.inner}/${s.innerTot} darkRing ${s.ringDark}/${s.ringTot}`;
        },
      );
    }
    await check(`${vp}-arrow`, 'facing arrow draws after walking', async () => {
      const p = await g.state('movement.position');
      await g.walkTo(p.x + 6, p.y);
      let seen = 0;
      for (let i = 0; i < 40 && !seen; i++) {
        await g.sleep(60);
        seen = (await g.eval(SNAP)).arrow;
      }
      expect(seen > 0, 'no arrow stroke seen while walking');
      return `arrow strokes in frame: ${seen}`;
    });
  }
});
