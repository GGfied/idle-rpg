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

/**
 * 'node' = the event's nodeId (or spotId); 'from' / 'to' = the tile index in the event's `from` / `to`
 * field on that node (fishing spotMoved), resolved by `VfxContext.tileWorld`.
 */
export type VfxAnchor = 'player' | 'node' | 'from' | 'to' | 'tile';

/** Event field values a cue can test. */
export type CueValue = string | number | boolean;

/**
 * Start or stop a long-running effect (a fire's smoke column) bound to the event field `keyField`
 * (e.g. `fireId`). Starting an already running key does nothing; stopping an unknown key does nothing.
 */
export interface PersistRef {
  action: 'start' | 'stop';
  keyField: string;
}

/** One thing to play when an event arrives. `effect` is a key of `EFFECTS`. */
export interface VfxCue {
  effect: string;
  /** Where to play it. 'node' falls back to the player when the node position is unknown. */
  at: VfxAnchor;
  /** Only play when every listed event field equals the value (e.g. `{ reason: 'noTool' }`). */
  when?: Readonly<Record<string, CueValue>>;
  /** Skip when any listed event field equals the value (e.g. rock depletion must not play tree dust). */
  unless?: Readonly<Record<string, CueValue>>;
  /** For `fire` effects: start/stop the effect bound to an event key instead of playing once. */
  persist?: PersistRef;
  /** Shift the 'node' anchor this many px toward the player (the face of the trunk that is struck). */
  towardPlayer?: number;
  /** Tint the effect with `ITEM_TINT[event[tintField]]` (e.g. ore colour from the gathered itemId). */
  tintField?: string;
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
  /** Additive blend (glows: sparks, embers, flares). */
  additive?: boolean;
  /** Starting alpha (default 1) for soft puffs. */
  alpha?: number;
  /** End scale (default 1.8 for round puffs, 0.6 for chips). */
  grow?: number;
  /** Constant sideways push in px (wind), added to the random spread. */
  drift?: number;
  /** Play this many times, `everyMs` apart (the first plays at once). */
  repeat?: { times: number; everyMs: number };
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

/**
 * A persistent effect bound to a key (a burning fire): one timer emits soft smoke puffs that drift, grow and
 * fade, and now and then an ember. Emission is capped per fire by `VfxLimits.fireParticles`.
 */
export interface FireEffect extends EffectBase {
  kind: 'fire';
  /** Decorative only: not played in 'reduced' mode. */
  decorative?: boolean;
  /** Emit interval in ms. */
  tickMs: number;
  /** Smoke sorts here (it rises above the tile); embers use `layer`. */
  smokeLayer: EffectLayer;
  /** Smoke starts this many px above the feet point. */
  smokeLift: number;
  smoke: {
    colors: readonly number[];
    size: readonly [number, number];
    /** Upward travel in px over the puff's life. */
    rise: number;
    /** Steady wind push in px, plus a random sway of up to `sway` px either way. */
    drift: number;
    sway: number;
    lifeMs: number;
    alpha: number;
    /** End scale. */
    grow: number;
  };
  /** Chance per tick of one ember. */
  emberChance: number;
  ember: {
    colors: readonly number[];
    size: readonly [number, number];
    rise: number;
    sway: number;
    lifeMs: number;
  };
}

export type EffectDef =
  | BurstEffect
  | RingEffect
  | XpDropEffect
  | MarkerEffect
  | CrossEffect
  | BlockedTextEffect
  | FireEffect;

/** Minimal event shape the runner reads. */
export interface VfxEvent {
  type: string;
  [key: string]: unknown;
}

export interface VfxContext {
  playerWorld: { x: number; y: number };
  nodeWorld?: (nodeId: string) => { x: number; y: number } | undefined;
  /** Feet world px of tile `index` of a node's tile list (fishing spots hop between tiles). */
  tileWorld?: (nodeId: string, index: number) => { x: number; y: number } | undefined;
}

export interface VfxLimits {
  texts: number;
  particles: number;
  /** Fires that smoke at once (the oldest stops when exceeded). */
  fires: number;
  /** Live smoke + ember particles one fire may have. */
  fireParticles: number;
  rings: number;
  markers: number;
}
