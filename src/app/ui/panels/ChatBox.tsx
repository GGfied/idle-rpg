import { useEffect, useRef } from 'react';
import { useApp } from '@app/ui/context';

/** Always-visible chat log: bottom-left on desktop, a 3-line strip above the sheet on phones. */
export function ChatBox() {
  const chat = useApp((s) => s.game.chat);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);
  return (
    <div className="chatbox" ref={box} role="log" aria-label="Chat">
      {chat.map((line) => (
        <p key={line.id}>{line.text}</p>
      ))}
    </div>
  );
}
