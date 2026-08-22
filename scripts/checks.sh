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

# -- 2. Unscoped queries on multi-tenant tables --
echo "Checking query scoping..."

if grep -A3 "from('clients')" $FILES | grep -q "\.select('\*')" && \
   ! grep -A5 "from('clients')" $FILES | grep -q "coach_id"; then
  warn "clients query found without coach_id scope -- verify RLS is enforcing this."
fi

TEMPLATE_LINES=$(grep -n "from('workout_templates')\.select" $FILES | grep -v "eq('id'" | grep -v "\.single()")
if echo "$TEMPLATE_LINES" | grep -v "coach_id" | grep -q "select"; then
  warn "workout_templates query may be missing coach_id scope -- check each instance."
fi

if grep -n "from('programs')\.select" $FILES | grep -v "eq('id'" | grep -v "single" | grep -qv "coach_id"; then
  warn "programs query may be missing coach_id scope."
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

# -- 3. Cache bust -- all module files must have ?v= in index.html --
echo "Checking cache bust..."
MISSING_VER=""
for module in app-core app-dashboard app-programs app-clients app-calendar-goals app-workouts app-runner app-progress; do
  if ! grep -q "${module}\.js?v=[0-9]" index.html; then
    MISSING_VER="$MISSING_VER $module"
  fi
done
if [ -n "$MISSING_VER" ]; then
  fail "index.html missing ?v=N on:$MISSING_VER"
else
  echo "  All module script tags have ?v= cache busters."
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
HARDCODED=$(grep -n "'[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}'" $FILES | grep -v "//")
if [ -n "$HARDCODED" ]; then
  warn "hardcoded UUID(s) found -- should these be dynamic?"
  echo "$HARDCODED" | head -3 | sed 's/^/    /'
fi

HARDCODED_EMAIL=$(grep -n "'[a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]*\.[a-zA-Z]*'" $FILES | grep -v "placeholder\|example\|//")
if [ -n "$HARDCODED_EMAIL" ]; then
  warn "hardcoded email(s) found:"
  echo "$HARDCODED_EMAIL" | head -3 | sed 's/^/    /'
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

# -- 10. Playwright smoke tests --
if [ "${CI}" = "true" ]; then
  echo "Playwright: skipped in CI (pre-push hook only)"
else
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
