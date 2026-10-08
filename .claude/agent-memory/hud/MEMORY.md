# hud memory
Full history (pre-trim): docs/archive/agent-memory-hud-2026-10-09.md

## User rules
- Toggles positive: "Sound"/"Show HUD", On = active; invert at the row (checked=!muted), key descriptions by shown value (sound.enabled, hud.visible).
- Settings use Off/1-5 radio steps (StepControl + volumeSteps.ts), never sliders. No standalone mute button.
- Unlock tree: locked node = "Unknown" + "?" only (no ItemSlot/label/aria-label). First draft must be the visual form asked for.

## Testing (no jsdom; vitest env node)
- Keep logic in pure, unit-tested helpers in ui/*.ts (tabSelect, itemMenu, chatScroll, runToggle, worldMapView...).
- Components: renderToStaticMarkup in .test.tsx, strip `<!-- -->` before asserting text; or call the component fn and invoke props.onClick/onSelect.
- Split a pure `XView` (props in, callbacks out) from the store-connected wrapper; test the View.
- Fakes: Pick<> structural fakes cast via unknown; injected fn default params fire on undefined, so test "missing" with null.
- `import x from '@app/ui/Hud.tsx?raw'` works; `.css?raw` is empty in vitest -> verify CSS in e2e.
- e2e: open overlays via `window.__idleRpg.store.setState` + tests/e2e/lib.mjs withGame/forEachViewport. store.setTab on the active tab TOGGLES panelOpen (guard s.tab!==x). Phone sheet is folded by default: click [aria-label="Expand panel"]. Harness rect() returns centre x,y.
- Mutants: scratch rsync copy; CSS mutant = inject old CSS via <style> in a temp e2e copy inside tests/e2e.
- Run build separately from `a && b`; failures outside app/ui: report, don't fix.

## CSS / layout
- Desktop sizes are :root vars (--hud-w, --mm, --orb, --chat-w/h, --fs) in styles.css; new fixed px -> new var. <768px = phone.
- Multi-rule CSS change = ONE scripted save (no half state in HMR).
- Controls over the canvas: pointer-events:auto, z-index, >=44px, onPointerDown stopPropagation. Scrollable overlays add touch-action:pan-y + overscroll-behavior:contain.
- Escape hatches (.hud-show): position:fixed + safe-area insets; test desktop/portrait/landscape.
- Phone Settings: `.hud[data-settings=true] .hud-body{max-height:75dvh}`, reset in landscape block too. Phone-only hide via data attr (`.hud[data-bank]` in <=767px).
- Transient banners: top band LEFT of the minimap cluster, never mid-screen (player is near centre).
- Delayed exit animation: use `forwards`, not `both` (both applies `from` during delay and overrides the fade-in).
- Unlock tree is a SIBLING of .skill-detail; columns repeat(var(--n),minmax(0,1fr)). .slot outside a grid needs explicit width/height.

## Components / patterns
- Rejected actions: aria-disabled + dim + store `say(text)`, never native disabled.
- Phone fold = 3-state pref (auto/collapsed/expanded) + pure isFolded(mode, phone); bottom inset published as px CSS var on :root via ResizeObserver + bottomInset().
- Pan/zoom: ONE pure clampView(view) for every path; native canvas listeners (wheel passive:false); portal overlays to body.
- Every setting row's description comes from ui/settingDescriptions.ts (exhaustiveness test).
- Inventory drag: window pointer listeners after 8px + swallowClick; slots touch-action:none.
- Never write a second painter; if graphics must add one, stop and report.
- ChatLine has only `important`; new kinds need a `kind` field from integrator.

## Cross-agent
- Missing contract field: grep first (often landed). Else optional `as unknown` cast guard, state the contract, remove once it lands. Strict setPref rejects unknown keys.
- Optional render exports: `import * as ns from "@render/index"` (no bare @render). Missing barrel export -> add one line, report.
- Re-read files before every edit (parallel writers); on resume check tsc + git diff first. No edit is valid.
- eslint react-hooks plugin isn't installed: no eslint-disable for it.

## Tooling
- macOS: `sed -i ''`, no `timeout`; quote grep globs in zsh.
- Headless CDP: launchChrome from tests/e2e/cdp.mjs, `node --experimental-websocket`; own vite port via tests/e2e/vite.frozen.config.mjs. dist preview: npm run build + python http.server.
