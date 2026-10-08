import type { AmbienceDef, AreaKind, EventSoundEntry, MusicDef, SoundDef, SoundId } from './types';

export const DEFAULT_VOLUME = 0.7;
export const DEFAULT_VOLUMES = {
  master: DEFAULT_VOLUME,
  sfx: 1,
  ui: 1,
  music: 0.6,
  ambience: 0.8,
} as const;
export const DEFAULT_MIN_GAP_MS = 60;
/** Master gain ceiling. Worst-case overlapping layers x this stays <= 1 (tested); a limiter backs it up. */
export const MASTER_CEILING = 0.8;

export const SOUND_DEFS: Record<SoundId, SoundDef> = {
  // Axe impact: a short woody "thock" on every swing that lands. Alternates differ in body pitch
  // and click colour; pitch and gain jitter on top keep repeats from machine-gunning.
  axeHit: {
    channel: 'sfx',
    minGapMs: 150,
    pitchVariance: 0.08,
    gainVariance: 0.15,
    layers: [
      { kind: 'tone', wave: 'triangle', from: 210, to: 95, duration: 0.09, gain: 0.7 },
      { kind: 'noise', from: 1400, duration: 0.04, gain: 0.45, filter: 'bandpass' },
    ],
    variants: [
      [
        { kind: 'tone', wave: 'triangle', from: 175, to: 80, duration: 0.1, gain: 0.7 },
        { kind: 'noise', from: 1000, duration: 0.045, gain: 0.5, filter: 'bandpass' },
      ],
      [
        { kind: 'tone', wave: 'sine', from: 240, to: 110, duration: 0.08, gain: 0.55 },
        { kind: 'noise', from: 2000, duration: 0.03, gain: 0.3, filter: 'bandpass' },
        {
          kind: 'tone',
          wave: 'triangle',
          from: 120,
          to: 70,
          duration: 0.07,
          gain: 0.3,
          delay: 0.015,
        },
      ],
      [
        { kind: 'tone', wave: 'triangle', from: 150, to: 75, duration: 0.12, gain: 0.7 },
        { kind: 'noise', from: 800, duration: 0.05, gain: 0.5, filter: 'lowpass' },
      ],
    ],
  },
  // A log is gained: a wood crack/split, then a soft two-note "item get" chime (sine, so it never
  // reads as the square-wave level-up fanfare).
  logGained: {
    channel: 'sfx',
    minGapMs: 120,
    pitchVariance: 0.04,
    layers: [
      { kind: 'noise', from: 3200, duration: 0.05, gain: 0.5, filter: 'highpass' },
      { kind: 'tone', wave: 'sawtooth', from: 520, to: 130, duration: 0.06, gain: 0.3 },
      { kind: 'tone', wave: 'sine', from: 660, duration: 0.12, gain: 0.3, delay: 0.09 },
      { kind: 'tone', wave: 'sine', from: 880, duration: 0.2, gain: 0.25, delay: 0.17 },
    ],
  },
  treeFall: {
    channel: 'sfx',
    layers: [
      { kind: 'noise', from: 2500, duration: 0.06, gain: 0.7, filter: 'highpass' },
      { kind: 'tone', wave: 'sawtooth', from: 220, to: 140, duration: 0.1, gain: 0.35 },
      { kind: 'tone', wave: 'sine', from: 110, to: 45, duration: 0.2, gain: 0.9, delay: 0.09 },
    ],
  },
  levelUp: {
    channel: 'sfx',
    minGapMs: 300,
    layers: [
      { kind: 'tone', wave: 'square', from: 523, duration: 0.14, gain: 0.35 },
      { kind: 'tone', wave: 'square', from: 659, duration: 0.14, gain: 0.35, delay: 0.14 },
      { kind: 'tone', wave: 'square', from: 784, duration: 0.14, gain: 0.35, delay: 0.28 },
      { kind: 'tone', wave: 'triangle', from: 1047, duration: 0.5, gain: 0.5, delay: 0.42 },
    ],
  },
  inventoryFull: {
    channel: 'sfx',
    minGapMs: 200,
    layers: [{ kind: 'tone', wave: 'triangle', from: 150, to: 110, duration: 0.16, gain: 0.7 }],
  },
  error: {
    channel: 'sfx',
    minGapMs: 200,
    layers: [{ kind: 'tone', wave: 'triangle', from: 170, to: 120, duration: 0.15, gain: 0.7 }],
  },
  uiClick: {
    channel: 'ui',
    pitchVariance: 0.03,
    layers: [{ kind: 'tone', wave: 'square', from: 900, to: 700, duration: 0.03, gain: 0.25 }],
  },
  itemDrop: {
    channel: 'sfx',
    layers: [
      { kind: 'tone', wave: 'sine', from: 140, to: 70, duration: 0.14, gain: 0.7 },
      { kind: 'noise', from: 600, duration: 0.05, gain: 0.3, filter: 'lowpass' },
    ],
  },
  walkClick: {
    channel: 'ui',
    pitchVariance: 0.05,
    layers: [{ kind: 'tone', wave: 'sine', from: 1200, to: 1000, duration: 0.025, gain: 0.2 }],
  },
  // Pickaxe on stone: a bright metallic "tink" over a dull rock knock; variants shift the ring.
  pickHit: {
    channel: 'sfx',
    minGapMs: 150,
    pitchVariance: 0.1,
    gainVariance: 0.15,
    layers: [
      { kind: 'tone', wave: 'triangle', from: 1900, to: 1300, duration: 0.06, gain: 0.3 },
      { kind: 'noise', from: 3200, duration: 0.03, gain: 0.45, filter: 'bandpass' },
      { kind: 'tone', wave: 'sine', from: 130, to: 80, duration: 0.07, gain: 0.4 },
    ],
    variants: [
      [
        { kind: 'tone', wave: 'triangle', from: 2300, to: 1500, duration: 0.07, gain: 0.3 },
        { kind: 'noise', from: 4000, duration: 0.025, gain: 0.45, filter: 'bandpass' },
        { kind: 'tone', wave: 'sine', from: 160, to: 90, duration: 0.06, gain: 0.45 },
      ],
      [
        { kind: 'tone', wave: 'square', from: 1500, to: 1000, duration: 0.04, gain: 0.15 },
        { kind: 'noise', from: 2400, duration: 0.04, gain: 0.5, filter: 'bandpass' },
        { kind: 'tone', wave: 'sine', from: 110, to: 70, duration: 0.08, gain: 0.5 },
      ],
    ],
  },
  // Ore gained: a stony rattle, then a small bright two-note ring (sine, a touch higher than logs).
  oreGained: {
    channel: 'sfx',
    minGapMs: 120,
    pitchVariance: 0.04,
    layers: [
      { kind: 'noise', from: 2800, duration: 0.04, gain: 0.4, filter: 'bandpass' },
      { kind: 'noise', from: 2200, duration: 0.03, gain: 0.3, filter: 'bandpass', delay: 0.05 },
      { kind: 'tone', wave: 'sine', from: 1175, duration: 0.12, gain: 0.25, delay: 0.09 },
      { kind: 'tone', wave: 'sine', from: 1568, duration: 0.2, gain: 0.2, delay: 0.16 },
    ],
  },
  // Rock depleted: low rumble plus a spray of falling pebbles.
  rockCrumble: {
    channel: 'sfx',
    minGapMs: 200,
    layers: [
      { kind: 'noise', from: 500, duration: 0.35, gain: 0.5, filter: 'lowpass' },
      { kind: 'tone', wave: 'sine', from: 90, to: 40, duration: 0.3, gain: 0.5 },
      { kind: 'noise', from: 2500, duration: 0.03, gain: 0.2, filter: 'bandpass', delay: 0.18 },
      { kind: 'noise', from: 1800, duration: 0.03, gain: 0.15, filter: 'bandpass', delay: 0.26 },
      { kind: 'noise', from: 3000, duration: 0.03, gain: 0.1, filter: 'bandpass', delay: 0.33 },
    ],
  },
  // Cast: a line whoosh, then a plop where the bait lands.
  fishCast: {
    channel: 'sfx',
    minGapMs: 300,
    pitchVariance: 0.05,
    layers: [
      { kind: 'noise', from: 1100, duration: 0.2, gain: 0.4, filter: 'bandpass' },
      { kind: 'noise', from: 2600, duration: 0.07, gain: 0.3, filter: 'highpass', delay: 0.22 },
      { kind: 'tone', wave: 'sine', from: 520, to: 220, duration: 0.09, gain: 0.5, delay: 0.22 },
    ],
  },
  // Catch: a splash, a bubbly rise, and a couple of wet flops.
  fishCaught: {
    channel: 'sfx',
    minGapMs: 150,
    pitchVariance: 0.05,
    layers: [
      { kind: 'noise', from: 1800, duration: 0.16, gain: 0.4, filter: 'bandpass' },
      { kind: 'noise', from: 4000, duration: 0.08, gain: 0.2, filter: 'highpass' },
      { kind: 'tone', wave: 'sine', from: 300, to: 700, duration: 0.08, gain: 0.35, delay: 0.04 },
      {
        kind: 'tone',
        wave: 'triangle',
        from: 200,
        to: 110,
        duration: 0.07,
        gain: 0.45,
        delay: 0.2,
      },
      {
        kind: 'tone',
        wave: 'triangle',
        from: 190,
        to: 100,
        duration: 0.07,
        gain: 0.35,
        delay: 0.3,
      },
    ],
  },
  // The fishing spot shifts: a soft burble of rising bubbles.
  spotBurble: {
    channel: 'sfx',
    minGapMs: 400,
    pitchVariance: 0.1,
    layers: [
      { kind: 'tone', wave: 'sine', from: 400, to: 800, duration: 0.07, gain: 0.2 },
      { kind: 'tone', wave: 'sine', from: 500, to: 1000, duration: 0.06, gain: 0.18, delay: 0.09 },
      { kind: 'tone', wave: 'sine', from: 350, to: 700, duration: 0.08, gain: 0.15, delay: 0.19 },
      { kind: 'noise', from: 900, duration: 0.25, gain: 0.12, filter: 'bandpass' },
    ],
  },
};

