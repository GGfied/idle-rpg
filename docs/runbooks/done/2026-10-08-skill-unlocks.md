# Runbook: Skill unlock view
- **Status:** done
- **Started:** 2026-10-08
- **Last updated:** 2026-10-08
- **Owner:** main session

## Goal
Tapping a skill in the Skills panel shows what that skill unlocks at each level: trees, rocks, fish and tools,
each with its item icon, laid out as a tree (user). Locked entries are hidden as "Unknown" with "Requires <Skill> N (you: M)" (user).

## Decisions          (what was decided, and why)
- USER 2026-10-08: "just the skills that we did" → Woodcutting, Mining, Fishing only (cooking is mid-build, not wired).
- Main: no new agent (mvp runbook decision): unlock levels are each skill's existing data (`requiredLevel` on nodes /
  catches, `levelRequired` on tools). `integrator` builds one pure aggregator in `app/game/` (app may import
  features); `hud` renders it in SkillDetail using the shared ItemSlot icon (one-image rule) and core's Requirement
  evaluator for met/unmet (locked-things-visible rule). No save change.

## Tasks              (in the user's order)
- [x] U1 `skillUnlocks(skillId)` aggregator from woodcutting/mining/fishing data, sorted by level, tested — agent: `integrator`
- [x] U2 Unlocks list in SkillDetail (icons, level, greyed + requirement text when locked; desktop + phone) — agent: `hud`
- [x] U3 qa slice: skill unlock view in the browser (desktop + phone) + mutant — agent: `qa`
- [x] U4 qa gate slice (lint/test/build + e2e) — agent: `qa`
- [-] Changelog entry for next version: SKIPPED for now (user 2026-10-08: "no need changelog now"); add at release.

## Next step
None for this runbook. Changelog entry at the next release. Handed over (not ours): smoke G1 + lint G2 below.

## Open questions / blockers
- G1 (P1, other session's area, unconfirmed): `npm run e2e` smoke 3/12 at 10:45: walk/chop/bank/phone-tap fail
  ("player barely moved (0 px)", "tap did not walk the player") while WorldScene/actions/store/registry/playerAction
  are mid-edit by the firemaking session. Not bisected; re-run the smoke when that session settles.
  10:55: firemaking session's smoke-diag: same 3/12 with its fire WIRING reverted to HEAD (qa-log 184-185). Main checked
  this runbook's diff: styles.css only ADDS rules scoped to .skill-tree/.skill-node, SkillsPanel renders the tree only
  inside an open skill detail → unlikely ours. 10:56 USER: "try now" → one qa smoke re-run dispatched (port 5314).
- G2 (P3): lint unused vars in tests/e2e/cookFire.e2e.mjs:156 and fireLight.e2e.mjs:7 (firemaking session's files).

## Log
- 2026-10-08: runbook created from user "i need this unlock tree view"; scope "just the skills that we did".
- 2026-10-08: USER: firemaking wave 2 is run by another session; this session skips it (my "parked" note reverted).
- 2026-10-08 10:33: `integrator` U1 DONE: app/game/skillUnlocks.ts: skillUnlocks(skillId) → {level,kind,label,itemId}[]
  (labels = item registry names, deduped at lowest level, sorted level→label; other skills []), unlockRequirement(u,skill)
  → core Requirement {type:'skillLevel'} for evaluateRequirement + requirementContext. Main verified: vitest
  skillUnlocks 12/12. Agent mutants: sort reversed 3 red, level+1 2 red; dedup flip survives (no fish at two levels in
  data yet; accepted, noted). tsc red only at render/animation/data.ts:77 (other session's wave-2 work). Lesson not
  recorded → sent back to integrator. Dispatched U2 `hud`.
- 2026-10-08: USER on the live flat list: "man looks so ugly … do better please like a tree format" → sent to the running
  `hud` U2: branch per kind (Trees|Axes, Rocks|Pickaxes, Fish|Tools) from a root skill node, vertical level-ordered node
  chains with connectors, skill-colour unlocked / greyed + dashed + requirement text locked, phone ≤360px no h-scroll.
- 2026-10-08: USER: "also we should not show if user hasn't unlocked" (matches their earlier "don't reveal, just ? and
  requirements") → locked nodes show "???" + "Requires <Skill> N (you: M)", no icon/label. Sent to `hud` U2.
  USER then: "unknown" → the locked label reads "Unknown" (a "?" glyph instead of the icon). Sent to `hud`.
  USER then: "fit the width too" → tree fills the panel width evenly, no overflow/h-scroll/clipping desktop + phone
  (scrollWidth <= clientWidth asserted). Sent to `hud`; U3 qa must check it too.
  USER then: "same size as the skills will be good?" → main: yes; tree has the same left edge + width as `.skill-grid`
  (±1px, desktop + phone). Sent to `hud`; U3 qa checks it.
- 2026-10-08 10:46: `qa` U4 gate: PASS for this slice: tsc 0 errors, vitest 2487 pass, build ok, prettier ok, eslint ok on
  our files, skillUnlocks e2e 25/25. Overall red from other session's work: lint 2 unused vars (G2), smoke 3/12 (G1,
  walking/chopping dead, cause not isolated). No leftover processes. Runbook DONE; G1/G2 handed to the user/firemaking session.
- 2026-10-08 10:44: USER: "give priority to the other side as it takes longer" → U4 gate shrunk to this runbook's files
  (targeted vitest, eslint/prettier, tsc, skillUnlocks e2e once); no full e2e suite, to free CPU for the firemaking session.
- 2026-10-08 10:42: USER: "yea looks good. no need changelog now" → user accepts the tree; changelog deferred to release.
- 2026-10-08 10:41: `qa` U3 PASS: desktop 1280×800 + phone 390×844 live 25/25, 0 console errors (tree per skill, Attack none;
  locked leak nothing: 0 img/aria-label/name; unlocked icon = itemIconUrl; live flip at WC 15 3→4; width = grid
  1008.41/263.59 & 8/374; close on 2nd tap). Mutants: label leak 6 red, min-width 420 6 red. e2e rewritten (port 5312,
  real taps). Not covered: landscape 844×390. Main: ps sweep, no U3 leftovers. Dispatched U4 gate.
- 2026-10-08 10:38: `hud` U2 DONE: SkillUnlocks.tsx (+test, 7), SkillsPanel SkillDetail fragment, styles.css .skill-tree,
  tests/e2e/skillUnlocks.e2e.mjs (port 5311). Root skill node → branches (Trees|Axes, Rocks|Pickaxes, Fish|Tools), locked
  = "?" + "Unknown" + level + requirement, first locked glows. Measured: tree = .skill-grid left/width desktop
  1008.41/263.59, phone 8/374; scrollWidth == clientWidth. Agent: lint + vitest 2486 + build green, e2e 5/5, mutant
  (reveal label) 2 red. Main verified: vitest 19/19 (U1+U2), viewed woodcutting-desktop + fishing-phone screenshots
  (tree fits grid, locked hidden). Lessons recorded. Dispatched U3 qa.
- 2026-10-08 10:34: `integrator` reported "Lessons recorded" (dedup mutant survives without duplicate data). U1 closed.
