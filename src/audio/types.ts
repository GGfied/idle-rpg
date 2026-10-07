export type SoundId =
  | 'chop'
  | 'logGained'
  | 'treeFall'
  | 'levelUp'
  | 'inventoryFull'
  | 'error'
  | 'uiClick'
  | 'itemDrop'
  | 'walkClick';

/** One synthesized layer: an oscillator sweep or a (filtered) noise burst. */
export interface SoundLayer {
  kind: 'tone' | 'noise';
  wave?: OscillatorType;
  /** Start and end frequency in Hz (tone) or filter centre (noise). */
  from: number;
  to?: number;
  /** Seconds. */
  duration: number;
  delay?: number;
  gain: number;
  filter?: BiquadFilterType;
}

export type Channel = 'sfx' | 'ui';
/** Every bus that feeds the master gain. */
export type BusChannel = Channel | 'music' | 'ambience';
export type VolumeChannel = 'master' | BusChannel;
export interface Volumes {
  master: number;
  sfx: number;
  ui: number;
  music: number;
  ambience: number;
}

/** Kinds of area the world reports (`map`'s areaAt). Unknown kinds should be passed as 'default'. */
export type AreaKind = 'village' | 'forest' | 'lake' | 'shore' | 'default';

/** One scheduled synth note; `at` is seconds after the scheduling origin. */
export interface Note {
  at: number;
  freq: number;
  /** If set, the pitch glides to this over the note. */
  endFreq?: number;
  duration: number;
  gain: number;
  wave: OscillatorType;
  /** Attack seconds; defaults to a few ms. */
  attack?: number;
}

/** A continuous looping filtered-noise layer, optionally swelled by a slow LFO (wind, waves). */
export interface AmbienceBed {
  kind: 'bed';
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
  /** LFO rate in Hz and depth 0..1 (fraction of `gain` that swings). */
  lfoRate?: number;
  lfoDepth?: number;
}

/** Sparse one-shot clusters at random times (bird chirps, village taps). */
export interface AmbienceSparse {
  kind: 'sparse';
  wave: OscillatorType;
  /** Start frequency range in Hz. */
  freq: readonly [number, number];
  /** End frequency = start x slide (default: flat). */
  slide?: number;
  duration: number;
  gain: number;
  /** Notes per cluster (inclusive range) and seconds between notes in a cluster. */
  count: readonly [number, number];
  spacing: number;
  /** Seconds between clusters (range). */
  gap: readonly [number, number];
}

export type AmbienceLayer = AmbienceBed | AmbienceSparse;
export interface AmbienceDef {
  layers: readonly AmbienceLayer[];
}

/** A short generative piece: pad chords under a scale-walk melody. */
export interface MusicPiece {
  /** Pad root in Hz; the melody sits an octave above. */
  root: number;
  /** Semitone offsets of the scale. */
  scale: readonly number[];
  bpm: number;
  /** Scale degree of the chord root for each bar; its length is the piece length in bars. */
  progression: readonly number[];
  padWave: OscillatorType;
  melodyWave: OscillatorType;
  padGain: number;
  melodyGain: number;
  /** Chance 0..1 that an eighth-note step plays a melody note. */
  density: number;
}
export interface MusicDef {
  pieces: readonly MusicPiece[];
  /** Silence in seconds between pieces (range). */
  gapSeconds: readonly [number, number];
}

/** A crossfadable group of nodes for one area (ambience or music). */
export interface Scene {
  gain: GainNode;
  /** Schedules whatever falls before `horizon` (audio-clock seconds). */
  tick(now: number, horizon: number): void;
  /** Stops sources at audio time `at`. */
  stop(at: number): void;
  /** Disconnects every node; call after the fade-out has finished. */
  dispose(): void;
}

export interface SoundDef {
  /** Mix channel; effective gain = master x channel x layer gain. */
  channel: Channel;
  layers: readonly SoundLayer[];
  /** Pitch is multiplied by 1 ± pitchVariance so repeats don't fatigue. */
  pitchVariance?: number;
  /** Minimum ms between two plays of this sound. Defaults to DEFAULT_MIN_GAP_MS. */
  minGapMs?: number;
}

/** A game event (matches the engine bus shape without importing it). */
export interface AudioEvent {
  type: string;
  [key: string]: unknown;
}

export interface EventSoundEntry {
  type: string;
  /** If set, the event's `reason` field must equal this. */
  reason?: string;
  sounds: readonly SoundId[];
}

export interface AudioOptions {
  /** Injected for tests; defaults to `new AudioContext()` when available. */
  createContext?: () => AudioContext;
  now?: () => number;
  random?: () => number;
  /** Legacy single volume (= master). Ignored for keys present in initialVolumes. */
  initialVolume?: number;
  initialVolumes?: Partial<Volumes>;
  initialMuted?: boolean;
  /** Called after volume or mute changes so the integrator can persist. */
  onSettingsChange?: (settings: { muted: boolean; volumes: Volumes }) => void;
}

export interface AudioSystem {
  play(id: SoundId): void;
  handleEvent(event: AudioEvent): void;
  unlock(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Aliases for the master channel. */
  setVolume(volume: number): void;
  getVolume(): number;
  setChannelVolume(channel: VolumeChannel, volume: number): void;
  getVolumes(): Volumes;
  startLoop(id: SoundId, intervalMs: number): void;
  stopLoop(id: SoundId): void;
  /** Crossfades ambience and music to the area. Same area is a no-op; before unlock it is remembered. */
  setArea(area: AreaKind): void;
  /** Suspends the context (hidden tab). unlock() resumes it. */
  suspend(): void;
  dispose(): void;
}