/**
 * Event type [+ reason] -> sounds. New events are new entries.
 * Entries with a `reason` win over a plain entry for the same type.
 * `gatherStopped` for depleted/cancelled intentionally has no entry (no error sound).
 */
export const EVENT_SOUNDS: readonly EventSoundEntry[] = [
  // swingImpact is emitted by the scene on the axe-strike frame of every swing (hit or miss).
  // Gathering events carry a `skill` (the app adds it to swingImpact and nodeDepleted); woodcutting
  // entries also accept an event with no skill so chopping keeps its sounds until that is wired.
  { type: 'swingImpact', skill: 'woodcutting', orUnskilled: true, sounds: ['axeHit'] },
  { type: 'itemGathered', skill: 'woodcutting', orUnskilled: true, sounds: ['logGained'] },
  { type: 'nodeDepleted', skill: 'woodcutting', orUnskilled: true, sounds: ['treeFall'] },
  { type: 'swingImpact', skill: 'mining', sounds: ['pickHit'] },
  { type: 'itemGathered', skill: 'mining', sounds: ['oreGained'] },
  { type: 'nodeDepleted', skill: 'mining', sounds: ['rockCrumble'] },
  { type: 'fishingAttempt', sounds: ['fishCast'] },
  { type: 'itemGathered', skill: 'fishing', sounds: ['fishCaught'] },
  { type: 'spotMoved', sounds: ['spotBurble'] },
  { type: 'levelUp', sounds: ['levelUp'] },
  { type: 'gatherStopped', reason: 'inventoryFull', sounds: ['inventoryFull'] },
  { type: 'gatherStopped', reason: 'levelTooLow', sounds: ['error'] },
  { type: 'gatherStopped', reason: 'noTool', sounds: ['error'] },
];

