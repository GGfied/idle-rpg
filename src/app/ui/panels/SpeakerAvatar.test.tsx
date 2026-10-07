import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SpeakerAvatar } from '@app/ui/components/SpeakerAvatar';
import { speakerPortrait } from '@app/ui/dialoguePortrait';

describe('SpeakerAvatar', () => {
  it('renders the portrait as an img with the speaker name as alt', () => {
    const html = renderToStaticMarkup(
      <SpeakerAvatar name="Banker" src="data:image/png;base64,x" />,
    );
    expect(html).toContain('<img');
    expect(html).toContain('alt="Banker"');
    expect(html).toContain('src="data:image/png;base64,x"');
  });
  it('falls back to the coloured initial circle without a portrait', () => {
    const html = renderToStaticMarkup(<SpeakerAvatar name="Banker" src={null} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('>B<');
  });
});

describe('speakerPortrait', () => {
  it('passes the speaker as look id and size', () => {
    const calls: [string, number][] = [];
    const url = speakerPortrait('player', 96, (l, s) => (calls.push([l, s]), 'u'));
    expect(url).toBe('u');
    expect(calls).toEqual([['player', 96]]);
  });
  it('returns null when the function is missing, throws or is empty', () => {
    expect(speakerPortrait('banker', 96, null)).toBeNull();
    expect(speakerPortrait('banker', 96, () => '')).toBeNull();
    expect(
      speakerPortrait('banker', 96, () => {
        throw new Error('x');
      }),
    ).toBeNull();
  });
});
