import { useEffect, useState, type CSSProperties } from 'react';
import { useApp } from '@app/ui/context';
import { areaNamesEnabled, bannerTimings, bannerTotalMs, bannerVisible } from '@app/ui/areaBanner';

interface AreaBannerState {
  name: string;
  shownAt: number;
}

const useBanner = (): AreaBannerState | null => useApp((s) => s.areaBanner);
/** A missing value (older state) counts as on. */
const useEnabled = (): boolean => useApp((s) => areaNamesEnabled(s.prefs.notifications.areaNames));

/** OSRS-style area title: fades in, holds, fades out; a new banner restarts it. Never blocks input. */
export function AreaBanner() {
  const banner = useBanner();
  const enabled = useEnabled();
  const mode = useApp((s) => s.prefs.visuals.animations);
  const timings = bannerTimings(mode);
  const total = bannerTotalMs(timings);
  const [doneFor, setDoneFor] = useState<number | null>(null);
  const key = banner?.shownAt;
  useEffect(() => {
    if (key === undefined || !enabled) return;
    const t = setTimeout(() => setDoneFor(key), total);
    return () => clearTimeout(t);
  }, [key, enabled, total]);
  if (!banner || doneFor === banner.shownAt) return null;
  if (!bannerVisible(banner, enabled, 0, timings)) return null;
  const style = {
    '--in': `${timings.fadeInMs}ms`,
    '--hold': `${timings.holdMs}ms`,
    '--out': `${timings.fadeOutMs}ms`,
  } as CSSProperties;
  return (
    <div className="area-banner" aria-live="polite" style={style}>
      <div key={banner.shownAt} className="area-banner-inner" data-mode={mode}>
        <div className="area-banner-title">{banner.name}</div>
        <div className="area-banner-rule" aria-hidden="true" />
      </div>
    </div>
  );
}