/** Crossfade lengths in seconds. */
export const AMBIENCE_FADE_S = 1.5;
export const MUSIC_FADE_S = 3;
/** Scheduler: how often it wakes and how far ahead of the audio clock it schedules. */
export const SCHEDULER_TICK_MS = 200;
export const SCHEDULER_LOOKAHEAD_S = 1.5;
/** Length of the looping noise buffer behind ambience beds. */
export const AMBIENCE_NOISE_S = 3;

const BIRD_HIGH = {
  kind: 'sparse',
  wave: 'sine',
  freq: [2400, 4200],
  slide: 1.3,
  duration: 0.08,
  gain: 0.1,
  count: [2, 4],
  spacing: 0.12,
} as const;

/**
 * Procedural ambience per area. Noise beds are heavily filtered, so their gain is the pre-filter
 * level (the audible RMS is far lower). Sum of layer gains per area must stay <= 1 (tested).
 */
export const AMBIENCE: Record<AreaKind, AmbienceDef> = {
  default: {
    layers: [
      { kind: 'bed', filter: 'lowpass', freq: 400, gain: 0.5, lfoRate: 0.08, lfoDepth: 0.6 },
    ],
  },
  forest: {
    layers: [
      { kind: 'bed', filter: 'lowpass', freq: 500, gain: 0.45, lfoRate: 0.07, lfoDepth: 0.6 },
      { kind: 'bed', filter: 'highpass', freq: 3500, gain: 0.05, lfoRate: 0.13, lfoDepth: 0.8 },
      { ...BIRD_HIGH, gap: [3, 9] },
      { ...BIRD_HIGH, freq: [1800, 2600], slide: 0.8, duration: 0.11, gap: [6, 16] },
    ],
  },
  lake: {
    layers: [
      {
        kind: 'bed',
        filter: 'bandpass',
        freq: 500,
        q: 0.7,
        gain: 0.5,
        lfoRate: 0.22,
        lfoDepth: 0.7,
      },
      { kind: 'bed', filter: 'lowpass', freq: 250, gain: 0.3, lfoRate: 0.1, lfoDepth: 0.5 },
      { ...BIRD_HIGH, gain: 0.08, gap: [10, 25] },
    ],
  },
  shore: {
    layers: [
      { kind: 'bed', filter: 'lowpass', freq: 800, gain: 0.7, lfoRate: 0.11, lfoDepth: 0.85 },
      { kind: 'bed', filter: 'highpass', freq: 4000, gain: 0.06, lfoRate: 0.11, lfoDepth: 0.9 },
      {
        kind: 'sparse',
        wave: 'sine',
        freq: [1400, 1900],
        slide: 0.7,
        duration: 0.35,
        gain: 0.08,
        count: [1, 2],
        spacing: 0.45,
        gap: [10, 25],
      },
    ],
  },
  village: {
    layers: [
      { kind: 'bed', filter: 'lowpass', freq: 350, gain: 0.3, lfoRate: 0.06, lfoDepth: 0.6 },
      {
        kind: 'bed',
        filter: 'bandpass',
        freq: 450,
        q: 0.8,
        gain: 0.3,
        lfoRate: 0.4,
        lfoDepth: 0.8,
      },
      {
        kind: 'sparse',
        wave: 'triangle',
        freq: [150, 320],
        slide: 0.8,
        duration: 0.05,
        gain: 0.15,
        count: [1, 3],
        spacing: 0.22,
        gap: [2, 6],
      },
      { ...BIRD_HIGH, gain: 0.06, gap: [8, 20] },
    ],
  },
};

