import { useEffect, useState } from 'react';

/** Round speaker avatar: the portrait when `src` loads, else the coloured initial circle. */
export function SpeakerAvatar({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return (
      <img
        className="dialogue-avatar dialogue-avatar-img"
        src={src}
        alt={name}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="dialogue-avatar" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
