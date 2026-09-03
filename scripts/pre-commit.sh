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

exit 0
