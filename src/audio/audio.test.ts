import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AMBIENCE,
  AMBIENCE_FADE_S,
  DEFAULT_VOLUMES,
  EVENT_SOUNDS,
  MASTER_CEILING,
  MUSIC,
  MUSIC_FADE_S,
  SOUND_DEFS,
} from './data';
import { createAudio } from './index';
import { barSeconds, degreeFreq, migrateSettings, planBar, resolveEventSounds } from './logic';
import { createMusicScene } from './music';
import type { AreaKind, SoundId } from './types';

function fakeContext() {
  const starts: number[] = [];
  const gainNodes: {
    gain: ReturnType<typeof param>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const disconnects: ReturnType<typeof vi.fn>[] = [];
  const peaks: number[] = [];
  const layerTargets: unknown[] = [];
  function param() {
    return {
      value: 0,
      setValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn((v: number) => void peaks.push(v)),
      exponentialRampToValueAtTime: vi.fn(),
    };
  }
  const dc = () => {
    const d = vi.fn();
    disconnects.push(d);
    return d;
  };
  const node = () => ({
    connect: vi.fn(),
    disconnect: dc(),
    start: (t: number) => starts.push(t),
    stop: vi.fn(),
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => {}),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    createBuffer: () => ({ duration: 3, getChannelData: () => new Float32Array(10) }),
    // Creation order: master, sfx, ui, music, ambience buses, then one per layer/scene.
    createGain: () => {
      const n = gainNodes.length;
      const g = {
        disconnect: dc(),
        gain: n < 5 ? { ...param(), value: 1 } : param(),
        connect: vi.fn((target: unknown) => {
          if (n >= 5) layerTargets.push(target);
        }),
      };
      gainNodes.push(g);
      return g;
    },
    createDynamicsCompressor: () => ({
      connect: vi.fn(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    }),
    createOscillator: () => ({ ...node(), type: 'sine', frequency: param() }),
    createBufferSource: () => ({ ...node(), buffer: null }),
    createBiquadFilter: () => ({
      connect: vi.fn(),
      disconnect: dc(),
      type: 'bandpass',
      frequency: { value: 0 },
      Q: { value: 0 },
    }),
  };
  return {
    ctx,
    starts,
    layerTargets,
    disconnects,
    peaks,
    gainNodes,
    get masterGain() {
      return gainNodes[0]!.gain;
    },
    get sfxBus() {
      return gainNodes[1]!;
    },
    get uiBus() {
      return gainNodes[2]!;
    },
    get musicBus() {
      return gainNodes[3]!;
    },
    get ambienceBus() {
      return gainNodes[4]!;
    },
  };
}

function setup(opts: Parameters<typeof createAudio>[0] = {}) {
  const f = fakeContext();
  let t = 1000;
  const audio = createAudio({
    createContext: () => f.ctx as unknown as AudioContext,
    now: () => t,
    random: () => 0.5,
    ...opts,
  });
  return { audio, f, advance: (ms: number) => (t += ms) };
}

afterEach(() => vi.useRealTimers());

describe('EVENT_SOUNDS mapping', () => {
  const cases: [Record<string, unknown> & { type: string }, SoundId[]][] = [
    [{ type: 'swingImpact' }, ['axeHit']],
    [{ type: 'gatherStarted' }, []],
    [{ type: 'itemGathered' }, ['logGained']],
    [{ type: 'nodeDepleted' }, ['treeFall']],
    [{ type: 'levelUp' }, ['levelUp']],
    [{ type: 'gatherStopped', reason: 'inventoryFull' }, ['inventoryFull']],
    [{ type: 'gatherStopped', reason: 'levelTooLow' }, ['error']],
    [{ type: 'gatherStopped', reason: 'noTool' }, ['error']],
    [{ type: 'gatherStopped', reason: 'depleted' }, []],
    [{ type: 'gatherStopped', reason: 'cancelled' }, []],
    [{ type: 'xpGained' }, []],
    [{ type: 'entityMoved' }, []],
    [{ type: 'somethingUnknown' }, []],
  ];
  it.each(cases)('%j -> %j', (event, expected) => {
    expect(resolveEventSounds(event)).toEqual(expected);
  });

  it('every mapped sound has a definition', () => {
    for (const e of EVENT_SOUNDS) for (const s of e.sounds) expect(SOUND_DEFS[s]).toBeDefined();
  });
});

describe('createAudio', () => {
  it('is a silent no-op before unlock', () => {
    const { audio, f } = setup();
    audio.play('axeHit');
    audio.handleEvent({ type: 'levelUp' });
    expect(f.starts).toHaveLength(0);
  });

  it('plays after unlock and resumes the context', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.play('uiClick');
    expect(f.ctx.resume).toHaveBeenCalled();
    expect(f.starts.length).toBeGreaterThan(0);
  });

  it('handleEvent plays every sound of a mapped event, nothing for depleted', () => {
    const { audio, f } = setup({ random: () => 0 });
    audio.unlock();
    audio.handleEvent({ type: 'gatherStopped', reason: 'depleted' });
    expect(f.starts).toHaveLength(0);
    audio.handleEvent({ type: 'itemGathered' });
    const layers = SOUND_DEFS.logGained.layers.length;
    expect(f.starts).toHaveLength(layers);
  });

  it('throttles identical sounds inside the minimum gap', () => {
    const { audio, f, advance } = setup();
    audio.unlock();
    audio.play('axeHit');
    const first = f.starts.length;
    audio.play('axeHit');
    expect(f.starts).toHaveLength(first);
    advance(151);
    audio.play('axeHit');
    expect(f.starts).toHaveLength(first * 2);
  });

  it('does nothing while muted and applies volume to the master gain', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.setMuted(true);
    audio.play('uiClick');
    expect(f.starts).toHaveLength(0);
    expect(f.masterGain.value).toBe(0);
    audio.setMuted(false);
    audio.setVolume(2);
    expect(audio.getVolume()).toBe(1);
    expect(f.masterGain.value).toBeGreaterThan(0);
  });

  it('reports settings changes and defaults master to 0.7', () => {
    const onSettingsChange = vi.fn();
    const { audio } = setup({ onSettingsChange });
    expect(audio.getVolume()).toBe(0.7);
    audio.setMuted(true);
    expect(onSettingsChange).toHaveBeenCalledWith({
      muted: true,
      volumes: { master: 0.7, sfx: 1, ui: 1, music: 0.6, ambience: 0.8 },
    });
  });

  it('never throws when Web Audio is unavailable or broken', () => {
    const audio = createAudio({
      createContext: () => {
        throw new Error('no audio');
      },
    });
    expect(() => {
      audio.unlock();
      audio.play('axeHit');
      audio.handleEvent({ type: 'levelUp' });
    }).not.toThrow();
  });

  it('loops play on an interval until stopped', () => {
    vi.useFakeTimers();
    const { audio, f, advance } = setup({ random: () => 0 });
    audio.unlock();
    audio.startLoop('axeHit', 100);
    const per = SOUND_DEFS.axeHit.layers.length;
    advance(100);
    vi.advanceTimersByTime(100);
    expect(f.starts).toHaveLength(per);
    audio.stopLoop('axeHit');
    advance(100);
    vi.advanceTimersByTime(300);
    expect(f.starts).toHaveLength(per);
  });
});

