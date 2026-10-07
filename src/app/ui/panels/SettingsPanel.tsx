import { useEffect } from 'react';
import { Panel } from '@app/ui/components/Panel';
import { volumeDescription, type VolumeChannel } from '@app/ui/settingDescriptions';
import { STEP_COUNT, stepToVolume, volumeToStep } from '@app/ui/volumeSteps';
import { ToggleRow } from '@app/ui/components/ToggleRow';
import { PREF_DESCRIPTIONS } from '@app/ui/settingDescriptions';
import { useHud, useNotifications, useSetPref, useVisuals } from '@app/ui/prefs';
import { StepControl } from '@app/ui/components/StepControl';
import { useApp, useRuntime } from '@app/ui/context';
import { SettingsFooter } from '@app/ui/panels/SettingsFooter';

type Channel = VolumeChannel;

/** `sample` plays after a step is picked so the level is audible; music/ambience are their own feedback. */
const ROWS: { id: Channel; label: string; hint?: string; sample?: 'logGained' | 'uiClick' }[] = [
  { id: 'master', label: 'Master', sample: 'logGained' },
  { id: 'sfx', label: 'Game sounds', hint: 'chopping, logs, level-up', sample: 'logGained' },
  { id: 'ui', label: 'Menu clicks', hint: 'buttons, tabs, tapping to walk', sample: 'uiClick' },
  { id: 'music', label: 'Music', hint: 'calm background tunes per area' },
  { id: 'ambience', label: 'Ambience', hint: 'wind, birds, water, village sounds' },
];

export function useSettingsOpen(): boolean {
  return useApp((s) => s.settingsOpen);
}

/** The gear button beside the mute toggle. */
export function SettingsButton() {
  const open = useApp((s) => s.openSettings);
  const close = useApp((s) => s.closeSettings);
  const isOpen = useSettingsOpen();
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label="Settings"
      aria-pressed={isOpen}
      onClick={isOpen ? close : open}
    >
      <span className="gear" aria-hidden="true">
        {'⚙'}
      </span>
    </button>
  );
}

const VOLUME_OPTIONS = ['Off', ...Array.from({ length: STEP_COUNT }, (_, i) => String(i + 1))];
const MODES = ['on', 'reduced', 'off'] as const;
const MODE_LABELS = ['On', 'Reduced', 'Off'];

type Mode = (typeof MODES)[number];

const SCREEN_ROWS = [
  ['minimap', 'Minimap'],
  ['orbs', 'Orbs'],
  ['skillTracker', 'Skill tracker'],
  ['chatbox', 'Chatbox'],
] as const;
const NOTIFY_ROWS = [
  ['levelUpPopup', 'Level-up popup'],
  ['xpDrops', 'XP pop-ups'],
  ['achievementToasts', 'Achievement pop-ups'],
  ['gameMessages', 'Game messages in chat'],
  ['areaNames', 'Area names'],
] as const;
const VISUAL_ROWS = [
  ['vfx', 'Effects'],
  ['animations', 'Animations'],
] as const;

function VolumeRow({ row }: { row: (typeof ROWS)[number] }) {
  const { audio } = useRuntime();
  const value = useApp((s) => s.sound.volumes[row.id]);
  const set = useApp((s) => s.setSoundVolume);
  const step = volumeToStep(value);
  return (
    <StepControl
      label={row.label}
      hint={row.hint}
      description={volumeDescription(row.id, step)}
      options={VOLUME_OPTIONS}
      selected={step}
      onSelect={(i) => {
        audio.unlock();
        set(row.id, stepToVolume(i));
        if (row.sample) audio.play(row.sample);
      }}
    />
  );
}

/** Positive switch: On = sound plays (prefs.sound.muted === false). */
function SoundRow() {
  const { audio } = useRuntime();
  const muted = useApp((s) => s.sound.muted);
  const toggleMute = useApp((s) => s.toggleMute);
  return (
    <ToggleRow
      label="Sound"
      checked={!muted}
      description={PREF_DESCRIPTIONS['sound.enabled'][String(!muted) as 'true' | 'false']}
      onChange={() => {
        audio.unlock();
        toggleMute();
      }}
    />
  );
}

/** Screen + Notifications + Visuals: bound to `prefs`/`setPref`. */
function PrefSections() {
  const hud = useHud();
  const notes = useNotifications();
  const visuals = useVisuals();
  const setPref = useSetPref();
  const toggle = (group: 'hud' | 'notifications', key: string, value: boolean, label: string) => {
    const table = PREF_DESCRIPTIONS[`${group}.${key}` as keyof typeof PREF_DESCRIPTIONS] as Record<
      string,
      string
    >;
    return (
      <ToggleRow
        key={key}
        label={label}
        checked={value}
        description={table[String(value)] ?? ''}
        onChange={(v) => setPref({ [group]: { [key]: v } })}
      />
    );
  };
  return (
    <>
      <h3 className="settings-section">Screen</h3>
      {SCREEN_ROWS.map(([k, l]) => toggle('hud', k, hud[k], l))}
      <ToggleRow
        label="Show HUD"
        checked={!hud.hidden}
        description={PREF_DESCRIPTIONS['hud.visible'][String(!hud.hidden) as 'true' | 'false']}
        onChange={(v) => setPref({ hud: { hidden: !v } })}
      />
      <h3 className="settings-section">Notifications</h3>
      {NOTIFY_ROWS.map(([k, l]) => toggle('notifications', k, notes[k], l))}
      <h3 className="settings-section">Visuals</h3>
      {VISUAL_ROWS.map(([k, l]) => {
        const value: Mode = visuals[k];
        const table = PREF_DESCRIPTIONS[`visuals.${k}`] as Record<string, string>;
        return (
          <StepControl
            key={k}
            label={l}
            description={table[value] ?? ''}
            options={MODE_LABELS}
            selected={MODES.indexOf(value)}
            onSelect={(i) => setPref({ visuals: { [k]: MODES[i] } })}
          />
        );
      })}
    </>
  );
}

export function SettingsPanel() {
  const close = useApp((s) => s.closeSettings);
  const muted = useApp((s) => s.sound.muted);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="settings">
      <div className="settings-head">
        <h2 className="panel-title">Settings</h2>
        <button
          type="button"
          className="settings-close"
          aria-label="Close settings"
          onClick={close}
        >
          {'✕'}
        </button>
      </div>
      <Panel>
        <h3 className="settings-section">Sound</h3>
        <SoundRow />
        <div className="steps-dim" data-dim={muted}>
          {ROWS.map((r) => (
            <VolumeRow key={r.id} row={r} />
          ))}
        </div>
        <PrefSections />
        <SettingsFooter />
      </Panel>
    </div>
  );
}
