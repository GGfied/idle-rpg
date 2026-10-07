export const CHANGELOG_URL = 'https://github.com/GGfied/idle-rpg/blob/main/CHANGELOG-2026.md';

/** Build-time version (vite `define`); 'dev' when the define is absent. */
export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

export function SettingsFooter({ version = appVersion() }: { version?: string }) {
  return (
    <div className="settings-footer">
      <span className="settings-version">Version {version}</span>
      <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">
        What&apos;s new
      </a>
    </div>
  );
}
