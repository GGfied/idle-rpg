import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { Tile } from '@core/contracts';
import { toggleRun } from '@features/movement';
import { isSkillId } from '@core/progression';
import type { SkillId } from '@core/progression';
import { createMemoryStorage, createPreferencesStore } from '@core/persistence';
import type { DeepPartial, Preferences, PreferencesStore } from '@core/persistence';
import { CONTENT } from '@app/registry';
import type { AppEvent, Content } from '@app/registry';
import { addImportantChat, addChat, filterNewChat } from '@app/game/chat';
import {
  bankDeposit,
  bankDepositAll,
  bankWithdraw,
  closeBank,
  dropSlot,
  examineItem,
  examineTree,
  examineFacility,
  examineNpc,
  interactFacility,
  interactNpc,
  interactTree,
  walkTo,
} from '@app/game/actions';
import { advanceTalk, closeTalk } from '@app/game/dialogue';
import type { GameState } from '@app/game/types';
import type { DialogueState } from '@features/story';
import { SOUND_CHANNELS, applyChannel, clampVolume } from '@app/game/soundSettings';
import type { AudioControl, SoundChannel, SoundSettings } from '@app/game/soundSettings';

export type TabId = 'inventory' | 'skills';

export interface MenuOption {
  label: string;
  onSelect: () => void;
}

/** A context menu open at a client-pixel position. */
export interface MenuState {
  x: number;
  y: number;
  title: string;
  options: MenuOption[];
}

/** A save problem shown above the game. `canStartFresh` offers the "Start fresh" button. */
export interface Banner {
  text: string;
  canStartFresh: boolean;
}

/** The skill most recently trained, shown by the top-left tracker until `untilMs` (play time). */
export interface Tracker {
  skill: SkillId;
  untilMs: number;
}

/** The area name shown on screen after entering an area. Cleared by the runtime after AREA_BANNER_MS. */
export interface AreaBanner {
  name: string;
  /** `performance.now()` when shown; the HUD may fade by it, and the clear timer matches on it. */
  shownAt: number;
}

/** How long the area name stays on screen before the runtime clears it. */
export const AREA_BANNER_MS = 4000;

export interface LevelUpNotice {
  id: number;
  skill: SkillId;
  level: number;
}

/** How long the tracker stays after the last xp drop. */
export const TRACKER_MS = 15_000;

