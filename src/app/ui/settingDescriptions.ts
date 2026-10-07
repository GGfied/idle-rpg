import { STEP_COUNT } from '@app/ui/volumeSteps';

import type { SoundChannel } from '@app/game/soundSettings';

export type VolumeChannel = SoundChannel;

const LEVELS = ['', 'Very quiet', 'Quiet', 'Normal', 'Loud', 'Maximum'];
const OFF: Record<VolumeChannel, string> = {
  master: 'All sound off',
  sfx: 'No game sounds',
  ui: 'No menu clicks',
  music: 'No music',
  ambience: 'No ambience',
};

/** Description of a volume step (0 = Off .. 5), for the live line under a row. */
export function volumeDescription(channel: VolumeChannel, step: number): string {
  const s = Math.min(STEP_COUNT, Math.max(0, Math.round(step)));
  return s === 0 ? OFF[channel] : LEVELS[s]!;
}

/** What each preference value does, keyed by pref path then value. One table; components only look up. */
export const PREF_DESCRIPTIONS = {
  'sound.enabled': { true: 'Sound on', false: 'All sound off: volumes below are kept' },
  'hud.minimap': { true: 'Minimap shown', false: 'Minimap hidden; use the compass to re-centre' },
  'hud.orbs': { true: 'Health, prayer and run orbs shown', false: 'Orbs hidden' },
  'hud.skillTracker': {
    true: 'XP tracker shown while you train',
    false: 'XP tracker hidden',
  },
  'hud.chatbox': { true: 'Chatbox shown', false: 'Chatbox hidden; messages are not shown' },
  'hud.visible': {
    true: 'HUD shown',
    false: 'HUD hidden; tap Show HUD to bring it back',
  },
  'notifications.levelUpPopup': {
    true: 'Level-up popup appears',
    false: 'No level-up popup; the chat still says it',
  },
  'notifications.xpDrops': { true: 'XP pop-ups float up as you train', false: 'No XP pop-ups' },
  'notifications.achievementToasts': {
    true: 'Achievement pop-ups appear',
    false: 'No achievement pop-ups',
  },
  'notifications.gameMessages': {
    true: 'Game messages appear in chat',
    false: 'Game messages hidden from chat',
  },
  'notifications.areaNames': {
    true: 'Show the area name when you enter a new place',
    false: 'Area names hidden',
  },
  'visuals.vfx': {
    on: 'All effects',
    reduced: 'Only useful effects: XP drops, click markers, warnings',
    off: 'No effects',
  },
  'visuals.animations': {
    on: 'Full animations',
    reduced: 'Minimal motion: quick fades, small tool taps',
    off: 'No animation; things change instantly',
  },
} as const satisfies Record<string, Record<string, string>>;