describe('channels and volume maths', () => {
  it('master gain = master x ceiling; channel buses carry the channel volume', () => {
    const { audio, f } = setup({ initialVolumes: { master: 0.5, sfx: 0.4, ui: 0.2 } });
    audio.unlock();
    expect(f.masterGain.value).toBeCloseTo(0.5 * MASTER_CEILING);
    expect(f.sfxBus.gain.value).toBe(0.4);
    expect(f.uiBus.gain.value).toBe(0.2);
    audio.setChannelVolume('sfx', 0.9);
    expect(f.sfxBus.gain.value).toBe(0.9);
    expect(audio.getVolumes()).toEqual({
      master: 0.5,
      sfx: 0.9,
      ui: 0.2,
      music: 0.6,
      ambience: 0.8,
    });
  });

  it('routes each sound to its channel bus', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.play('uiClick');
    expect(f.layerTargets.every((x) => x === f.uiBus)).toBe(true);
    f.layerTargets.length = 0;
    audio.play('axeHit');
    expect(f.layerTargets.length).toBeGreaterThan(0);
    expect(f.layerTargets.every((x) => x === f.sfxBus)).toBe(true);
  });

  it('clamps volumes to 0..1 and treats NaN as 0', () => {
    const { audio } = setup();
    audio.setChannelVolume('sfx', 5);
    audio.setChannelVolume('ui', -3);
    audio.setChannelVolume('master', Number.NaN);
    expect(audio.getVolumes()).toEqual({
      master: 0,
      sfx: 1,
      ui: 0,
      music: 0.6,
      ambience: 0.8,
    });
  });

  it('ui at 0 silences uiClick but not chop', () => {
    const { audio, f, advance } = setup();
    audio.unlock();
    audio.setChannelVolume('ui', 0);
    audio.play('uiClick');
    expect(f.starts).toHaveLength(0);
    advance(100);
    audio.play('axeHit');
    expect(f.starts.length).toBeGreaterThan(0);
  });

  it('mute overrides every channel; unmute restores', () => {
    const { audio, f } = setup({ initialVolumes: { master: 1, sfx: 1, ui: 1 } });
    audio.unlock();
    audio.setMuted(true);
    audio.play('axeHit');
    audio.play('uiClick');
    expect(f.starts).toHaveLength(0);
    expect(f.masterGain.value).toBe(0);
    audio.setMuted(false);
    expect(f.masterGain.value).toBeCloseTo(MASTER_CEILING);
  });

  it('migrates the old {volume, muted} shape', () => {
    const saved = { volume: 0.4, muted: true };
    const m = migrateSettings(saved);
    expect(m).toEqual({ muted: true, volumes: { master: 0.4 } });
    const { audio } = setup({ initialVolume: 0.4, initialMuted: true });
    expect(audio.getVolumes()).toEqual({
      master: 0.4,
      sfx: 1,
      ui: 1,
      music: 0.6,
      ambience: 0.8,
    });
    expect(audio.isMuted()).toBe(true);
    expect(migrateSettings({ volumes: { sfx: 2, ui: 'x' } }).volumes).toEqual({ sfx: 1 });
    expect(migrateSettings(null)).toEqual({ muted: undefined, volumes: {} });
  });

  it('initialVolumes beats legacy initialVolume; setVolume aliases master', () => {
    const { audio } = setup({ initialVolume: 0.1, initialVolumes: { master: 0.9 } });
    expect(audio.getVolume()).toBe(0.9);
    audio.setVolume(0.3);
    expect(audio.getVolumes().master).toBe(0.3);
  });

  it('play(logGained) works for a Test sound button', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.play('logGained');
    expect(f.starts.length).toBe(SOUND_DEFS.logGained.layers.length);
  });

  it('worst-case overlapping layer gain x ceiling never exceeds 1 at the destination', () => {
    for (const [id, def] of Object.entries(SOUND_DEFS)) {
      for (const layers of [def.layers, ...(def.variants ?? [])]) {
        const events = layers.map((l) => ({ s: l.delay ?? 0, e: (l.delay ?? 0) + l.duration }));
        let peak = 0;
        for (const { s } of events) {
          const sum = layers.reduce(
            (a, l, i) => (events[i]!.s <= s && s < events[i]!.e ? a + l.gain : a),
            0,
          );
          peak = Math.max(peak, sum);
        }
        expect(peak * MASTER_CEILING * 1 * 1, id).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('axe impact and log sounds', () => {
  const variantCount = 1 + (SOUND_DEFS.axeHit.variants?.length ?? 0);

  it('has at least 3 alternates and a log sound distinct from levelUp', () => {
    expect(variantCount).toBeGreaterThanOrEqual(3);
    expect(SOUND_DEFS.logGained.layers).not.toEqual(SOUND_DEFS.levelUp.layers);
    expect(SOUND_DEFS.logGained.layers.every((l) => l.wave !== 'square')).toBe(true);
  });

  it('picks a different variant across the random range', () => {
    const shapes = new Set<string>();
    for (let i = 0; i < variantCount; i++) {
      const { audio, f } = setup({ random: () => (i + 0.5) / variantCount });
      audio.unlock();
      audio.handleEvent({ type: 'swingImpact' });
      shapes.add(f.peaks.join(','));
      expect(f.starts.length).toBeGreaterThan(0);
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('jitters gain downward only and varies pitch', () => {
    const lo = setup({ random: () => 0.999 });
    lo.audio.unlock();
    lo.audio.play('axeHit');
    const hi = setup({ random: () => 0 });
    hi.audio.unlock();
    hi.audio.play('axeHit');
    const peak = (f: typeof lo.f) => Math.max(...f.peaks);
    expect(peak(lo.f)).toBeLessThan(peak(hi.f));
    expect(peak(hi.f)).toBeLessThanOrEqual(0.75);
  });

  it('does not machine-gun: ten swing impacts in one tick play once', () => {
    const { audio, f } = setup({ random: () => 0 });
    audio.unlock();
    for (let i = 0; i < 10; i++) audio.handleEvent({ type: 'swingImpact' });
    expect(f.starts).toHaveLength(SOUND_DEFS.axeHit.layers.length);
  });

  it('plays nothing while muted or with the sfx channel at 0', () => {
    const m = setup({ initialMuted: true });
    m.audio.unlock();
    m.audio.handleEvent({ type: 'swingImpact' });
    expect(m.f.starts).toHaveLength(0);
    const z = setup({ initialVolumes: { sfx: 0 } });
    z.audio.unlock();
    z.audio.handleEvent({ type: 'swingImpact' });
    expect(z.f.starts).toHaveLength(0);
  });
});

describe('music and ambience channels', () => {
  it('defaults music 0.6 / ambience 0.8 and routes them through buses under the master', () => {
    const { audio, f } = setup({ initialVolumes: { master: 0.5, music: 0.3, ambience: 0.4 } });
    expect(DEFAULT_VOLUMES.music).toBe(0.6);
    expect(DEFAULT_VOLUMES.ambience).toBe(0.8);
    audio.unlock();
    expect(f.musicBus.gain.value).toBe(0.3);
    expect(f.ambienceBus.gain.value).toBe(0.4);
    expect(f.musicBus.connect).toHaveBeenCalledWith(f.gainNodes[0]);
    expect(f.ambienceBus.connect).toHaveBeenCalledWith(f.gainNodes[0]);
    audio.setChannelVolume('music', 2);
    audio.setChannelVolume('ambience', -1);
    expect(f.musicBus.gain.value).toBe(1);
    expect(f.ambienceBus.gain.value).toBe(0);
    expect(f.masterGain.value).toBeCloseTo(0.5 * MASTER_CEILING);
  });

  it('mute zeroes the master gain that both new buses feed', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.setMuted(true);
    expect(f.masterGain.value).toBe(0);
  });

  it('migrates saved music/ambience volumes', () => {
    expect(migrateSettings({ volumes: { music: 0.2, ambience: 9 } }).volumes).toEqual({
      music: 0.2,
      ambience: 1,
    });
  });
});

describe('setArea', () => {
  const sceneGains = (f: ReturnType<typeof fakeContext>, bus: unknown) =>
    f.gainNodes.filter((g) => g.connect.mock.calls.some((c) => c[0] === bus));

  it('remembers the area before unlock and starts it on unlock', () => {
    const { audio, f } = setup();
    audio.setArea('forest');
    expect(f.gainNodes).toHaveLength(0);
    audio.unlock();
    const [amb] = sceneGains(f, f.ambienceBus);
    const [mus] = sceneGains(f, f.musicBus);
    expect(amb!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, AMBIENCE_FADE_S);
    expect(mus!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, MUSIC_FADE_S);
  });

  it('same area is a no-op', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.setArea('lake');
    const count = f.gainNodes.length;
    audio.setArea('lake');
    expect(f.gainNodes).toHaveLength(count);
  });

  it('crossfades ambience over 1.5 s and music over 3 s, disconnecting old layers after', () => {
    vi.useFakeTimers();
    const { audio, f } = setup();
    audio.unlock();
    audio.setArea('forest');
    const [oldAmb] = sceneGains(f, f.ambienceBus);
    const [oldMus] = sceneGains(f, f.musicBus);
    f.ctx.currentTime = 10;
    audio.setArea('shore');
    expect(oldAmb!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 10 + AMBIENCE_FADE_S);
    expect(oldMus!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 10 + MUSIC_FADE_S);
    const [, newAmb] = sceneGains(f, f.ambienceBus);
    expect(newAmb!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 10 + AMBIENCE_FADE_S);
    expect(oldAmb!.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AMBIENCE_FADE_S * 1000 + 150);
    expect(oldAmb!.disconnect).toHaveBeenCalled();
    expect(oldMus!.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime((MUSIC_FADE_S - AMBIENCE_FADE_S) * 1000);
    expect(oldMus!.disconnect).toHaveBeenCalled();
    expect(newAmb!.disconnect).not.toHaveBeenCalled();
  });

  it('schedules ambience and music notes ahead, but nothing while muted', async () => {
    vi.useFakeTimers();
    const { audio, f } = setup({ random: () => 0.1 });
    audio.setArea('forest');
    audio.unlock();
    await Promise.resolve();
    const beforeTick = f.starts.length;
    f.ctx.currentTime = 5;
    vi.advanceTimersByTime(250);
    expect(f.starts.length).toBeGreaterThan(beforeTick);
    audio.setMuted(true);
    f.ctx.currentTime = 100;
    const muted = f.starts.length;
    vi.advanceTimersByTime(1000);
    expect(f.starts).toHaveLength(muted);
  });

  it('keeps every scheduled gain <= 1 and the worst-case sums under the ceiling', () => {
    vi.useFakeTimers();
    const kinds = Object.keys(AMBIENCE) as AreaKind[];
    for (const kind of kinds) {
      const { audio, f } = setup({ random: () => 0.1 });
      audio.unlock();
      audio.setArea(kind);
      for (let t = 0; t < 40; t += 0.5) {
        f.ctx.currentTime = t;
        vi.advanceTimersByTime(200);
      }
      expect(Math.max(0, ...f.peaks), kind).toBeLessThanOrEqual(1);
      const amb = AMBIENCE[kind].layers.reduce((a, l) => a + l.gain, 0);
      const mus = Math.max(...MUSIC[kind].pieces.map((p) => 3 * p.padGain + p.melodyGain));
      expect(amb, kind).toBeLessThanOrEqual(1);
      expect(mus, kind).toBeLessThanOrEqual(1);
      expect(
        (amb * DEFAULT_VOLUMES.ambience + mus * DEFAULT_VOLUMES.music) * MASTER_CEILING,
        kind,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('suspend suspends the context and unlock resumes it', async () => {
    const { audio, f } = setup();
    audio.unlock();
    await Promise.resolve();
    audio.suspend();
    expect(f.ctx.suspend).toHaveBeenCalled();
    f.ctx.resume.mockClear();
    audio.unlock();
    expect(f.ctx.resume).toHaveBeenCalled();
  });
});

describe('generative music', () => {
  it('degreeFreq wraps scale degrees by octave', () => {
    const scale = [0, 2, 4, 7, 9];
    expect(degreeFreq(200, scale, 0)).toBe(200);
    expect(degreeFreq(200, scale, 5)).toBeCloseTo(400);
    expect(degreeFreq(200, scale, 1)).toBeCloseTo(200 * 2 ** (2 / 12));
  });

  it('planBar gives a 3-note pad plus a melody confined to the scale range', () => {
    const piece = MUSIC.village.pieces[0]!;
    const notes = planBar(piece, 0, { degree: 2 }, () => 0.1);
    expect(notes.filter((n) => n.at === 0 && n.attack! > 0.5)).toHaveLength(3);
    expect(notes.length).toBeGreaterThan(3);
    for (const n of notes) expect(n.at).toBeLessThan(barSeconds(piece));
  });

  it('leaves a quiet gap of at least gapSeconds[0] between pieces', () => {
    const f = fakeContext();
    const def = MUSIC.default;
    const scene = createMusicScene(
      f.ctx as unknown as AudioContext,
      {} as AudioNode,
      def,
      () => 0.1,
    );
    for (let now = 0; now < 120; now += 0.2) scene.tick(now, now + 1.5);
    const times = [...new Set(f.starts)].sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, times[i]! - times[i - 1]!);
    expect(maxGap).toBeGreaterThanOrEqual(def.gapSeconds[0]);
    expect(times.length).toBeGreaterThan(8);
  });
});

describe('mining and fishing sounds (skill filter)', () => {
  const cases: [Record<string, unknown> & { type: string }, SoundId[]][] = [
    [{ type: 'swingImpact', skill: 'mining' }, ['pickHit']],
    [{ type: 'swingImpact', skill: 'woodcutting' }, ['axeHit']],
    [{ type: 'swingImpact' }, ['axeHit']],
    [{ type: 'itemGathered', skill: 'mining' }, ['oreGained']],
    [{ type: 'itemGathered', skill: 'woodcutting' }, ['logGained']],
    [{ type: 'itemGathered', skill: 'fishing' }, ['fishCaught']],
    [{ type: 'itemGathered', skill: 'cooking' }, []],
    [{ type: 'nodeDepleted', skill: 'mining' }, ['rockCrumble']],
    [{ type: 'nodeDepleted', skill: 'woodcutting' }, ['treeFall']],
    [{ type: 'nodeDepleted' }, ['treeFall']],
    [{ type: 'nodeRespawned', skill: 'mining' }, []],
    [{ type: 'fishingAttempt', spotId: 's', defId: 'd', method: 'net' }, ['fishCast']],
    [{ type: 'fishingStarted' }, []],
    [{ type: 'fishingStopped' }, []],
    [{ type: 'baitConsumed' }, []],
    [{ type: 'spotMoved' }, ['spotBurble']],
  ];
  it.each(cases)('%j -> %j', (event, expected) => {
    expect(resolveEventSounds(event)).toEqual(expected);
  });

  it('mining events never play woodcutting sounds and vice versa', () => {
    for (const type of ['swingImpact', 'itemGathered', 'nodeDepleted']) {
      expect(resolveEventSounds({ type, skill: 'mining' })).not.toContain('axeHit');
      expect(resolveEventSounds({ type, skill: 'mining' })).not.toContain('logGained');
      expect(resolveEventSounds({ type, skill: 'mining' })).not.toContain('treeFall');
      expect(resolveEventSounds({ type, skill: 'fishing' })).not.toContain('axeHit');
    }
  });

  it('a mining swing renders pick layers on the sfx bus once unlocked', () => {
    const { audio, f } = setup();
    audio.unlock();
    audio.handleEvent({ type: 'swingImpact', skill: 'mining' });
    expect(f.starts.length).toBe(SOUND_DEFS.pickHit.layers.length);
  });

  it('fishing plays one cast per attempt and none from fishingStarted', () => {
    const { audio, f } = setup();
    audio.unlock();
    const n = SOUND_DEFS.fishCast.layers.length;
    audio.handleEvent({ type: 'fishingStarted' });
    expect(f.starts.length).toBe(0);
    audio.handleEvent({ type: 'fishingAttempt', spotId: 's', defId: 'd', method: 'net' });
    expect(f.starts.length).toBe(n);
    audio.handleEvent({ type: 'fishingAttempt', spotId: 's', defId: 'd', method: 'net' });
    expect(f.starts.length).toBe(n); // same instant: min gap blocks stacking
  });
});
