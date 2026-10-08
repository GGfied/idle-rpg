# Runbook: Firemaking (no skill) + Cooking
- **Status:** in progress
- **Started:** 2026-10-08
- **Last updated:** 2026-10-09
- **Owner:** main session
- Full text before the 2026-10-09 trim (all task details, the whole log): `docs/archive/firemaking-cooking-runbook-full-2026-10-09.md`;
  older log: `docs/archive/firemaking-cooking-log-2026-10-08.md`.

## Goal
Light logs into a fire and cook raw food on it (cooked or burnt) with Cooking XP. Shipped in v0.1.3 (commit 3563af6).

## Decisions
- No Firemaking skill (user): lighting needs a `tinderbox` (starter kit), no XP or level. Better logs burn longer (logs 100
  ticks, oak 150). A burnt-out fire leaves `ashes`. Fires are transient and not saved.
- Cooking: single raw item → cooked/burnt on a fire only (no multi-ingredient recipes yet). Fish + raw_chicken/raw_beef
  (meat has no source until monsters). Burn chance via core `successChance`. Eating/heal deferred to combat (data only).
- Names and icons: every food starts with Raw / Cooked / Burnt; raw pale/wet, cooked golden with grill marks, burnt black.
- Fires are walkable (user). Lighting is refused when all 4 neighbours are blocked.
- Animations default On; the game never auto-picks Reduced from the browser's prefers-reduced-motion (main, B2).
- Process rules decided 2026-10-09 are in CLAUDE.md (full run-all only on the user's ask, 20% CPU left free, chase
  don't kill, no endless loops, read only your own area).

## Tasks
- [x] Fire + cooking build, art, animation, vfx, wiring, all qa slices, lighting/cook-pose polish, smoke fixes,
      e2e speed rounds (Q1-Q4, #39), black-water CANVAS fix, release v0.1.3, Cooking skill tree (C1), Brave walk (B1).
      Details in the archive copy.
- [x] Full run-all R2 (user ask): 93/103; real reds fixed: isoTap + smoke c/d stale tests (T-8 ✅), nameplate p3 stale
      oracle (✅). Run cap + CPU gate (`tests/e2e/cpuGate.mjs`, 80% / ≤4 Chromes) ✅.
- [ ] B2 Animations default On: (a) `persistence` ✅ 03:01; (b) `integrator` ✅ 03:30 (runtime auto-pick removed, tests
      rewritten; unit 2641 pass verified by main); (c) `qa` in Brave ⏳ (target 03:50). Leftover: preferences.ts still takes
      an unused `prefersReducedMotion` option (persistence tidy, low).
- [x] T-22 smoke reload race fixed (qa); B2(c) Brave PASS (qa, animDefault.e2e); B-20 budget minus gate wait (qa).
- [x] RELEASE v0.1.4 (user 03:30: "after all done. version/changelog/commit/push again"): after T-22 + B2(c) → `core`
      bumps package.json/lock → changelog skill → lint/test/build → commit → push. GATE (user): zero agents running in
      ANY session before commit/push.
- [x] T-9 axeSound (integrator, 7.2 min): no app bug; the test's classify() counts a 220 Hz triangle music note as hit #1.
- [x] T-12 axeSound.e2e (qa, 4 min): hits paired with swing/log chat lines (100 ms); 7/7 desktop + phone, 28.5 s; mutant red.
- [ ] B2 side effect: `npm run test` 2 red — src/app/prefs.test.ts + runtime.test.ts still expect Reduced defaults
      (B2 changed them to On). Belongs to B2's integrator/persistence step (other session); flag it there.
- [x] S1 (qa, ~25+23 min): one shared vite per run-all + warmPage.mjs; measured split: boot 29% / checks 71% (median
      file 21 s), so faster checks, not servers, are what's left. 10 files 396→343 s (one noisy run each, not claimed).
      Post-swap: lint/build ✅, isoTap 26/26 ✅, skillTags ✅; smoke + nameplateClampPlay functional ✅ but budget red.
- [ ] B-20 budget check counts CPU-gate queue wait as wall time (regression from today's gate) — agent: `qa` ⏳ (03:35)
- [ ] MD cleanup (user): CLAUDE.md ✅, graphics/animation/hud memories ✅, this runbook ✅; qa-coverage, agent-progress,
      qa-log, qa.md; qa + integrator memories after S1/T-9 finish — main ⏳
- [ ] ~/.claude cleanup (user): skills ✅ (tweak-k8s 67→12, golang-unit-tests 40→10, squash 20→8, update-mr 14→10,
      changelog 104→24 + LESSONS 26→7 KB); global CLAUDE.md ⏳; project memories ⏳; lb-review ⏳. Then
      ~/.claude-dlee + ~/.claude-rndcommon (identical files get the trimmed copy) — main + general-purpose agents
- [ ] HARD RULE "tasks + session file" (user; item 3 = at session start/after /clear, find existing continuation mds,
      ask the user which to continue or new; update it automatically all session): idle-rpg, ~/.claude-dlee,
      ~/.claude-rndcommon ✅; ~/.claude via its trim agent ⏳ (verify)
- [x] ~/.claude project memories (agent, 6 min): 8 indexes → ≤4 KB except lb-iac 6.7 KB (87 topic files; left as is),
      4 big topic files 14-55 → 6-8 KB; main restored edge-service's verification script verbatim (rewrite was never run).
- [x] Config dirs (user): ~/.claude, ~/.claude-dlee, ~/.claude-rndcommon all trimmed (CLAUDE.md 15-16 KB, lb-review
      28-30 KB, changelog 23-24 KB), hard rule present, budget rules removed, lb-review + changelog on model: sonnet —
      verified by grep/wc 03:2x. Trim agents ran on Opus (general-purpose, model not set) — main sets model: sonnet now.
- [ ] Parked (only on the user's ask): M4 cook-pose rear hand; minimap area label overlaps shore/arrow; lightPolish n vs
      sw facings look alike.
- [ ] ~~Changelog~~ skipped until the user asks.

## Next step
Chase T-9 (03:10) and S1 (03:14); finish the MD cleanup; then route any reds from S1's post-swap checks to owners.
Nothing committed since v0.1.3: commit/push only with the user's OK (push deploys).

## Open questions / blockers
- vite.config.ts (core-owned) was edited by qa G-1 to include `tests/e2e/*.test.mjs`; tell `core` if it needs review.

## Log
- 2026-10-09 00:0x Release v0.1.3 pushed. 01:15 run-all attempt 1 invalid (load 300-600). 02:2x R2 93/103.
- 2026-10-09 02:4x-03:0x User rules recorded (see Decisions). T-1/N-1 found stale tests, not game bugs (graphics 21.5 /
  ~9 min). T-8 fixed isoTap + smoke (6.6 min). G-1 CPU gate (~15 min). S1 wrongly stopped by main at 25 min, resumed.
- 2026-10-09 03:00 Main ran on the live tree: lint ok, 2621 unit pass, tsc 0, build ok.
- 2026-10-09 03:08 USER HARD RULE: trim any md over its limit before starting a task (limits in CLAUDE.md). Integrator +
  qa memories (29 / 18 KB) being trimmed before T-12.
- 2026-10-09 03:1x MD cleanup: CLAUDE.md 36→15 KB, graphics memory 35→6, animation 22→5, hud 14→4, runbook 26→4 KB.
