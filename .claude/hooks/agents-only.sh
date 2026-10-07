#!/usr/bin/env bash
# PreToolUse (Edit|Write|NotebookEdit|MultiEdit): the main session writes no code.
#
# Claude Code puts `agent_id` in hook input only for tool calls made inside a subagent. With no
# agent_id, the caller is the main session, which may edit only CLAUDE.md, docs/** and .claude/**.
# Everything else must be dispatched to the owning agent (see the CLAUDE.md agent table).
# Fails closed: unparseable input from the main session is denied.

payload="$(cat)"
agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
[ -n "$agent_id" ] && exit 0

file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)"
root="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)}"
rel="${file#"$root"/}"

case "$rel" in
  /*) exit 0 ;;                                  # outside the project (memory, scratchpad): not ours to police
  CLAUDE.md | CHANGELOG.md | CHANGELOG-[0-9][0-9][0-9][0-9].md | docs/* | .claude/*) exit 0 ;;  # changelogs: main session (changelog skill)
esac

jq -cn --arg f "$rel" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("Agents-only: the main session may not edit " + $f + ". Dispatch it to the owning agent from the CLAUDE.md table (Agent tool or Workflow), and record the agent in the runbook.")
  }
}'
