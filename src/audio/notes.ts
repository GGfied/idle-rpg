import type { Note } from './types';

/** Schedules one oscillator note at audio time `start` into `out`; frees its nodes when it ends. */
export function renderNote(ctx: AudioContext, out: AudioNode, note: Note, start: number): void {
  const attack = Math.min(note.attack ?? 0.01, note.duration * 0.5);
  const end = start + note.duration;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(note.gain, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(out);
  const osc = ctx.createOscillator();
  osc.type = note.wave;
  osc.frequency.setValueAtTime(note.freq, start);
  if (note.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(note.endFreq, end);
  osc.connect(gain);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(start);
  osc.stop(end + 0.02);
}
