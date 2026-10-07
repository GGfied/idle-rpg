#!/usr/bin/env bash
# PreToolUse (Write | Bash), ALL callers incl. subagents: no new source files in the repo root.
#
# Why: agents repeatedly wrote module files into the project root after a failed `cd`, then `mv`-ed them,
# and parallel agents swept each other's files (2026-10-08, 5 incidents). CLAUDE.md rule: mkdir -p the
# absolute module path first and write there directly. This hook makes that mechanical.
# Allowed in the root: existing tooling files (edits) and the allowlist below for new files.

payload="$(cat)"
tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
root="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)}"

deny() {
  jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",
    permissionDecisionReason:("Root guard: " + $r + " Run `mkdir -p` on the ABSOLUTE module path first and write the file there directly (CLAUDE.md, Promoted lessons). Never write to the repo root and move.")}}'
  exit 0
}

allowed_root_file() {
  case "$1" in
    package.json | package-lock.json | tsconfig*.json | vite.config.* | vitest.config.* | eslint.config.* | \
      .prettierrc* | .prettierignore | .gitignore | .nvmrc | index.html | CLAUDE.md | README.md | LICENSE | \
      wrangler.jsonc | wrangler.json | wrangler.toml | CHANGELOG.md | CHANGELOG-[0-9][0-9][0-9][0-9].md) return 0 ;;
  esac
  return 1
}

if [ "$tool" = "Write" ]; then
  file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
  rel="${file#"$root"/}"
  case "$rel" in /* | */*) exit 0 ;; esac          # outside the project, or inside a subfolder: fine
  [ -z "$rel" ] && exit 0
  allowed_root_file "$rel" && exit 0
  [ -e "$root/$rel" ] && exit 0                     # overwriting an existing root file is not a stray
  deny "refusing to create '$rel' in the repo root."
fi

if [ "$tool" = "Bash" ]; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
  cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
  # Only when the shell is in the repo root and the command doesn't cd elsewhere first.
  [ "$cwd" = "$root" ] || exit 0
  printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])cd[[:space:]]' && exit 0
  # A redirect into a bare source filename (no slash) = a write into the root.
  if printf '%s' "$cmd" | grep -Eq '>{1,2}[[:space:]]*["'"'"']?[A-Za-z0-9_.-]+\.(ts|tsx|mts|js|mjs|cjs|css)(["'"'"'[:space:];|&]|$)'; then
    deny "this command writes a source file into the repo root."
  fi
fi
exit 0
