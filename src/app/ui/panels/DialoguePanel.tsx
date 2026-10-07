import { useEffect, useMemo, useState } from 'react';
import { currentView, type DialogueState, type DialogueView } from '@features/story';
import { useApp } from '@app/ui/context';
import { SpeakerAvatar } from '@app/ui/components/SpeakerAvatar';
import { speakerPortrait } from '@app/ui/dialoguePortrait';
import { dialogueKeyAction, tapAdvances } from '@app/ui/dialogueKeys';

function safeView(state: DialogueState | null): DialogueView | null {
  if (!state) return null;
  try {
    return currentView(state);
  } catch {
    return null;
  }
}

const TYPE_MS = 16;

/** Characters of `text` revealed so far; instant unless animations are On. Returns [count, finish]. */
function useTyped(text: string, animate: boolean): [number, () => void] {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((c) => {
        if (c + 1 >= text.length) window.clearInterval(id);
        return c + 1;
      });
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [text, animate]);
  return [n, () => setN(text.length)];
}

/** Modern NPC dialogue box: say nodes tap/Space/Enter to continue, choice nodes use 1-9. */
export function DialoguePanel() {
  const state = useApp((s) => s.dialogue);
  const look = useApp((s) => s.speakerLook);
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

  const speaker = view?.speaker ?? '';
  const portrait = useMemo(() => speakerPortrait(speaker, 24, undefined, look), [speaker, look]);
  const text = view?.text ?? '';
  const [shown, finish] = useTyped(text, mode === 'on');
  if (!view) return null;
  const typing = shown < text.length;
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
        onClick={canTap ? () => (typing ? finish() : advance()) : undefined}
      >
        <div className="dialogue-name" data-player={isPlayer}>
          <SpeakerAvatar name={view.speakerName} src={portrait} />
          {view.speakerName}
        </div>
        {canTap ? (
          <>
            <p className="dialogue-text">
              {text.slice(0, shown)}
              <span className="dialogue-rest">{text.slice(shown)}</span>
            </p>
            <div className="dialogue-continue" data-typing={typing}>
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
