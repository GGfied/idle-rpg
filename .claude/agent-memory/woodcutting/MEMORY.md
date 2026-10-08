# woodcutting memory
- 2026-10-08: tests/balance is NOT in vitest include and console.log is suppressed; run in a scratch copy with include overridden + --testTimeout=120000 and write results to a file. Balance rule: oak xp/h must beat tree at lvl 15-99 (pinned analytically in logic.test.ts; oak now 45xp, 48/150).
- 2026-10-08: core gathering now refuses a full bag at start (err inventoryFull, no roll); mid-session fill stops on first success roll. Test both.
- 2026-10-08: GatherDef ids must equal world spawn defIds ('tree', 'oak_tree'); node instance ids are separate (tree_1..).
- 2026-10-08: tickGathering rng order per attempt: chance(success), rollTable, chance(deplete) -> scriptedRng([s, t, d]); cooldown N means attempt on Nth tick after start.
- 2026-10-08: Worked: `mkdir -p` + absolute paths; `prettier --write` then check; tsc/eslint/vitest scoped to the folder.
- 2026-10-08: core event shapes gain optional fields (gatherStopped defId/requiredLevel/tool); prefer toMatchObject over toEqual on events so additive changes do not break tests.
