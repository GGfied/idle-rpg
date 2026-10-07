import { useEffect, useRef } from 'react';
import { useApp } from '@app/ui/context';
import { isAtBottom } from '@app/ui/chatScroll';

/** Always-visible chat log: bottom-left on desktop, a 3-line strip above the sheet on phones. */
export function ChatBox() {
  const chat = useApp((s) => s.game.chat);
  const mode = useApp((s) => s.prefs.visuals.animations);
  const box = useRef<HTMLDivElement>(null);
  // Lines present at mount are not animated; only ones added afterwards slide in.
  const seen = useRef(chat[chat.length - 1]?.id ?? 0);
  // Follow new lines only while the reader is at the bottom; scrolling up pauses it.
  const follow = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [chat]);
  return (
    <div
      className="chatbox"
      ref={box}
      role="log"
      aria-label="Chat"
      data-mode={mode}
      onScroll={(e) => {
        follow.current = isAtBottom(e.currentTarget);
      }}
    >
      {chat.map((line) => (
        <p
          key={line.id}
          data-kind={line.important ? 'alert' : 'info'}
          data-new={line.id > seen.current}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