export interface AppState {
  game: GameState;
  /** The open conversation, mirrored from `game.talk` (null when none). Read it with `currentView`. */
  dialogue: DialogueState | null;
  tab: TabId;
  /** Phone bottom sheet: whether the active panel is expanded. */
  panelOpen: boolean;
  menu: MenuState | null;
  banner: Banner | null;
  /** All user preferences (persisted separately from the save). Change them with `setPref`. */
  prefs: Preferences;
  /** Alias of `prefs.sound`, kept so older HUD bindings keep working. */
  sound: SoundSettings;
  /** Whether the settings screen is open. */
  settingsOpen: boolean;
  tracker: Tracker | null;
  levelUp: LevelUpNotice | null;
  /** Area name popup; null when none (or when `notifications.areaNames` is off). */
  areaBanner: AreaBanner | null;
  /** Skill whose detail is open in the Skills panel. */
  skillDetail: SkillId | null;
  /** Bumped when the camera should snap back to following the player. */
  recentre: number;
  // Intents (they call pure game actions; nothing here runs game logic itself).
  setGame(game: GameState): void;
  walkTo(tile: Tile): void;
  toggleRun(): void;
  interactTree(nodeId: string): void;
  examineTree(nodeId: string): void;
  examineItem(slot: number): void;
  dropSlot(slot: number): void;
  /** Walk beside a facility and use its option (default: the first, e.g. "Bank"). */
  interactFacility(objectId: string, optionId?: string): void;
  examineFacility(objectId: string): void;
  /** Walk into talking reach of an NPC and use its option (default Talk-to; "bank" opens the bank). */
  interactNpc(spawnId: string, optionId?: string): void;
  examineNpc(spawnId: string): void;
  /** Continue a say node, or pick a choice by index. The box closes itself when the dialogue ends. */
  advanceDialogue(choiceIndex?: number): void;
  closeDialogue(): void;
  closeBank(): void;
  /** Escape key: closes the bank (dialogue and settings close themselves in their own panels). */
  escape(): void;
  bankDeposit(slot: number, quantity: number | 'all'): void;
  bankWithdraw(itemId: string, quantity: number | 'all'): void;
  bankDepositAll(): void;
  say(text: string): void;
  setTab(tab: TabId): void;
  togglePanel(): void;
  openMenu(menu: MenuState): void;
  closeMenu(): void;
  setBanner(banner: Banner | null): void;
  /** Merge a partial update into the preferences; an invalid update changes nothing and says why in chat. */
  setPref(update: DeepPartial<Preferences>): void;
  /** Hands the store the audio system the sound actions drive (called once by the runtime). */
  attachAudio(audio: AudioControl): void;
  setSoundVolume(channel: SoundChannel, volume: number): void;
  toggleMute(): void;
  playTestSound(): void;
  openSettings(): void;
  closeSettings(): void;
  /** Fold a tick's events into HUD notices (tracker, level-up popup). */
  noteEvents(events: AppEvent[]): void;
  dismissLevelUp(): void;
  /** Show the area name unless `notifications.areaNames` is off (a missing value counts as on). */
  showAreaBanner(name: string): AreaBanner | null;
  /** Clear the banner, but only if it is still the one shown at `shownAt` (a newer one stays). */
  clearAreaBanner(shownAt: number): void;
  showSkill(skill: SkillId | null): void;
  recentreCamera(): void;
}

export type AppStore = StoreApi<AppState>;

