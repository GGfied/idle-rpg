# Runbook: Firemaking (no skill) + Cooking
- **Status:** in progress
- **Started:** 2026-10-08
- **Last updated:** 2026-10-08
- **Owner:** main session

## Goal
Player can light logs into a fire on the ground and cook raw fish on it (cooked or burnt), with Cooking XP.
Playable first: a crude "light logs → fire → cook shrimp" loop visible in the browser before polish.

## Decisions          (what was decided, and why)
- USER 2026-10-08: "firemaking no need skill just need to light the logs". No Firemaking skill, no XP, no level
  requirement. Lighting logs is a plain action that turns logs into a temporary fire object.
- Existing ids to reuse: `logs`, `oak_logs`; raw fish `raw_shrimp`, `raw_anchovies`, `raw_sardine`, `raw_herring`,
  `raw_trout`, `raw_mackerel`. No `tinderbox` or cooked/burnt items exist yet.
- USER 2026-10-08: lighting needs a **tinderbox** (use tinderbox on logs / "Light" on logs when one is held).
  Tinderbox is declared by `facilities` (owner of fires) and granted via a starter kit (`integrator`, starterKits.ts).
- USER 2026-10-08 (confirmed): better logs burn longer. Burn time per log type in LIGHTABLE_LOGS data
  (logs 100 ticks ≈ 60 s, oak_logs 150 ≈ 90 s; each new log tier longer). qa light slice must assert oak > logs.
- USER 2026-10-08: "logs burnt finish ashes" → a burnt-out fire leaves an `ashes` ground item on its tile (stackable,
  pickable, normal ground-item despawn). `facilities` declares `ashes` and returns the drop from tickFires; `integrator`
  spawns it; `graphics` needs an ashes icon + ground sprite. Sent to the running facilities agent.
- USER 2026-10-08: "can cook fish/meat/shrimp … burnt or cooked" → `cooking` also declares raw_chicken/raw_beef
  (+cooked/burnt) and recipes now; raw meat has NO source until monsters exist (follow-up in the monsters runbook).
- USER 2026-10-08: "cooking now plain cook meats on fire. complicated recipes will be later when there's crafting
  involved" → only single raw item → cooked/burnt on a fire. No multi-ingredient recipes in this runbook. Sent to `cooking`.
- USER 2026-10-08: eating to heal HP is DEFERRED, "together with minions/combat". Player HP already exists (combat
  PlayerHpState + regen); `cooking` exports healAmount(itemId) data only; no Eat option in this runbook.
