#!/usr/bin/env bash
# PreToolUse (Bash): closes the shell bypass of agents-only.sh. The main session (no `agent_id`)
# may not run commands that write to code paths or change dependencies; agents may.
# Heuristic by design: a write operator/command AND a protected path in the same command.

payload="$(cat)"
[ -n "$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)" ] && exit 0
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",
    permissionDecisionReason:("Agents-only: " + $r + " Dispatch this to the owning agent (see the CLAUDE.md table).")}}'
  exit 0
}

# Dependency changes belong to the `core` agent.
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])(npm|pnpm|yarn)[[:space:]]+(install|i|add|remove|uninstall|update|up)([[:space:]]|$)'; then
  deny "the main session may not change dependencies."
fi

protected='(^|[[:space:]/"'"'"'=])(src/|public/|tests/|\.github/|index\.html|package(-lock)?\.json|tsconfig[^[:space:]]*\.json|vite\.config|eslint\.config|\.prettierrc)'
writes='(>|>>|[[:space:]]tee[[:space:]]|sed[[:space:]]+-i|perl[[:space:]]+-p?i|python3?[[:space:]]|node[[:space:]]+-e|[[:space:]]mv[[:space:]]|[[:space:]]cp[[:space:]]|rm[[:space:]]|touch[[:space:]]|mkdir[[:space:]]|truncate|patch[[:space:]]|git[[:space:]]+(apply|checkout|restore))'
if printf '%s' "$cmd" | grep -Eq "$protected" && printf ' %s' "$cmd" | grep -Eq "$writes"; then
  deny "the main session may not write to code paths from the shell."
fi
exit 0