export function createAppStore(
  initial: GameState,
  content: Content = CONTENT,
  prefsStore: PreferencesStore = createPreferencesStore({
    storage: createMemoryStorage(),
    prefersReducedMotion: false,
  }),
): AppStore {
  // Routine chat lines are dropped as they are added while `notifications.gameMessages` is off.
  const act = (fn: (g: GameState) => GameState) => (s: AppState) => ({
    ...joined(s, fn(s.game)),
    menu: null,
  });
  const joined = (s: AppState, next: GameState) => {
    const game = filterNewChat(s.game, next, s.prefs.notifications.gameMessages);
    return { game, dialogue: game.talk?.dialogue ?? null };
  };
  let noticeId = 0;
  let audio: AudioControl | null = null;
  const follow =
    (f: (s: AppState) => Partial<AppState>) =>
    (s: AppState): Partial<AppState> => ({ ...f(s), recentre: s.recentre + 1 });
  const store = createStore<AppState>()((set, get) => ({
    game: initial,
    dialogue: initial.talk?.dialogue ?? null,
    tab: 'inventory',
    panelOpen: true,
    menu: null,
    banner: null,
    prefs: prefsStore.get(),
    sound: prefsStore.get().sound,
    settingsOpen: false,
    tracker: null,
    levelUp: null,
    areaBanner: null,
    skillDetail: null,
    recentre: 0,
    setGame: (game) => set((s) => joined(s, game)),
    toggleRun: () => set((s) => ({ game: { ...s.game, movement: toggleRun(s.game.movement) } })),
    walkTo: (tile) => set(follow(act((g) => walkTo(g, content, tile)))),
    interactTree: (id) => set(follow(act((g) => interactTree(g, content, id)))),
    examineTree: (id) => set(act((g) => examineTree(g, content, id))),
    examineItem: (slot) => set(act((g) => examineItem(g, content, slot))),
    dropSlot: (slot) => set(act((g) => dropSlot(g, content, slot))),
    interactFacility: (id, opt) => set(follow(act((g) => interactFacility(g, content, id, opt)))),
    examineFacility: (id) => set(act((g) => examineFacility(g, content, id))),
    interactNpc: (id, opt) => set(follow(act((g) => interactNpc(g, content, id, opt)))),
    examineNpc: (id) => set(act((g) => examineNpc(g, content, id))),
    advanceDialogue: (i) => set(act((g) => advanceTalk(g, content, i))),
    closeDialogue: () => set(act((g) => closeTalk(g))),
    closeBank: () => set(act((g) => closeBank(g))),
    escape: () => {
      if (get().game.bankOpen) get().closeBank();
    },
    bankDeposit: (slot, q) => set(act((g) => bankDeposit(g, content, slot, q))),
    bankWithdraw: (id, q) => set(act((g) => bankWithdraw(g, content, id, q))),
    bankDepositAll: () => set(act((g) => bankDepositAll(g, content))),
    say: (text) => set(act((g) => addChat(g, text))),
    setTab: (tab) =>
      set((s) => ({ tab, panelOpen: s.tab === tab ? !s.panelOpen : true, menu: null })),
    togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    openMenu: (menu) => set({ menu }),
    closeMenu: () => set({ menu: null }),
    setBanner: (banner) => set({ banner }),
    setPref: (update) => {
      const r = prefsStore.set(update);
      if (!r.ok) {
        set((s) => ({
          game: addImportantChat(s.game, `Could not change that setting: ${r.error}`),
        }));
      }
    },
    attachAudio: (a) => {
      audio = a;
    },
    setSoundVolume: (channel, volume) =>
      get().setPref({ sound: { volumes: { [channel]: clampVolume(volume) } } }),
    toggleMute: () => get().setPref({ sound: { muted: !get().sound.muted } }),
    playTestSound: () => audio?.play('logGained'),
    openSettings: () => set({ settingsOpen: true, menu: null }),
    closeSettings: () => set({ settingsOpen: false }),
    noteEvents: (events) => {
      let tracker = get().tracker;
      let levelUp = get().levelUp;
      const popups = get().prefs.notifications.levelUpPopup;
      for (const e of events) {
        if (e.type === 'xpGranted' && isSkillId(e.skill)) {
          tracker = { skill: e.skill, untilMs: get().game.meta.playTimeMs + TRACKER_MS };
        } else if (e.type === 'levelUp' && popups) {
          levelUp = { id: ++noticeId, skill: e.skill, level: e.level };
        }
      }
      if (tracker !== get().tracker || levelUp !== get().levelUp) set({ tracker, levelUp });
    },
    dismissLevelUp: () => set({ levelUp: null }),
    showAreaBanner: (name) => {
      if (get().prefs.notifications.areaNames === false) return null;
      const areaBanner = { name, shownAt: performance.now() };
      set({ areaBanner });
      return areaBanner;
    },
    clearAreaBanner: (shownAt) =>
      set((s) => (s.areaBanner?.shownAt === shownAt ? { areaBanner: null } : {})),
    showSkill: (skillDetail) => set({ skillDetail }),
    recentreCamera: () => set((s) => ({ recentre: s.recentre + 1 })),
  }));
  // Preferences are the source of truth: mirror them into the store and push the sound changes on.
  prefsStore.subscribe((prefs) => {
    const prev = store.getState().prefs;
    store.setState((s) => ({
      prefs,
      sound: prefs.sound,
      levelUp: prefs.notifications.levelUpPopup ? s.levelUp : null,
    }));
    if (!audio) return;
    if (prefs.sound.muted !== prev.sound.muted) audio.setMuted(prefs.sound.muted);
    for (const c of SOUND_CHANNELS) {
      if (prefs.sound.volumes[c] !== prev.sound.volumes[c])
        applyChannel(audio, c, prefs.sound.volumes[c]);
    }
  });
  return store;
}
