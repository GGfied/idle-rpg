import {
  AMBIENCE,
  AMBIENCE_FADE_S,
  AMBIENCE_NOISE_S,
  DEFAULT_VOLUMES,
  MASTER_CEILING,
  MUSIC,
  MUSIC_FADE_S,
  SCHEDULER_LOOKAHEAD_S,
  SCHEDULER_TICK_MS,
  SOUND_DEFS,
} from './data';
import { createAmbienceScene } from './ambience';
import { createMusicScene } from './music';
import { clampVolume, createThrottle, resolveEventSounds } from './logic';
import type {
  AudioEvent,
  AudioOptions,
  AreaKind,
  AudioSystem,
  BusChannel,
  SoundId,
  Scene,
  SoundLayer,
  VolumeChannel,
  Volumes,
} from './types';

function defaultContext(): AudioContext {
  return new AudioContext();
}

function webAudioAvailable(): boolean {
  return typeof globalThis !== 'undefined' && 'AudioContext' in globalThis;
}

const BUSES = ['sfx', 'ui', 'music', 'ambience'] as const;

function makeNoise(ctx: AudioContext, seconds = 0.25): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function renderLayer(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  layer: SoundLayer,
  pitch: number,
  level = 1,
): void {
  const start = ctx.currentTime + (layer.delay ?? 0);
  const end = start + layer.duration;
  const gain = ctx.createGain();
  // Fast attack, exponential-ish decay: no clicks.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(layer.gain * level, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(out);

  if (layer.kind === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = layer.wave ?? 'sine';
    osc.frequency.setValueAtTime(layer.from * pitch, start);
    if (layer.to !== undefined) osc.frequency.exponentialRampToValueAtTime(layer.to * pitch, end);
    osc.connect(gain);
    osc.start(start);
    osc.stop(end + 0.02);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = layer.filter ?? 'bandpass';
  filter.frequency.value = layer.from * pitch;
  src.connect(filter);
  filter.connect(gain);
  src.start(start);
  src.stop(end + 0.02);
}

/** Creates the audio system. Every method is a safe no-op until unlock() and never throws. */
export function createAudio(options: AudioOptions = {}): AudioSystem {
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const throttle = createThrottle(now);
  const volumes: Volumes = {
    master: clampVolume(
      options.initialVolumes?.master ?? options.initialVolume ?? DEFAULT_VOLUMES.master,
    ),
    sfx: clampVolume(options.initialVolumes?.sfx ?? DEFAULT_VOLUMES.sfx),
    ui: clampVolume(options.initialVolumes?.ui ?? DEFAULT_VOLUMES.ui),
    music: clampVolume(options.initialVolumes?.music ?? DEFAULT_VOLUMES.music),
    ambience: clampVolume(options.initialVolumes?.ambience ?? DEFAULT_VOLUMES.ambience),
  };
  let muted = options.initialMuted ?? false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buses: Partial<Record<BusChannel, GainNode>> = {};
  let noise: AudioBuffer | null = null;
  let longNoise: AudioBuffer | null = null;
  // Area state: `wantedArea` is what the world reported; scenes exist only while unlocked.
  let wantedArea: AreaKind | null = null;
  let activeArea: AreaKind | null = null;
  let ambienceScene: Scene | null = null;
  let musicScene: Scene | null = null;
  let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  const fading = new Set<ReturnType<typeof setTimeout>>();
  const loops = new Map<SoundId, ReturnType<typeof setInterval>>();

  const masterLevel = () => (muted ? 0 : volumes.master * MASTER_CEILING);
  const notify = () => options.onSettingsChange?.({ muted, volumes: { ...volumes } });

  function play(id: SoundId): void {
    try {
      const def = SOUND_DEFS[id];
      const bus = buses[def.channel];
      if (!ctx || !master || !noise || !bus || muted) return;
      if (volumes.master === 0 || volumes[def.channel] === 0) return;
      if (ctx.state === 'suspended') void ctx.resume();
      if (!throttle.allow(id)) return;
      const pitch = 1 + (random() * 2 - 1) * (def.pitchVariance ?? 0);
      const pool = def.variants ? [def.layers, ...def.variants] : [def.layers];
      const layers =
        pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? def.layers;
      const level = 1 - random() * (def.gainVariance ?? 0);
      for (const layer of layers) renderLayer(ctx, bus, noise, layer, pitch, level);
    } catch {
      // Audio must never break the game.
    }
  }

  function unlock(): void {
    try {
      if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume();
        return;
      }
      if (!options.createContext && !webAudioAvailable()) return;
      ctx = (options.createContext ?? defaultContext)();
      master = ctx.createGain();
      master.gain.value = masterLevel();
      // master -> limiter -> destination; channel buses feed master.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      for (const ch of BUSES) {
        const bus = ctx.createGain();
        bus.gain.value = volumes[ch];
        bus.connect(master);
        buses[ch] = bus;
      }
      noise = makeNoise(ctx);
      if (ctx.state === 'suspended') void ctx.resume();
      if (wantedArea) startArea(wantedArea);
    } catch {
      teardown();
    }
  }

  function applyMaster(): void {
    try {
      if (master) master.gain.value = masterLevel();
      for (const ch of BUSES) {
        const bus = buses[ch];
        if (bus) bus.gain.value = volumes[ch];
      }
    } catch {
      // ignore
    }
  }

  function teardown(): void {
    if (schedulerTimer !== null) clearTimeout(schedulerTimer);
    schedulerTimer = null;
    for (const t of fading) clearTimeout(t);
    fading.clear();
    ambienceScene = musicScene = null;
    activeArea = null;
    ctx = master = noise = longNoise = null;
    for (const ch of BUSES) delete buses[ch];
  }

  /** Lookahead scheduler: wakes every SCHEDULER_TICK_MS and schedules on the audio clock. */
  function schedule(): void {
    schedulerTimer = null;
    try {
      if (!ctx || !activeArea) return;
      if (ctx.state === 'running' && !muted) {
        const now = ctx.currentTime;
        ambienceScene?.tick(now, now + SCHEDULER_LOOKAHEAD_S);
        musicScene?.tick(now, now + SCHEDULER_LOOKAHEAD_S);
      }
    } catch {
      // ignore
    }
    schedulerTimer = setTimeout(schedule, SCHEDULER_TICK_MS);
  }

  function fadeTo(scene: Scene, target: number, seconds: number): void {
    const p = scene.gain.gain;
    const t = ctx?.currentTime ?? 0;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(target, t + seconds);
  }

  function retire(scene: Scene | null, seconds: number): void {
    if (!scene || !ctx) return;
    fadeTo(scene, 0, seconds);
    scene.stop(ctx.currentTime + seconds + 0.05);
    const timer = setTimeout(
      () => {
        fading.delete(timer);
        try {
          scene.dispose();
        } catch {
          // ignore
        }
      },
      seconds * 1000 + 100,
    );
    fading.add(timer);
  }

  function startArea(area: AreaKind): void {
    const c = ctx;
    const amb = buses.ambience;
    const mus = buses.music;
    if (!c || !amb || !mus) return;
    if (!longNoise) longNoise = makeNoise(c, AMBIENCE_NOISE_S);
    retire(ambienceScene, AMBIENCE_FADE_S);
    retire(musicScene, MUSIC_FADE_S);
    ambienceScene = createAmbienceScene(c, amb, longNoise, AMBIENCE[area], random);
    musicScene = createMusicScene(c, mus, MUSIC[area], random);
    fadeTo(ambienceScene, 1, AMBIENCE_FADE_S);
    fadeTo(musicScene, 1, MUSIC_FADE_S);
    activeArea = area;
    if (schedulerTimer === null) schedule();
  }

  function setArea(area: AreaKind): void {
    try {
      if (!(area in AMBIENCE)) area = 'default';
      if (area === wantedArea) return;
      wantedArea = area;
      if (ctx) startArea(area);
    } catch {
      // Audio must never break the game.
    }
  }

  function stopLoop(id: SoundId): void {
    const timer = loops.get(id);
    if (timer !== undefined) clearInterval(timer);
    loops.delete(id);
  }

  function setChannelVolume(channel: VolumeChannel, v: number): void {
    if (!(channel in volumes)) return;
    volumes[channel] = clampVolume(v);
    applyMaster();
    notify();
  }

  return {
    play,
    unlock,
    handleEvent(event: AudioEvent): void {
      for (const id of resolveEventSounds(event)) play(id);
    },
    setMuted(m: boolean): void {
      muted = m;
      applyMaster();
      notify();
    },
    isMuted: () => muted,
    setVolume: (v: number) => setChannelVolume('master', v),
    getVolume: () => volumes.master,
    setChannelVolume,
    getVolumes: () => ({ ...volumes }),
    startLoop(id: SoundId, intervalMs: number): void {
      stopLoop(id);
      if (!(intervalMs > 0)) return;
      loops.set(
        id,
        setInterval(() => play(id), intervalMs),
      );
    },
    stopLoop,
    setArea,
    suspend(): void {
      try {
        void ctx?.suspend();
      } catch {
        // ignore
      }
    },
    dispose(): void {
      for (const id of [...loops.keys()]) stopLoop(id);
      try {
        void ctx?.close();
      } catch {
        // ignore
      }
      teardown();
    },
  };
}
