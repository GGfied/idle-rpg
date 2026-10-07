import { useEffect } from 'react';
import { SKILLS, levelForXp, levelProgress, skillColor } from '@core/progression';
import { useApp } from '@app/ui/context';
import { useNotifications } from '@app/ui/prefs';
import { SkillIcon } from '@app/ui/components/SkillIcon';
import { ProgressBar } from '@app/ui/components/ProgressBar';

const nameOf = (id: string): string => SKILLS.find((s) => s.id === id)?.name ?? id;
const POPUP_MS = 4000;

/** Top-left tracker for the skill being trained. */
export function SkillTracker() {
  const tracker = useApp((s) => s.tracker);
  const now = useApp((s) => s.game.meta.playTimeMs);
  const xp = useApp((s) => (tracker ? s.game.progression.xp[tracker.skill] : 0));
  if (!tracker || now > tracker.untilMs) return null;
  return (
    <div className="tracker" aria-label={`${nameOf(tracker.skill)} tracker`}>
      <div className="tracker-row">
        <span>
          <SkillIcon skillId={tracker.skill} size={24} />
          {nameOf(tracker.skill)}
        </span>
        <span>Lv {levelForXp(xp)}</span>
      </div>
      <ProgressBar
        value={levelProgress(xp) * 100}
        max={100}
        label="Level progress"
        color={skillColor(tracker.skill)}
      />
      <div className="tracker-xp">{Math.floor(xp).toLocaleString()} XP</div>
    </div>
  );
}

/** Level-up popup: shows for a few seconds, tap to dismiss. */
export function LevelUpPopup() {
  const notice = useApp((s) => s.levelUp);
  const dismiss = useApp((s) => s.dismissLevelUp);
  const enabled = useNotifications().levelUpPopup;
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined) return;
    const t = setTimeout(dismiss, POPUP_MS);
    return () => clearTimeout(t);
  }, [id, dismiss]);
  if (!notice || !enabled) return null;
  return (
    <button
      type="button"
      className="levelup"
      style={{ borderColor: skillColor(notice.skill) }}
      onClick={dismiss}
    >
      <SkillIcon skillId={notice.skill} size={40} />
      <strong>Congratulations!</strong>
      <span>
        Your {nameOf(notice.skill)} level is now {notice.level}.
      </span>
    </button>
  );
}
