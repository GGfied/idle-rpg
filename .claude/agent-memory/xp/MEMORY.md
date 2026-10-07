# xp memory
- 2026-10-08: tsconfig has noUncheckedIndexedAccess; table lookups need `?? 0`. Run tsc before reporting.
- 2026-10-08: Design: one levelUp event per level crossed; addXp emits nothing at cap; Requirement.skill is a plain string, validate with isSkillId.
- 2026-10-08: save slice ignores unknown keys (forgiving for removed skills), rejects bad values for known ones; always use Object.hasOwn on untrusted input.
- 2026-10-08: combatLevel/xpToNextLevel/levelProgress added; hand-compute expected values with care (my xpToNextLevel(83) guess of 88 was wrong, it is 174-83=91). Check sed with `|` delimiters: use python for edits containing `|`. Prove tests by mutation (dropping floor(prayer/2) fails the prayer 5 case).
- 2026-10-08: SkillDef.color (hex) is the single source of skill colours; skillColor(id) returns FALLBACK_SKILL_COLOR for unknown ids (no throw). Mutation-checked.
