# Runbook: Enforce agent-only coding

- **Status:** done
- **Started:** 2026-10-07
- **Last updated:** 2026-10-08
- **Owner:** main session

## Goal
Make it mechanically impossible for the main session to write game code, so the project stays
agentic: the main session only plans, dispatches, reviews reports and updates runbooks. Agents
improve themselves from feedback.

## Decisions
- The user approved all four layers: (1) a PreToolUse hook blocking main-session edits to code paths;
  (2) new `integrator` (app/) and `core` (core/ foundations) agents so the main session owns no code;
  (3) every runbook task names the agent that did it; (4) restart before any build so agents
  load by name.
- Main session may edit only: `CLAUDE.md`, `docs/**`, `.claude/**` and memory. Everything else needs an agent.
- `items` and `inventory` became their own agents (user request), leaving `core` with engine,
  contracts, skill machinery, utils and tooling.
- Self-improvement uses Claude Code's native `memory: project` (per agent:
  `.claude/agent-memory/<name>/MEMORY.md`) plus a Learning loop section in every agent file.
- Known limitation: the shell guard is a heuristic. It also blocks the main session's shell commands
  that merely *mention* a code path while writing (e.g. a python script editing a runbook that
  names `src/...`). The main session edits docs with Edit/Write, whose hook checks the real path.

## Tasks
- [x] Find out how a hook can tell the main session apart from a subagent: `agent_id`, present only
      in subagents (claude-code-guide, from the hooks reference)
- [x] Write the hook scripts + register them in `.claude/settings.json`
- [x] Add `integrator` and `core` agent files; move ownership in CLAUDE.md
- [x] CLAUDE.md: enforcement section + agent attribution in the runbook template
- [x] Verify: hook blocks the main session on `src/x.ts`, allows `docs/x.md`, allows a subagent on `src/x.ts`
- [x] (user request) Agent self-improvement: `memory: project` + Learning loop on all agents; feedback
      routing, promotion and retro in CLAUDE.md
- [x] (user request) Split `items` and `inventory` out of `core` into their own agents
- [x] Update runbooks; tell the user to restart

## Next step
The user restarts Claude Code so all 30 agents (and their memory) load by name. Then start a new
runbook for the visual base, built entirely by agents: `core` → (`map`, `movement`, `graphics`,
`items`, `inventory`, `xp`) → `integrator` → `qa`, with each finding routed back to its owner.

## Open questions / blockers
- Not yet verified by running: that Claude Code loads `memory: project` for these agents. Check
  this on the first dispatch after the restart (the agent should see its MEMORY.md).
- The scaffold/core files the main session wrote earlier (package.json, configs, src/core) are
  still on disk. The user said they will remove everything; agents rebuild from scratch.

## Log
- 2026-10-07: Runbook created; the user said "do it".
- 2026-10-07: User asked for agent self-improvement ("if not it is equally pointless"). Added to scope.
- 2026-10-07: items + inventory agents added (30 total). Docs: hook input has `agent_id` only inside
  subagents; mid-session settings hooks are hot-reloaded; frontmatter `memory: project` gives each
  agent `.claude/agent-memory/<name>/MEMORY.md`.
- 2026-10-08: Hooks `.claude/hooks/agents-only.sh` (Edit/Write) and `agents-only-bash.sh` (shell
  writes, npm installs) registered in `.claude/settings.json`. Verified live: main-session Write to
  `src/__hooktest.ts` DENIED; main-session `touch src/__hooktest.ts` DENIED; a general-purpose agent
  created and deleted `src/__agenttest.ts` (ALLOWED). Pipe tests: 8 Edit/Write cases + 14 shell cases pass.
- 2026-10-08: All 30 agents have `memory: project` and a Learning loop section (validated by script,
  30/30 match the CLAUDE.md table). CLAUDE.md gained the Self-improvement section. `security` got
  Write/Edit for its memory file only.
