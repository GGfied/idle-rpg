/**
 * Phaser's CANVAS renderer ignores the tint argument of RenderTexture.batchDrawFrame (the WebGL path
 * multiplies it in), so a stamped ground texture would come out untinted: brighter, and without the
 * low-frequency colour blobs. This draws the frame multiplied by `tint` instead, keeping the frame's
 * own alpha exactly (a clip + multiply fill would darken the antialiased diamond edges twice and
 * show a grid).
 */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let scratch: HTMLCanvasElement | null = null;

export function drawTinted(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  f: FrameRect,
  x: number,
  y: number,
  tint: number,
): void {
  if ((tint & 0xffffff) === 0xffffff) {
    ctx.drawImage(source, f.x, f.y, f.width, f.height, x, y, f.width, f.height);
    return;
  }
  const c = (scratch ??= document.createElement('canvas'));
  if (c.width !== f.width || c.height !== f.height) {
    c.width = f.width;
    c.height = f.height;
  }
  const t = c.getContext('2d')!;
  t.globalCompositeOperation = 'copy';
  t.drawImage(source, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
  t.globalCompositeOperation = 'multiply';
  t.fillStyle = `rgb(${(tint >> 16) & 255},${(tint >> 8) & 255},${tint & 255})`;
  t.fillRect(0, 0, f.width, f.height);
  // multiply keeps destination alpha, but re-assert it so semi-transparent edges stay exact.
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(source, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
  ctx.drawImage(c, x, y);
}
