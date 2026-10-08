import { EVENT_SOUNDS, DEFAULT_MIN_GAP_MS, SOUND_DEFS } from './data';
import type {
  AmbienceSparse,
  AudioEvent,
  EventSoundEntry,
  MusicPiece,
  Note,
  SoundId,
  Volumes,
} from './types';

/**
 * Sounds for an event. An entry matches when its `reason` and `skill` (if set) agree with the event
 * (`orUnskilled` also accepts an event with no skill). Most specific wins: skill beats reason beats
 * plain. Unknown event -> [].
 */
export function resolveEventSounds(
  event: AudioEvent,
  table: readonly EventSoundEntry[] = EVENT_SOUNDS,
): readonly SoundId[] {
  let best: EventSoundEntry | undefined;
  let bestScore = -1;
  for (const e of table) {
    if (e.type !== event.type) continue;
    if (e.reason !== undefined && e.reason !== event.reason) continue;
    if (e.skill !== undefined && e.skill !== event.skill) {
      if (!(e.orUnskilled && event.skill === undefined)) continue;
    }
    const score = (e.reason !== undefined ? 1 : 0) + (e.skill !== undefined ? 2 : 0);
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best?.sounds ?? [];
}

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Tracks last play time per sound; `allow` records the play when it returns true. */
export function createThrottle(now: () => number) {
  const last = new Map<SoundId, number>();
  return {
    allow(id: SoundId): boolean {
      const t = now();
      const prev = last.get(id);
      const gap = SOUND_DEFS[id].minGapMs ?? DEFAULT_MIN_GAP_MS;
      if (prev !== undefined && t - prev < gap) return false;
      last.set(id, t);
      return true;
    },
  };
}

/** Accepts the new `{muted, volumes}` and the old `{volume, muted}` saved shapes; ignores junk. */
export function migrateSettings(saved: unknown): {
  muted?: boolean;
  volumes: Partial<Volumes>;
} {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const volumes: Partial<Volumes> = {};
  if (typeof s.volume === 'number') volumes.master = clampVolume(s.volume);
  const v = (s.volumes && typeof s.volumes === 'object' ? s.volumes : {}) as Record<
    string,
    unknown
  >;
  for (const k of ['master', 'sfx', 'ui', 'music', 'ambience'] as const) {
    if (typeof v[k] === 'number') volumes[k] = clampVolume(v[k]);
  }
  return { muted: typeof s.muted === 'boolean' ? s.muted : undefined, volumes };
}

export function randomIn(random: () => number, [lo, hi]: readonly [number, number]): number {
  return lo + random() * (hi - lo);
}

/** Frequency of a (possibly > one octave) scale degree above `root`. */
export function degreeFreq(root: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  const semis = (scale[((degree % n) + n) % n] ?? 0) + 12 * octave;
  return root * 2 ** (semis / 12);
}

export function barSeconds(piece: MusicPiece): number {
  return (4 * 60) / piece.bpm;
}

/**
 * Notes for one 4/4 bar: a three-note pad chord on the bar's progression degree plus a melody that
 * random-walks the scale on eighth-note steps. `state.degree` carries the melody between bars.
 */
export function planBar(
  piece: MusicPiece,
  bar: number,
  state: { degree: number },
  random: () => number,
): Note[] {
  const len = barSeconds(piece);
  const chord = piece.progression[bar % piece.progression.length] ?? 0;
  const notes: Note[] = [];
  for (const offset of [0, 2, 4]) {
    notes.push({
      at: 0,
      freq: degreeFreq(piece.root, piece.scale, chord + offset),
      duration: len * 1.1,
      gain: piece.padGain,
      wave: piece.padWave,
      attack: len * 0.3,
    });
  }
  const step = len / 8;
  const top = piece.scale.length * 2;
  for (let i = 0; i < 8; i++) {
    if (random() >= piece.density) continue;
    const move = Math.floor(random() * 5) - 2;
    state.degree = Math.min(top, Math.max(0, state.degree + move));
    notes.push({
      at: i * step,
      freq: degreeFreq(piece.root * 2, piece.scale, state.degree),
      duration: step * (1 + Math.floor(random() * 3)),
      gain: piece.melodyGain,
      wave: piece.melodyWave,
      attack: 0.02,
    });
  }
  return notes;
}

/** One cluster of sparse notes (a chirp run), starting at offset 0. */
export function planSparse(def: AmbienceSparse, random: () => number): Note[] {
  const count = Math.round(randomIn(random, def.count));
  const base = randomIn(random, def.freq);
  const notes: Note[] = [];
  for (let i = 0; i < count; i++) {
    const freq = base * (1 + (random() - 0.5) * 0.2);
    notes.push({
      at: i * def.spacing,
      freq,
      endFreq: def.slide ? freq * def.slide : undefined,
      duration: def.duration,
      gain: def.gain,
      wave: def.wave,
    });
  }
  return notes;
}
