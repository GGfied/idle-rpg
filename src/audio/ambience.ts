import { randomIn, planSparse } from './logic';
import { renderNote } from './notes';
import type { AmbienceDef, Scene } from './types';

/**
 * Builds the ambience for one area: a few looping noise beds (source -> filter -> gain, with an
 * LFO on the gain) plus sparse one-shot clusters scheduled on the audio clock by `tick`.
 * The scene gain starts at 0; the caller fades it in.
 */
export function createAmbienceScene(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  def: AmbienceDef,
  random: () => number,
): Scene {
  const scene = ctx.createGain();
  scene.gain.value = 0;
  scene.connect(out);
  const nodes: AudioNode[] = [scene];
  const sources: AudioScheduledSourceNode[] = [];
  const sparse: { layer: (typeof def.layers)[number] & { kind: 'sparse' }; next: number }[] = [];

  for (const layer of def.layers) {
    if (layer.kind === 'sparse') {
      sparse.push({ layer, next: ctx.currentTime + randomIn(random, layer.gap) });
      continue;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.frequency.value = layer.freq;
    if (layer.q !== undefined) filter.Q.value = layer.q;
    const g = ctx.createGain();
    g.gain.value = layer.gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(scene);
    src.start(ctx.currentTime, random() * noise.duration);
    sources.push(src);
    nodes.push(src, filter, g);
    if (layer.lfoRate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = layer.lfoRate;
      const depth = ctx.createGain();
      depth.gain.value = layer.gain * (layer.lfoDepth ?? 0.5);
      lfo.connect(depth);
      depth.connect(g.gain);
      lfo.start();
      sources.push(lfo);
      nodes.push(lfo, depth);
    }
  }

  return {
    gain: scene,
    tick(now, horizon) {
      for (const s of sparse) {
        if (s.next < now) s.next = now;
        while (s.next < horizon) {
          for (const n of planSparse(s.layer, random)) renderNote(ctx, scene, n, s.next + n.at);
          s.next += randomIn(random, s.layer.gap);
        }
      }
      // Clusters already scheduled past a stop() are harmless: the scene gain is 0 by then.
    },
    stop(at) {
      for (const s of sources) s.stop(at);
    },
    dispose() {
      for (const n of nodes) n.disconnect();
    },
  };
}
