import { useEffect, useRef } from 'react';
import {
  MAX_LEVEL,
  SKILLS,
  combatLevel,
  levelForXp,
  levelProgress,
  skillColor,
  totalLevel,
  xpToNextLevel,
} from '@core/progression';
import { useApp } from '@app/ui/context';
import { Panel } from '@app/ui/components/Panel';
import { SkillIcon } from '@app/ui/components/SkillIcon';
import { ProgressBar } from '@app/ui/components/ProgressBar';
import { SkillUnlocks } from '@app/ui/panels/SkillUnlocks';

/** OSRS-style skills: a 3-column grid of big levels; tap one for XP and XP to the next level. */
export function SkillsPanel() {
  const progression = useApp((s) => s.game.progression);
  const detail = useApp((s) => s.skillDetail);
  const showSkill = useApp((s) => s.showSkill);
  const picked = SKILLS.find((s) => s.id === detail);
  return (
    <Panel title="Skills">
      <div className="skill-totals">
        <span>Total level: {totalLevel(progression)}</span>
        <span>Combat level: {combatLevel(progression)}</span>
      </div>
      <ul className="skill-grid">
        {SKILLS.map((skill) => (
          <li key={skill.id}>
            <button
              type="button"
              className="skill-cell"
              aria-pressed={detail === skill.id}
              style={{
                background: `color-mix(in srgb, ${skillColor(skill.id)} 20%, transparent)`,
                borderLeft: `4px solid ${skillColor(skill.id)}`,
              }}
              aria-label={`${skill.name} level ${levelForXp(progression.xp[skill.id])}`}
              onClick={() => showSkill(detail === skill.id ? null : skill.id)}
            >
              <span className="skill-main">
                <SkillIcon skillId={skill.id} size={32} />
                <span className="skill-level">{levelForXp(progression.xp[skill.id])}</span>
              </span>
              <span className="skill-name">{skill.name}</span>
              <span className="skill-xpbar">
                <ProgressBar
                  value={levelProgress(progression.xp[skill.id]) * 100}
                  max={100}
                  label={`${skill.name} progress`}
                  color={skillColor(skill.id)}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {picked ? <SkillDetail skillId={picked.id} name={picked.name} /> : null}
    </Panel>
  );
}

function SkillDetail({ skillId, name }: { skillId: (typeof SKILLS)[number]['id']; name: string }) {
  const xp = useApp((s) => s.game.progression.xp[skillId]);
  const level = levelForXp(xp);
  const ref = useRef<HTMLDivElement>(null);
  // On a phone the detail sits below the fold of the scrolling sheet; bring it into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [skillId]);
  return (
    <>
      <div className="skill-detail" ref={ref}>
        <strong>{name}</strong>
        <div>
          Level {level} / {MAX_LEVEL}
        </div>
        <div>XP: {Math.floor(xp).toLocaleString()}</div>
        <div>
          {level >= MAX_LEVEL
            ? 'Maximum level'
            : `Next level in: ${Math.ceil(xpToNextLevel(xp)).toLocaleString()} XP`}
        </div>
        <ProgressBar
          value={levelProgress(xp) * 100}
          max={100}
          label={`${name} progress`}
          color={skillColor(skillId)}
        />
      </div>
      <SkillUnlocks skillId={skillId} />
    </>
  );
}
