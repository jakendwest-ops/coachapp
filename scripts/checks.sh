#!/bin/sh
# CoachApp code quality checks
# Run by: git pre-push hook AND GitHub Actions CI
# Any failure blocks the push / fails the CI job.

FILES="js/app-core.js js/app-dashboard.js js/app-programs.js js/app-clients.js js/app-calendar-goals.js js/app-workouts.js js/app-runner.js js/app-progress.js js/starter-content.js"
ERRORS=0

fail() {
  echo "  [FAIL] $1"
  ERRORS=$((ERRORS + 1))
}

warn() {
  echo "  [WARN] $1"
}

echo ""
echo "=== CoachApp pre-push bug check ==="
echo ""

# -- 0. JS syntax check --
echo "Checking JS syntax..."
for f in $FILES; do
  if ! node --check "$f" 2>/dev/null; then
    node --check "$f" 2>&1 | while IFS= read -r line; do echo "  $line"; done
    fail "JS syntax error in $f -- app will not load in production"
  fi
done

# -- 1. Wrong column names on known tables --
echo "Checking column names..."

if grep -n "weight_logs" $FILES | grep -q "logged_at"; then
  fail "weight_logs queried with 'logged_at' -- column does not exist. Use 'created_at' or 'date'."
fi

if grep -n "workout_logs" $FILES | grep -q "\.logged_at"; then
  fail "workout_logs queried with 'logged_at' -- column does not exist. Use 'date' or 'created_at'."
fi

if grep -n "coach_notes" $FILES | grep -q "from('workout_logs')"; then
  fail "workout_logs has no 'coach_notes' column -- use 'notes'."
fi

# -- 2. Unscoped queries on multi-tenant tables -- BLOCKING since 2026-08-25 --
# Delegated to scripts/check-query-scope.mjs -- see that file for why this cannot be an inline grep.
#
# This was three warn-only sub-checks for months, covering the project's MOST-SHIPPED bug class (four
# separate solo/coach_id scoping bugs). Measuring before flipping is what stopped that being a
# disaster: the three sub-checks reported four "violations" on a clean tree, every one a FALSE
# POSITIVE, and the clients sub-check was structurally incapable of ever firing. Flipping them as
# written would have blocked every push by refusing correct code -- on the rule most in need of teeth.
#
# The self-test runs FIRST and blocks on its own failure. A checker nothing verifies is exactly the
# decorative sub-check this replaces; running it here is what keeps that from recurring.
echo "Checking query scoping..."
if ! node scripts/check-query-scope.selftest.mjs > /dev/null 2>&1; then
  node scripts/check-query-scope.selftest.mjs 2>&1 | sed 's/^/    /'
  fail "check-query-scope self-test FAILED -- the scoping gate can no longer be trusted, fix it before relying on the result below."
fi
if ! node scripts/check-query-scope.mjs $FILES; then
  fail "multi-tenant query with no ownership anchor -- see the lines above."
fi

# -- 2b. Truthy tests on fields where 0 is a LEGITIMATE value --
# A RATCHET, not a cleanup: this class is currently at ZERO violations, so it can only ever fire on
# a regression. Scoped deliberately to the fields where 0 genuinely means something -- weight (an
# unloaded/bodyweight set), order_index and session_order (0 is the FIRST item, not a missing one),
# and tier. Fields where 0 is meaningless (reps, duration) are excluded: `if (!reps)` is correct
# there, and flagging it would be the false-refusal failure this project keeps shipping.
# The original bug hit 4 sites in one go on the runner's weight save path (2026-07-29).
# The character class here is deliberately plain [A-Za-z_.] — an earlier version wrote
# [a-zA-Z_.\[\]'] which is MALFORMED in POSIX ERE (a backslash is not an escape inside a bracket
# expression), so the rule matched nothing and passed silently. It was caught only by neutering a
# real file and watching the check NOT fire.
echo "Checking truthy tests on fields where zero is meaningful..."
ZERO_HITS=$(grep -nE "if \(!?[A-Za-z_.]*(weight|order_index|session_order|orderIndex|sessionOrder|tier)\)" $FILES)
if [ -n "$ZERO_HITS" ]; then
  echo "$ZERO_HITS" | while IFS= read -r line; do echo "    $line"; done
  fail "truthy test on a field where 0 is legitimate -- use an explicit null/undefined check (x == null), not !x"
