import { useEffect, useRef, useState } from 'react';
import { useApp } from '@app/ui/context';
import { isAtBottom } from '@app/ui/chatScroll';
import { hasUnread, peekLine } from '@app/ui/chatDock';
import { useFold } from '@app/ui/hudFold';

const PEEK_MS = 4000;

/** Phone-only: minimize button / chat button (unread dot) and the small amber toast. Hidden by CSS on desktop. */
function ChatToggle({
  minimized,
  setMinimized,
}: {
  minimized: boolean;
  setMinimized: (v: boolean) => void;
}) {
  const chat = useApp((s) => s.game.chat);
  const lastId = chat[chat.length - 1]?.id ?? 0;
  const [seen, setSeen] = useState(lastId);
  const [peek, setPeek] = useState<string | null>(null);
  const peeked = useRef(lastId);
  useEffect(() => {
    if (!minimized) {
      setSeen(lastId);
      peeked.current = lastId;
      setPeek(null);
      return;
    }
    const line = peekLine(chat, peeked.current);
    peeked.current = lastId;
    if (!line) return;
    setPeek(line.text);
    const t = setTimeout(() => setPeek(null), PEEK_MS);
    return () => clearTimeout(t);
  }, [chat, lastId, minimized]);
  const unread = minimized && hasUnread(chat, seen);
  return (
    <>
      <button
        type="button"
        className="chat-toggle"
        data-min={minimized}
        data-unread={unread}
        aria-label={
          minimized ? (unread ? 'Open chat, new messages' : 'Open chat') : 'Minimize chat'
        }
        onClick={() => setMinimized(!minimized)}
      >
        {minimized ? 'Chat' : '\u25BE'}
        {unread ? <span className="chat-dot" aria-hidden="true" /> : null}
      </button>
      {minimized && peek ? (
        <div className="chat-peek" role="status">
          {peek}
        </div>
      ) : null}
    </>
  );
}

/** Always-visible chat log: bottom-left on desktop, a 3-line strip above the sheet on phones. */
export function ChatBox() {
  const chat = useApp((s) => s.game.chat);
  const mode = useApp((s) => s.prefs.visuals.animations);
  const [minimized, setMinimized] = useFold('chatFold');
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
    <>
      <div
        className="chatbox"
        ref={box}
        role="log"
        aria-label="Chat"
        data-mode={mode}
        data-min={minimized}
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
      <ChatToggle minimized={minimized} setMinimized={setMinimized} />
    </>
  );
}
