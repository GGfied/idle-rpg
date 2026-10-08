# QA run log (append-only, real time)

Every qa agent appends ONE line here the moment a run finishes (pass, fail, killed or mutant), before doing anything
else, so no result is lost if the session dies. The main session folds new lines into `docs/qa-coverage.md` as they
land. Never edit or delete earlier lines.

Format: `- HH:MM <slice> <viewport> <live|mutant:what> <N/M pass> <failing check ids or "-"> <log file path> <note>`
Append with a single shell `>>` (e.g. `echo "- $(date +%H:%M) isoTap phone live 17/17 - /path/log.txt" >> <abs path>`),
never by rewriting the file (parallel agents append at the same time).

Older lines: `docs/archive/qa-log-2026-10-08.md`.