fi

# -- 3. Cache bust -- a CHANGED module's ?v= must RISE, not merely exist --
# The old rule only asserted a ?v= was PRESENT. On 2026-08-22 three modules shipped their
# ownership guards with no bump at all and this rule passed on every one of those pushes --
# a returning browser ran the OLD, UNGUARDED code while index.html said nothing had changed.
# It also hardcoded 8 modules and omitted starter-content.js, which had never been checked.
#
# Base resolution -- a base that resolves to HEAD itself can NEVER show a diff, so it is
# treated as unusable everywhere it could occur, not just for one source:
#   1. An explicit $CB_BASE from the environment, if it resolves and differs from HEAD.
#      CI sets this from the push event's true previous commit (see deploy.yml) because on
#      a push-triggered run origin/master IS the commit that was just pushed -- diffing
#      against it is always empty and would silently report a pass on every single push.
#   2. origin/master, if it resolves and differs from HEAD (the local pre-push case).
#   3. HEAD~1, if it exists (covers a CI re-run, or any run against an already-pushed HEAD).
#      NOTE: HEAD~1 only sees the single most-recent commit -- on a multi-commit push
#      whose chain falls all the way here, an earlier commit's stale bump could be
#      invisible. This path is only reached when neither $CB_BASE nor origin/master are
#      usable, which should be rare in practice. Known, bounded weakness -- not solved
#      here; walking back to the true push base without an event.before is out of scope.
#   4. Otherwise: [SKIP] -- never a silent pass.
echo "Checking cache bust..."
# Guarded: an unguarded `$(git rev-parse HEAD)` that ever fails or returns empty (no
# `set -e` in this script -- a failed assignment does not abort) would make CB_HEAD_SHA
# the empty string, degrading cb_usable()'s equality test to `[ "<any-sha>" != "" ]`,
# which is TRUE -- a self-referential base would then be silently ACCEPTED. A missing
# HEAD means the comparison cannot be made at all, so this must be a [SKIP], not a pass.
CB_HEAD_SHA=$(git rev-parse --verify --quiet HEAD 2>/dev/null)

if [ -z "$CB_HEAD_SHA" ]; then
  echo "  [SKIP] HEAD does not resolve -- cannot check cache bust. This is a SKIP, not a pass."
