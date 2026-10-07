import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { appVersion, CHANGELOG_URL, SettingsFooter } from './SettingsFooter';

describe('SettingsFooter', () => {
  it('shows the version and a safe external changelog link', () => {
    const html = renderToStaticMarkup(<SettingsFooter version="0.1.0" />).replace(/<!-- -->/g, '');
    expect(html).toContain('Version 0.1.0');
    expect(html).toContain(`href="${CHANGELOG_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('What&#x27;s new');
  });
  it('defaults to the build-time version', () => {
    const html = renderToStaticMarkup(<SettingsFooter />).replace(/<!-- -->/g, '');
    expect(html).toContain(`Version ${appVersion()}`);
  });
});
