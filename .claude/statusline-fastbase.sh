#!/bin/bash
# Status line: e2e files VERIFIED on the qa fast base (a "compliant" progress line was written after a green run).
# Runs locally on each status refresh; sends nothing to the model.
cat >/dev/null
P=/Users/Derrick/Projects/idle-rpg/docs/agent-progress.md
D=/Users/Derrick/Projects/idle-rpg/tests/e2e
total=$(ls "$D"/*.e2e.mjs "$D"/smoke.mjs 2>/dev/null | grep -vc TEMPLATE)
done=$(grep -E "compliant" "$P" 2>/dev/null | grep -oE "[A-Za-z0-9]+(\.e2e\.mjs)? [0-9?.]+ ?->" | grep -oE "^[A-Za-z0-9]+" | sort -u | wc -l | tr -d ' ')
on=0
for f in "$D"/*.e2e.mjs "$D"/smoke.mjs; do
  case "$f" in *TEMPLATE*) continue ;; esac
  grep -q budgetMs "$f" && grep -qE "withGame|runParallel|forEachCombo|splitViewports" "$f" && on=$((on+1))
done
echo "fastbase: $on/$total touched, $done verified this sweep"
