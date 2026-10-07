/**
 * Where an effect sorts: 'ground' = flat on the tile (under whatever stands on it), 'world' = in the
 * scene at the tile (just in front of what stands on it), 'overhead' = above everything in the world (LAYERS.VFX).
 */
export type EffectLayer = 'ground' | 'world' | 'overhead';

/** Fields every effect has. `lift` = px above the feet point where it plays. */
export interface EffectBase {
  layer: EffectLayer;
  lift?: number;
}

export type VfxAnchor = 'player' | 'node';

/** One thing to play when an event arrives. `effect` is a key of `EFFECTS`. */
export interface VfxCue {
  effect: string;
  /** Where to play it. 'node' falls back to the player when the node position is unknown. */
  at: VfxAnchor;
  /** Only play when every listed event field equals the value (e.g. `{ reason: 'noTool' }`). */
  when?: Readonly<Record<string, string>>;
  /** Drop repeats of this cue (same effect + same `when`) within this many ms. */
  throttleMs?: number;
}

/** Label for a blocked action; `withField` is used instead of `text` when the event carries that field. */
export interface BlockedLabel {
  text: string;
  withField?: { field: string; text: string };
}

/** Effect playback mode: 'reduced' keeps information-bearing effects, shrunk; 'off' plays nothing. */
export type VfxMode = 'on' | 'reduced' | 'off';

export interface VfxOptions {
  mode: VfxMode;
  /** false suppresses XP drops only (the notifications setting). */
  xpDrops: boolean;
}

export interface BurstEffect extends EffectBase {
  kind: 'burst';
  /** Decorative only: dropped in 'reduced' mode. */
  decorative?: boolean;
  count: number;
  colors: readonly number[];
  /** Square particle size in px (min, max). */
  size: readonly [number, number];
  /** Horizontal travel in px (max, either direction). */
  spread: number;
  /** Initial upward travel in px before gravity pulls it down. */
  rise: number;
  /** Final downward drop in px relative to the start. */
  fall: number;
  lifeMs: number;
  /** Round puff (Arc) instead of square chip. */
  round?: boolean;
  /** Start spread, so a burst is not a single point. */
  jitter: number;
}

export interface RingEffect extends EffectBase {
  kind: 'ring';
  color: number;
  /** Vertical squash (0.5 = flat on an iso ground plane). */
  squashY?: number;
  radius: readonly [number, number];
  width: number;
  lifeMs: number;
}

export interface XpDropEffect extends EffectBase {
  kind: 'xpDrop';
  riseY: number;
  lifeMs: number;
  fontPx: number;
  defaultColor: string;
}

export interface MarkerEffect extends EffectBase {
  kind: 'marker';
  /** Colour per marker kind. */
  colors: Readonly<Record<MarkerKind, number>>;
  /** Diamond half-extents in px (the iso tile is 64x32, so 32 x 16). */
  halfW: number;
  halfH: number;
  lifeMs: number;
}

export type MarkerKind = 'walk' | 'interact';

/** Short pop-and-fade cross (reuses the marker pool). */
export interface CrossEffect extends EffectBase {
  kind: 'cross';
  color: number;
  half: number;
  fromScale: number;
  toScale: number;
  lifeMs: number;
}

/** Floating label above the player that jitters left-right (the "head shake"). */
export interface BlockedTextEffect extends EffectBase {
  kind: 'blockedText';
  color: string;
  fontPx: number;
  riseY: number;
  lifeMs: number;
  shakePx: number;
  shakeMs: number;
  /** How many left-right swings. */
  shakes: number;
}

export type EffectDef =
  BurstEffect | RingEffect | XpDropEffect | MarkerEffect | CrossEffect | BlockedTextEffect;

/** Minimal event shape the runner reads. */
export interface VfxEvent {
  type: string;
  [key: string]: unknown;
}

export interface VfxContext {
  playerWorld: { x: number; y: number };
  nodeWorld?: (nodeId: string) => { x: number; y: number } | undefined;
}

export interface VfxLimits {
  texts: number;
  particles: number;
  rings: number;
  markers: number;
}
