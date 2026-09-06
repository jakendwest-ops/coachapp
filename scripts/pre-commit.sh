#!/bin/sh
# Tracked pre-commit hook. Install with:
#
#   printf '#!/bin/sh\nexec sh scripts/pre-commit.sh\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#
# .git/hooks is not version-controlled, so a fresh clone has NO pre-commit hook until that line is
# run. That is why this is a convenience, not a guarantee: checks.sh rule 3 stays the verifier at push
# time and refuses an unbumped module whether or not this ever ran.

# Auto-bump the ?v= cache-bust for every staged js/ or css/ file. See scripts/bump-versions.mjs for
# why this is automated -- the short version is that three modules shipped their ownership guards with
# no bump on 2026-08-22, so returning browsers ran the old unguarded code.
if ! node scripts/bump-versions.mjs; then
  # Deliberately NON-BLOCKING, and deliberately loud. A hook that aborts every commit because node is
  # missing or the script threw is worse than one that warns: the author reaches for --no-verify, and
  # then nothing runs at all. Rule 3 still refuses the push, so the failure cannot reach production.
  echo ""
  echo "  [WARN] bump-versions.mjs failed -- cache-busts were NOT auto-bumped for this commit."
  echo "         Committing anyway. checks.sh rule 3 will refuse the push if a changed module's ?v="
  echo "         has not risen, so fix it before pushing."
  echo ""
fi

# ─── Fast static checks that must not reach a commit ────────────────────────────────────────────
#
# WHY THESE TWO, AND WHY AT COMMIT TIME. Measured 2026-09-06: check-escaping runs in 174ms and
# check-handler-targets in 224ms, against a hook that already costs 252ms. Both live in checks.sh,
# which is the PRE-PUSH hook — so a wrong escaper could sit in a commit indefinitely and was caught
# both times it happened (2026-09-05 search box, 2026-09-06 data-ex-name) by a REVIEW AGENT rather
# than by any machinery. Reviews are not guaranteed to run; hooks are.
#
# The escaping one earns its place on its own: escapeAttr in a plain attribute silently corrupts the
# value (it backslash-escapes before HTML-escaping), and on 2026-09-06 that would have made reorder
# propagation quietly skip any exercise whose name contains an apostrophe.
#
# BLOCKING, unlike the bump above — and the distinction is deliberate. The bump warns because its
# failure mode is INFRASTRUCTURE (node missing, script threw), and aborting every commit over that
# teaches --no-verify. These block only on a REAL FINDING: exit 1 means the checker ran and found a
# defect. Any other non-zero means it could not run, which warns and continues, exactly like the bump.
FILES="js/app-core.js js/app-dashboard.js js/app-programs.js js/app-clients.js js/app-calendar-goals.js js/app-workouts.js js/app-runner.js js/app-progress.js js/starter-content.js"

# Only when a module is actually staged — no reason to police files this commit does not touch.
if git diff --cached --name-only | grep -qE '^(js/|index\.html)'; then
  node scripts/check-escaping.mjs $FILES
  ESC=$?
  if [ $ESC -eq 1 ]; then
    echo ""
    echo "  [BLOCKED] Wrong escaper. escapeHtml() for text and PLAIN attributes; escapeAttr() ONLY for"
    echo "            a JS string inside an attribute: onclick=\"fn('\${escapeAttr(x)}')\"."
    echo "            escapeAttr in a plain attribute silently corrupts the value it is meant to protect."
    echo ""
    exit 1
  elif [ $ESC -ne 0 ]; then
    echo "  [WARN] check-escaping.mjs could not run (exit $ESC) -- committing anyway; checks.sh still gates the push."
  fi

  # NOT redirected to /dev/null: when this blocks, the reason has to be visible. Silencing it meant a
  # block showed a generic message with no indication of which handler or which file.
  node scripts/check-handler-targets.mjs index.html $FILES
  HND=$?
  if [ $HND -eq 1 ]; then
    echo ""
    echo "  [BLOCKED] An inline handler names a function that does not exist, or the dynamic-handler"
    echo "            count rose. Run it to see which:"
    echo "              node scripts/check-handler-targets.mjs index.html $FILES"
    echo ""
    exit 1
  elif [ $HND -ne 0 ]; then
    echo "  [WARN] check-handler-targets.mjs could not run (exit $HND) -- committing anyway."
  fi
fi

exit 0