else
  # Verifies the ref/SHA is a real, reachable COMMIT (not just a syntactically well-formed
  # string) and that it differs from HEAD. `git rev-parse --verify X` alone is NOT enough --
  # it accepts a well-formed-but-nonexistent SHA like the all-zeroes sentinel git uses for
  # "no previous commit" (a branch's first push, some force-pushes) with exit 0. That let a
  # nonexistent CB_BASE slip through to the diff loop, which then failed 10x with
  # "fatal: bad object" and still printed the pass text -- the same false-pass class this
  # whole rule exists to close, reached through a different door. Peeling to ^{commit}
  # forces git to confirm the object actually exists.
  cb_usable() {
    [ -n "$CB_HEAD_SHA" ] || return 1   # belt and braces -- never accept without a real HEAD
    CB_CANDIDATE_SHA=$(git rev-parse --verify --quiet "$1^{commit}" 2>/dev/null) || return 1
    [ "$CB_CANDIDATE_SHA" != "$CB_HEAD_SHA" ]
  }

  if [ -n "$CB_BASE" ] && ! cb_usable "$CB_BASE"; then
    echo "  [WARN] CB_BASE=$CB_BASE does not resolve to an existing commit, or resolves to HEAD itself -- ignoring it, auto-detecting instead."
    CB_BASE=""
  fi
  if [ -z "$CB_BASE" ]; then
    if cb_usable origin/master; then
      CB_BASE=origin/master
    elif cb_usable HEAD~1; then
      CB_BASE=HEAD~1
    fi
  fi

  if [ -z "$CB_BASE" ]; then
    echo "  [SKIP] no usable base to diff against (checked \$CB_BASE, origin/master, HEAD~1) -- cannot check cache bust. This is a SKIP, not a pass."
  else
    echo "  Diffing against base: $CB_BASE"
    CB_BAD=""
    for f in js/*.js css/main.css; do
      git diff --quiet "$CB_BASE" HEAD -- "$f" && continue          # unchanged, nothing to check
      old=$(git show "$CB_BASE:index.html" 2>/dev/null | grep -oE "${f}\?v=[0-9]+" | grep -oE '[0-9]+$')
      new=$(grep -oE "${f}\?v=[0-9]+" index.html | grep -oE '[0-9]+$')
      if [ -z "$new" ]; then CB_BAD="$CB_BAD $f(no-tag)"; continue; fi
      if [ -z "$old" ]; then continue; fi                            # new file, nothing to compare
      if [ "$new" -le "$old" ]; then CB_BAD="$CB_BAD $f($old->$new)"; fi
    done
    if [ -n "$CB_BAD" ]; then
      fail "changed file(s) whose ?v= did not rise:$CB_BAD -- a cached browser will run the OLD code"
    else
      echo "  Every changed module's ?v= rose."
    fi
  fi
fi

# -- 3b. Style-literal ratchet -- a file's count must never RISE --
# --radius has existed for months and the code still drifted to 18 distinct radius
# values, including three spellings of "fully round" (99px/100px/999px). Tokens
# without enforcement demonstrably do not hold, so this ships BEFORE the conversion.
# PER-FILE, not a global total: one total would let ten literals added to the runner
# be offset by ten removed from clients. A file with no baseline entry gets 0, so a
# new module carrying literals fails immediately -- allowlist, not denylist.
# var(...) is stripped BEFORE counting: the fallback form var(--danger, #ef4444)
# would otherwise be miscounted as unconverted work (verified 2026-08-22).
echo "Checking style-literal ratchet..."
SB=scripts/style-baseline.json
if [ ! -f "$SB" ]; then
  fail "$SB is missing -- the ratchet cannot run, and a missing baseline is not a pass"
else
  SB_BAD=""
  for f in js/*.js css/main.css; do
    n=$(sh scripts/style-count.sh "$f")
    b=$(grep -oE "\"$(echo "$f" | sed 's#/#\\/#g')\"[[:space:]]*:[[:space:]]*[0-9]+" "$SB" | grep -oE '[0-9]+$')
    [ -z "$b" ] && b=0
    if [ "$n" -gt "$b" ]; then SB_BAD="$SB_BAD $f($b->$n)"; fi
  done
  if [ -n "$SB_BAD" ]; then
    fail "style literals INCREASED:$SB_BAD -- use a token from css/main.css, or lower the baseline if you converted"
  else
    echo "  No file exceeds its style-literal baseline."
  fi
fi

# -- 3c. Every var(--x) referenced in js/ must be DEFINED in css/main.css --
# An undefined custom property does NOT error. The declaration is silently dropped and the
# element falls back to its inherited value, so it looks plausible and nothing reports.
# Found 2026-08-22: js/app-progress.js used `var(--surface2)` for a table-row background --
# the token is `--surface-2`. Pre-existing, invisible, and the design-token test could not
# catch it: that test asserts every token DEFINED resolves, never that a token REFERENCED
# exists. This matters more since the tokenisation added ~770 new var() references; those
# carry a `var(--token, <literal>)` fallback, but a bare var(--x) written by hand later
# does not, and nothing else is checking.
echo "Checking var(--token) references resolve..."
VT_USED=$(grep -ohE 'var\(--[a-z0-9-]+' js/*.js | sed 's/var(//' | sort -u)
VT_DEF=$(grep -ohE '^[[:space:]]*--[a-z0-9-]+:' css/main.css | tr -d ' :' | sort -u)
VT_BAD=$(echo "$VT_USED" | while IFS= read -r t; do
  [ -n "$t" ] || continue
  echo "$VT_DEF" | grep -qxF -- "$t" || echo "$t"
done)
if [ -n "$VT_BAD" ]; then
  echo "$VT_BAD" | while IFS= read -r t; do echo "    $t"; done
  fail "var() references a token css/main.css does not define -- the declaration is silently dropped"
else
  echo "  Every var(--token) referenced in js/ is defined."
fi

# -- 4. No bare alert() calls --
echo "Checking for bare alert() calls..."
ALERTS=$(grep -n "alert(" $FILES | grep -v "//")
if [ -n "$ALERTS" ]; then
  fail "bare alert() found -- use showToast() or inline error elements instead:"
  echo "$ALERTS" | head -5 | sed 's/^/    /'
fi

# -- 5. No hardcoded UUIDs or emails --
echo "Checking for hardcoded IDs..."
# BLOCKING since 2026-08-25. A RATCHET, not a cleanup: measured at ZERO violations when flipped, so
# it can only ever fire on a regression. That is the whole reason this one was safe to make hard while
# the email sub-check below needed real code changes first -- flip what is already clean, fix what is
# not, never flip a rule onto an existing violation and call it enforcement.
HARDCODED=$(grep -n "'[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}'" $FILES | grep -v "//")
if [ -n "$HARDCODED" ]; then
  fail "hardcoded UUID(s) found -- resolve identifiers at query time, never pin a row id in shipped JS:"
  echo "$HARDCODED" | head -5 | sed 's/^/    /'
fi

# BLOCKING since 2026-08-25. This one had 3 real violations when measured, so it was NOT simply
# flipped: the code was fixed first (one OWNER_EMAIL constant + _isOwnerAccount() in app-core.js,
# replacing the same literal pasted at three call sites), and only then did the rule get teeth.
#
# Exactly ONE definition site is sanctioned, and it is named here rather than marked in the source so
# that adding a second copy requires editing this gate — a deliberate act, not an oversight.
HARDCODED_EMAIL=$(grep -n "'[a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]*\.[a-zA-Z]*'" $FILES \
  | grep -v "placeholder\|example\|//" \
  | grep -v "const OWNER_EMAIL =")
if [ -n "$HARDCODED_EMAIL" ]; then
  fail "hardcoded email(s) found -- route through _isOwnerAccount() rather than pasting the literal again:"
  echo "$HARDCODED_EMAIL" | head -5 | sed 's/^/    /'
fi

# -- 6. set_type in inserts --
echo "Checking for set_type in inserts..."
SET_TYPE=$(grep -n "set_type:" $FILES | grep -v "//")
if [ -n "$SET_TYPE" ]; then
  fail "set_type: found -- workout_log_sets check constraint rejects unknown values. Remove it."
  echo "$SET_TYPE" | head -5 | sed 's/^/    /'
fi

# -- 7. Silent write errors --
echo "Checking for swallowed write errors..."
SILENT=$(grep -n "if (setsErr) log\." $FILES | grep -v "return\|throw\|setsHadError\|fetch failed\|load failed\|select\|SELECT")
if [ -n "$SILENT" ]; then
  fail "if (setsErr) log.error with no abort -- write error swallowed, success path still runs:"
  echo "$SILENT" | head -5 | sed 's/^/    /'
fi

# -- 8. Bare clearInterval() --
echo "Checking for bare clearInterval calls..."
BARE_CLEAR=$(grep -n "clearInterval(" $FILES | grep -v "clearTimer\|_runner?\.\|://")
if [ -n "$BARE_CLEAR" ]; then
  fail "bare clearInterval() found -- use 'x = clearTimer(x)' instead so the variable is nulled:"
  echo "$BARE_CLEAR" | head -5 | sed 's/^/    /'
fi

# -- 9a. PII in console logs --
# Delegated to scripts/check-pii-logs.mjs on 2026-08-22 — see that file for why this is not an inline
# grep. Short version: the shell rule ended `| grep -v "clientId\|userId\|date\|//"`, and that
# exclusion applied to the whole LINE rather than to the PII match. So any log call carrying an id
# ALONGSIDE PII was silently exempt — and `log.<level>(fn, msg, { clientId })` is the commonest log
# shape in this codebase. Proven with a positive control: `{ full_name: n }` fired, and
# `{ clientId, full_name: n }` did not. The rule was structurally blind to the shape the newest code
# is written in. Identical failure, identical fix, as rule 9d below.
echo "Checking for PII in log calls..."
if ! node scripts/check-pii-logs.mjs $FILES; then
  fail "PII found in log call(s) -- strip email/name/weight values, log IDs only"
fi

# -- 9b. Timed set guard --
echo "Checking timed set guard..."
TIMED_REPS=$(grep -n "repsMin.*' reps'" $FILES)
if [ -n "$TIMED_REPS" ]; then
  fail "repsMin rendered as ' reps' on same line -- missing timed guard:"
  echo "$TIMED_REPS" | head -3 | sed 's/^/    /'
fi

# -- 9c. Duplicate function definitions --
echo "Checking for duplicate function names..."
DUPES=$(grep -h "^function [a-zA-Z][a-zA-Z0-9_]*" $FILES | awk '{print $2}' | sort | uniq -d)
if [ -n "$DUPES" ]; then
  fail "duplicate function definition(s) found: $DUPES"
fi

# -- 9d. Unescaped free-text interpolation (stored-XSS class) --
# Delegated to scripts/check-escaping.mjs — see that file for why this is not an inline grep.
# Short version: the rule needs per-MATCH (not per-line) extraction, has to know that a line building
# no markup is not a sink, and has to know that escapeAttr is the WRONG primitive in a plain
# value="" attribute. Two inline-grep versions got one of those wrong each, and both reported clean
# while real sinks sat in the tree.
echo "Checking for unescaped free-text interpolation..."
if ! node scripts/check-escaping.mjs $FILES; then
  fail "unescaped free-text interpolation(s) -- see the paths above"
fi

# -- 9e. Consent policy version must match the policy document -- BLOCKING from 2026-08-25 --
# Delegated to scripts/check-policy-version.mjs. js/app-core.js already carried this rule as a
# COMMENT ("MUST match ... bump both together") -- a prose obligation with no writer, which is the
# class OS v3 exists to close. The two agreed when this landed; nothing made them keep agreeing.
#
# The failure is silent and it is a COMPLIANCE failure: _needsConsent() re-prompts only when
# consent_policy_version !== PRIVACY_POLICY_VERSION, so editing the policy without bumping the
# constant leaves every user consented to a document they never saw, with no symptom anywhere.
#
# Measured before being given teeth (les-082): it reports ZERO violations on a clean tree, so this
# is a pure ratchet -- it can only ever fire on a real regression, never on existing correct code.
# Self-test runs FIRST and blocks on its own failure, same as rule 2, and includes a LIVE case
# asserting both real paths resolve (les-083 -- fixtures prove logic, only the repo proves plumbing).
echo "Checking consent policy version..."
if ! node scripts/check-policy-version.selftest.mjs > /dev/null 2>&1; then
  node scripts/check-policy-version.selftest.mjs 2>&1 | sed 's/^/    /'
  fail "check-policy-version self-test FAILED -- the consent-version gate can no longer be trusted."
fi
if ! node scripts/check-policy-version.mjs; then
  fail "privacy policy version drift -- see above. Consent re-prompting is broken until both agree."
fi

# -- 10. Playwright smoke tests --
#
# 2026-08-29: until today a dead :3001 made this step fail all 57 smoke tests and print
# "Fix tests before pushing" -- naming the wrong cause entirely. playwright.config.js now carries a
# webServer block (so the server is started if absent) plus a globalSetup that asserts the served
# page is CoachApp and not merely a 200, because a stale .claude/launch.json can serve a different
# app on that port. Both apply here automatically, since this invocation uses the same config.
#
# The precondition's own self-test runs FIRST and blocks on its own failure, matching rule 2's
# pattern above: a check that has only ever been seen to PASS cannot be distinguished from one
# incapable of failing. It drives the precondition through all four states (down / 500 / wrong app
# / correct) on a spare port, so it never touches a real preview server.
if [ "${CI}" = "true" ]; then
  echo "Playwright: skipped in CI (pre-push hook only)"
else
  echo "Checking the preview-server precondition..."
  if ! node scripts/check-preview-server.selftest.mjs > /dev/null 2>&1; then
    node scripts/check-preview-server.selftest.mjs 2>&1 | sed 's/^/    /'
    fail "check-preview-server self-test FAILED -- the suite's server precondition can no longer be trusted, so a dead or wrong server would again be reported as failing tests."
  fi
  echo "Running Playwright smoke tests..."
  if npx playwright test tests/runner.spec.js tests/solo-account.spec.js --reporter=line 2>&1; then
    echo "  Playwright: passed"
  else
    echo ""
    fail "Playwright smoke tests failed -- push blocked. Fix tests before pushing."
  fi
fi

# -- Result --
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "=== $ERRORS error(s) found. Fix before pushing. ==="
  echo ""
  exit 1
else
  echo "=== All checks passed. ==="
  echo ""
  exit 0
fi