const PENTATONIC = [0, 2, 4, 7, 9] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * Original generative pieces per area (scale walks over pad chords, loopable with variation).
 * A random piece is picked each loop and a quiet gap follows it.
 */
export const MUSIC: Record<AreaKind, MusicDef> = {
  default: {
    gapSeconds: [20, 50],
    pieces: [
      {
        root: 196,
        scale: PENTATONIC,
        bpm: 66,
        progression: [0, 3, 1, 4],
        padWave: 'sine',
        melodyWave: 'triangle',
        padGain: 0.08,
        melodyGain: 0.12,
        density: 0.3,
      },
    ],
  },
  village: {
    gapSeconds: [20, 45],
    pieces: [
      {
        root: 220,
        scale: MAJOR,
        bpm: 84,
        progression: [0, 3, 4, 0],
        padWave: 'triangle',
        melodyWave: 'triangle',
        padGain: 0.07,
        melodyGain: 0.13,
        density: 0.45,
      },
      {
        root: 247,
        scale: PENTATONIC,
        bpm: 72,
        progression: [0, 2, 3, 1, 0, 4],
        padWave: 'sine',
        melodyWave: 'sine',
        padGain: 0.08,
        melodyGain: 0.14,
        density: 0.4,
      },
    ],
  },
  forest: {
    gapSeconds: [25, 60],
    pieces: [
      {
        root: 165,
        scale: DORIAN,
        bpm: 58,
        progression: [0, 5, 3, 4],
        padWave: 'sine',
        melodyWave: 'sine',
        padGain: 0.09,
        melodyGain: 0.11,
        density: 0.28,
      },
      {
        root: 147,
        scale: PENTATONIC,
        bpm: 52,
        progression: [0, 3, 0, 4],
        padWave: 'sine',
        melodyWave: 'triangle',
        padGain: 0.09,
        melodyGain: 0.1,
        density: 0.22,
      },
    ],
  },
  lake: {
    gapSeconds: [25, 60],
    pieces: [
      {
        root: 175,
        scale: PENTATONIC,
        bpm: 54,
        progression: [0, 2, 4, 2],
        padWave: 'sine',
        melodyWave: 'sine',
        padGain: 0.09,
        melodyGain: 0.1,
        density: 0.25,
      },
    ],
  },
  shore: {
    gapSeconds: [25, 60],
    pieces: [
      {
        root: 233,
        scale: MAJOR,
        bpm: 62,
        progression: [0, 4, 5, 3],
        padWave: 'sine',
        melodyWave: 'triangle',
        padGain: 0.08,
        melodyGain: 0.11,
        density: 0.3,
      },
    ],
  },
};
