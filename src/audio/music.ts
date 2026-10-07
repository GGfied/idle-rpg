import { barSeconds, planBar, randomIn } from './logic';
import { renderNote } from './notes';
import type { MusicDef, MusicPiece, Scene } from './types';

/**
 * Generative music for one area. `tick` schedules bars ahead of the audio clock; after the last
 * bar of a piece it stays silent for a random gap, then picks another piece (not the same twice
 * in a row when there is a choice). The scene gain starts at 0; the caller fades it in.
 */
export function createMusicScene(
  ctx: AudioContext,
  out: AudioNode,
  def: MusicDef,
  random: () => number,
): Scene {
  const scene = ctx.createGain();
  scene.gain.value = 0;
  scene.connect(out);

  let next = ctx.currentTime + 0.3;
  let piece: MusicPiece | null = null;
  let last = -1;
  let bar = 0;
  const state = { degree: 0 };

  function pickPiece(): MusicPiece {
    let i = Math.floor(random() * def.pieces.length);
    if (def.pieces.length > 1 && i === last) i = (i + 1) % def.pieces.length;
    last = i;
    state.degree = 2;
    bar = 0;
    return def.pieces[i] as MusicPiece;
  }

  return {
    gain: scene,
    tick(now, horizon) {
      if (def.pieces.length === 0) return;
      if (next < now) next = now;
      while (next < horizon) {
        piece ??= pickPiece();
        for (const n of planBar(piece, bar, state, random)) renderNote(ctx, scene, n, next + n.at);
        next += barSeconds(piece);
        bar++;
        if (bar >= piece.progression.length) {
          piece = null;
          next += randomIn(random, def.gapSeconds);
        }
      }
    },
    stop() {
      // Notes are one-shot and end on their own; the fade-out silences anything still ringing.
    },
    dispose() {
      scene.disconnect();
    },
  };
}
