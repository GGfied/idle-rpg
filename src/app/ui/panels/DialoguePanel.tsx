import { useEffect, useMemo } from 'react';
import { currentView, type DialogueState, type DialogueView } from '@features/story';
import { useApp } from '@app/ui/context';
import { dialogueKeyAction, tapAdvances } from '@app/ui/dialogueKeys';

function safeView(state: DialogueState | null): DialogueView | null {
  if (!state) return null;
  try {
    return currentView(state);
  } catch {
    return null;
  }
}

/** OSRS-style NPC dialogue box: say nodes tap/Space/Enter to continue, choice nodes use 1-9. */
export function DialoguePanel() {
  const state = useApp((s) => s.dialogue);
  const advance = useApp((s) => s.advanceDialogue);
  const close = useApp((s) => s.closeDialogue);
  const mode = useApp((s) => s.prefs.visuals.animations);
  const view = useMemo(() => safeView(state), [state]);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.repeat || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      const a = dialogueKeyAction(e.key, view);
      if (!a) return;
      e.preventDefault();
      if (a.type === 'close') close();
      else if (a.type === 'advance') advance();
      else advance(a.index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, advance, close]);

  if (!view) return null;
  const isPlayer = view.speaker === 'player';
  const canTap = tapAdvances(view);
  return (
    <section
      className="dialogue"
      data-mode={mode}
      aria-label={`Dialogue with ${view.speakerName}`}
      aria-live="polite"
    >
      <button type="button" className="dialogue-close" aria-label="Close dialogue" onClick={close}>
        ✕
      </button>
      <div
        className="dialogue-main"
        data-tap={canTap}
        onClick={canTap ? () => advance() : undefined}
      >
        <div className="dialogue-name" data-player={isPlayer}>
          {view.speakerName}
        </div>
        {canTap ? (
          <>
            <p className="dialogue-text">{view.text}</p>
            <div className="dialogue-continue">
              <span className="dialogue-continue-desktop">Click here to continue</span>
              <span className="dialogue-continue-touch">Tap to continue</span>
            </div>
          </>
        ) : (
          <ol className="dialogue-choices">
            {view.choices.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="dialogue-choice"
                  disabled={c.locked}
                  aria-disabled={c.locked}
                  onClick={() => advance(i)}
                >
                  <span className="dialogue-choice-key">{i + 1}</span>
                  <span>
                    {c.text}
                    {c.locked && c.requirementText ? (
                      <small className="dialogue-req">{c.requirementText}</small>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