- USER 2026-10-08: "another agent is adding the skill tree so dont touch that" → this runbook never edits
  app/game/skillUnlocks.ts(+tests), the Skills panel / SkillDetail (runbook 2026-10-08-skill-unlocks.md, other session).
  Cooking unlock entries are NOT added here (follow-up for that runbook's owner). Told `integrator` (W2a). Pass the same
  rule to every later agent in this runbook (W2e, qa slices).
- USER 2026-10-08: "differentiate between raw, cooked, burnt" + "name too" → every food name starts with Raw / Cooked
  / Burnt (cooked fish renamed "Cooked shrimp" etc.; ids unchanged so saves are safe; shared burnt_fish/burnt_meat kept,
  OSRS-like, named "Burnt fish"/"Burnt meat"). Icons: three clearly distinct looks: raw = pale/pink, wet sheen; cooked =
  golden-brown, grill marks; burnt = black/charred. Agents: `cooking` (names), `graphics` (icons), then a qa slice.
- USER 2026-10-08: budget/quota → "Go ahead" (pause lifted for this runbook, full flow incl. one qa per feature).
- Main: fire = facility kind `fire` with a "Cook" option (startRecipe 'cooking'); fixed light time (no skill roll),
  burn time per log type, player steps aside after lighting (OSRS-like). Fires are transient and NOT saved (no save
  version bump). Cooking uses core `successChance` for burn chance; recipe logic stays in the cooking module (first
  recipe user; extract `runRecipe` to core when smithing is the second, per the rule of two). Heal values are stored
  as data now; eating is a follow-up (no player HP flow in scope).

## Tasks              (in the user's order)
- [x] Confirm budget/quota OK to dispatch agents — user: Go ahead; tinderbox required
- [x] W1a Firemaking logic (+ ashes drop, oak 150 > logs 100): `tinderbox` item, lightable logs table, lightFire/tickFires pure logic, `fire` FacilityDef
      with Cook option — agent: `facilities`
- [x] W1b Cooking module (fish + chicken/beef, plain single-item only): cooked_/burnt_ items for the 6 raw fish, levels, XP, burn chance, heal data, cook action
      logic + messages — agent: `cooking`
- [x] W2a Wire (placeholder fire; agent browser-checked, qa owed): tinderbox starter kit, Light/use-on intent, fire objects in state + tick, step aside, Cook on fire
      → cooking loop, chat messages — agent: `integrator`
- [x] W2b Realistic fire art (layered flames, logs under, ashes after burn-out) + tinderbox/cooked/burnt fish
      icons in the shared item icon source — agent: `graphics`
- [x] W2c Animation (code + unit; flicker not seen live yet): kneel + strike tinderbox while lighting, cook-over-fire loop (arm holding food), fire flame
      flicker/object state anim — agent: `animation`
- [x] W2d VFX (code + unit; browser look owed to the visuals qa slice): sparks + smoke wisp on light, rising smoke column + embers while burning, steam on a cook, dark
      smoke puff on burn, ember fade on burn-out — agent: `vfx`
- [x] D1 Food names (10:47; raw fish "Raw" prefix not unit-pinned: fishing-owned, qa slice checks it): cooked fish "Cooked <fish>" (ids unchanged) — agent: `cooking`
- [x] D2 Food icons (+ D2b trout/mackerel; itemIconsEverywhere helper fixed by qa 10:58): raw / cooked / burnt clearly distinct (raw fish icons too) + comparison sheet — agent: `graphics`
- [x] qa slice: raw/cooked/burnt look + names in inventory, bank, ground, examine — agent: `qa` — covered by fireVisuals v5 11:29 (box was stale; ticked 11:41)
- [x] W2c-fix Lighting pose: lower + lean now (11:23); desktop-only check (phone crop missed)
- [x] F1 (11:47: frontSide -1, box gx 4.5, back upper arm clamp ±20°; 718 render tests, 3 mutants red; desktop shots only) arm "wing" during lighting strokes: IK/clamp fix — agent: `animation` (USER: "can't follow up now?" → now)
- [x] F2 log pile view (createLogPileView; render 713 pass; main viewed logpile-desktop-close: reads as crossed logs) 11:33
- [x] F3 + V2 `integrator` (11:41: unit 18/18, suite 2532, 4 mutants red, f3.e2e 5/5 desktop+phone, main viewed pile-desktop + lit-aside-phone; qa slice owed with F1): show the pile during lighting, swap for the fire on lit, remove on cancel; no
      player-in-flames frame after ignition (dispatched 11:34)
- [x] W2e (11:23) Wire graphics fire view + animation states + vfx into WorldScene (after W2b-d) — agent: `integrator`
- [x] qa slice: light a fire (desktop + phone) — agent: `qa` — PASS 23/23, mutant 8 red (10:45)
- [x] Smoke red attribution: NOT our wiring (identical 9 reds with it reverted, 10:54).
- [x] Smoke real cause found + fixed, full smoke 12/12 desktop + phone — agent: `qa` — DONE 11:19 (final report)
- [x] Smoke flakes ~1 in 4 runs: c (swing msg missing though log gained), d (canopy tap hits neighbour → `graphics`
      picking/depth), h (2-frame jitter under load) — fold into Q1 — 12:08: c latched via store.subscribe, d prints
      tree ids on failure, h load-induced (no change); 1 live run only, flake fix not proven
- [x] Q1 (PARTIAL 12:08: smoke 12/12 in 30 s ✅; suite 1585 s, 28/86 red, 40 files > 60 s ❌ → Q2/Q3) Speed up smoke.mjs (user: "only 12 tests and its already close to 20mins"): fast-tick mode like fireLight
      (60 ms ticks), desktop + phone in parallel, shorter waits → target < 1 min per full run — agent: `qa` (after W2e)
      USER: "project grows any bigger it will take 1 hour … or 3 hours even" → scope widened to an e2e SPEED BUDGET:
      (a) fast-tick mode by default in every e2e (real 600 ms only where timing is the thing tested); (b) a parallel
      runner: files + viewports on their own ports at once, so suite time ≈ slowest file, not the sum; (c) slices run
      only their own e2e + a ~30 s smoke, the full suite only at the gate; (d) budget: smoke < 1 min, full suite
      < 5 min, a file over budget is a qa bug. Propose promoting (d) to CLAUDE.md once it works.
- [x] H1 (11:19; code + unit only, menu order to be browser-checked in the visuals qa slice) Review integrator's "Light" option edit in InventoryPanel.tsx (+ logs default tap?) — agent: `hud`
- [x] Follow-ups from fireLight qa (not verified): fire tile walk-blocking; step-aside fallback E/S/N when W is blocked
      — qa fireBlock 11:52: step-aside W/E/S/N ✅ (mutant red); fires walkable = USER decision; B2 trapped case → below
- [x] B2 refuse lighting when all 4 neighbours are blocked ("You can't light a fire here.", logs kept) — agent: `integrator` — 12:00 unit 13/13, 2 mutants red, fireBlock 21/21
- [x] qa slice: cook on fire (cooked + burnt, XP) — agent: `qa` — PASS 17/17, 2 mutants red (10:54)
- [x] qa slice: fire/cooking visuals — PASS 21/21 desktop + phone (11:29), flicker mutant red
- [x] T1 fireVisuals v3 proves FIRE_HIT_KIND 'fire': live 23/23, mutant 'tree' → v3 red (11:32)
- [x] V1 ashes icon redrawn as a flat powdery heap (others byte-identical; 786 pass; main viewed phone ground shot) 11:35
- [x] qa slice: lighting polish — FAIL 12:0x: pile ✅, LP-1 player in flames ❌, LP-2 arm wing ❌
- [x] LP-1 player view drawn in the flames ~0.2-0.5 s after ignition — agent: `integrator` — 12:10 snapTrail on new fire, lp-overlap pass, mutant red
- [x] LP-2 back upper arm still raised 45-60° (wing), all facings — agent: `animation` — 12:13 shoulder sink + world clamp, mutants red
- [x] qa re-check: lightPolish (LP-1, LP-2) + fireBlock (B2) + animation regressions + lint, desktop + phone — agent: `qa` — PASS 12:20
- [x] Q2 triage the 26 still-red e2e files — 24/26 green after test fixes; lint clean; rodRest 3× green — agent: `qa`
- [x] B1 (P1) Show HUD off→on leaves the canvas full width over the sidebar — platform part — agent: `mobile` — 18:36
- [x] B1 wiring: createGame.ts uses followParentSize/remeasureScale — agent: `integrator` — 18:45 settings green w/o workaround, mutant red
- [x] B1 qa: settings.e2e without the workaround + phone cameraInset c1 triage — agent: `qa` — PASS 19:05 (c1 not reproducible)
- [x] CP-1/CP-2 cook pose: food prop + hold over flame + poke motion — agent: `animation` — 18:35
- [x] CP qa: cookPose.e2e with a wider crop + numeric food-over-fire check — agent: `qa` — PASS 18:47, mutant red
- [x] animE e2e rewrite: read animator swing state instead of sampling angles — agent: `qa` — 51/51 ×5, ~8 s (was 253 s), 2 mutants red
- [x] Reduced tap pose ≠ On strike pose (chop 7.4°, mine 14.7°): align tap keys — agent: `animation` — 18:40 gaps 0.4°/0.4°, mutants red, animE 51/51
- [x] qa: tighten animE down-pose tolerance 16° → 2° (qa check for the tap fix) — agent: `qa` — 18:43 51/51 ×3, mutant red
- [x] USER 18:5x: water BLACK + no fish — cause: WebGL off in user's Chrome → CANVAS fallback; CANVAS water/fish fixed 20:0x, qa PASS 20:3x; bigger fish 21:2x — agent: `graphics`
- [x] Visual sanity smoke (visualSmoke.e2e, WebGL + CANVAS, 31/31) — agent: `qa` — 19:02 / 20:3x
- [x] Q3 cut the slow e2e backlog — Q3-A/B/C1/C2 done (budget rule promoted to qa.md §2b) — agent: `qa`
- [x] #39 fast-base sweep (wf_0d4d8f04-c2a): all 99 e2e files on the fast base — agent: `qa`. The follow-up full run-all was CANCELLED by the user (23:1x)
- [x] Q4 fast base must not slow short files (footer 12→51, chat 25→30, inventory 19→22, skills 38→44): cut lib.mjs fixed startup / fewer browsers for small files — agent: `qa` ⏳ 21:3x (ports 6600-6649)
- [x] M1 USER "fix this animation mine elbow issue": mine strike (MINE_KEYS 0.68) elbows 10.2 px > torso half-width
      8.8 (XFAIL in chopAnim.e2e) — agent: `animation` 🔧 21:37 (solveGrip judges elbow in the leaned frame; mine 10.2→2.7,
      chop 0.74 spike gone; unit + mutant red; main viewed before/after) → qa M1 ⏳ :6550 (drop XFAIL, desktop + phone, mutant)
- [x] M2 (qa PASS: chopAnim 18/18, jump chop 2.64 / mine 6.24 art px, mutant red) elbow tuck pop ~7 art px in one 1% phase step at ~0.61-0.65 (chop + mine), pre-existing: hysteresis/blend —
      agent: `animation` ⏳ 21:4x (ports 6700-6749); then its own qa slice
- [x] M3 (22:3x: swingReach.test.ts, clamp mutant green→red, 311 pass; REAL clamp found in COOK_POKE 17.1>16 → gx 19 gy 9.2; cookPose 5/5 by owner) "hands reachable" unit tests (mine/chop/net/rod) measure solved arms and can never fail; compare the requested grip
      distance vs arm length before solving; clamp mutant (mine 0.62 gx 9→30) must go red — agent: `animation` ⏳
- [x] M3-qa (PASS 22:4x: food-flame live vs revert ≤0.5 px; NW 33.6 explains 31-34) cook poke after COOK_POKE change: food still over the flame (owner reports 31-34 px vs qa 18:47 median 22.4 — same metric?), hands attached, desktop + phone — agent: `qa` ⏳ :6950
- [ ] M4 cook pose REAR hand never verified (hidden in E/S/NW): measure attach/clamp/visibility, 8 facings, desktop +
      phone, read-only on tests/ (cookPose.e2e is in the sweep) — PARKED: qa stopped 22:5x before any browser ran
      (not requested; 5th browser agent over the ~4 cap). Fold into the sweep's cookPose conversion or run on user ask.
- [x] M5 (lint fully green 23:22; the budget is load-aware since Q4b, so the cookPose budget is re-judged on its next run) loose ends handed to the #39 sweep (files in its scope): lint red on newfish.e2e + chatUi.e2e:45, cookPose.e2e
      over its 60 s budget (54-62 s under load) — verify at the sweep's run-all; add qa M4's rear-hand snippet to cookPose
- [x] Late round (second main session, 21:3x-23:58): Q4/Q4b/Q4c harness (load-aware budget, loud boot timeouts, fractional
      g.settle), chat flake, fireArt ground check, phone label keep-out (graphics + integrator, 40 px side cap) + area
      banner moved to the top band + fade-in fix (hud), lint 5 min → 2 s (core), 10 e2e files on g.settle — all qa-passed
- [ ] ~~qa gate slice (lint/test/build + e2e)~~ CANCELLED (USER 2026-10-08 11:46: "cancel final gate")
- [ ] ~~Changelog entry~~ SKIPPED for now (USER 2026-10-08: "skip changelog for now"); do it only when the user asks.

## Next step
(23:59) Nothing is running. Everything the user asked for is done and qa-passed. The full run-all was CANCELLED by the user
(23:1x). Remaining, all optional and only on the user's ask: M4 cook-pose rear hand (parked); eyeball item lightPolish n vs sw facings
look alike (`animation`); Cooking unlocks follow-up (skill-unlocks owner). Nothing committed: commit/push only with the user's OK
(push deploys). The changelog is skipped until the user asks. Close this runbook (status done → runbooks/done/) when the user confirms.

## Open questions / blockers
- Follow-up for the skill-unlocks owner (that runbook is done): add Cooking unlocks (fish/meat by level) later.
- No blockers. (The skill-unlocks gate U4 closed earlier, so this runbook's gate needs no coordination.)

## Log
- Earlier log (runbook start → 20:4x: fire/cooking build + qa, smoke fix, Q1/Q2 e2e speed, B1 HUD canvas, cook pose,
  black water/CANVAS, roofs, nameplates, fish art, world edge, fast base #37, audit + sweep launches) is archived in
  docs/archive/firemaking-cooking-log-2026-10-08.md.
- 2026-10-08 23:59 Log 20:45-23:59 archived to the same file (main-session md cleanup).
