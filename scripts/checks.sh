#!/bin/sh
# CoachApp code quality checks
# Run by: git pre-push hook AND GitHub Actions CI
# Any failure blocks the push / fails the CI job.

FILE="js/app.js"
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

# ── 0. JS syntax check ────────────────────────────────────────────────────────
echo "Checking JS syntax..."
if ! node --check "$FILE" 2>/dev/null; then
  node --check "$FILE" 2>&1 | while IFS= read -r line; do echo "  $line"; done
  fail "JS syntax error in $FILE — app will not load in production"
fi

# ── 1. Wrong column names on known tables ─────────────────────────────────────
echo "Checking column names..."

if grep -n "weight_logs" "$FILE" | grep -q "logged_at"; then
  fail "weight_logs queried with 'logged_at' — column does not exist. Use 'created_at' or 'date'."
fi

if grep -n "workout_logs" "$FILE" | grep -q "\.logged_at"; then
  fail "workout_logs queried with 'logged_at' — column does not exist. Use 'date' or 'created_at'."
fi

if grep -n "coach_notes" "$FILE" | grep -q "from('workout_logs')"; then
  fail "workout_logs has no 'coach_notes' column — use 'notes'."
fi

# ── 2. Unscoped queries on multi-tenant tables ────────────────────────────────
echo "Checking query scoping..."

if grep -A3 "from('clients')" "$FILE" | grep -q "\.select('\*')" && \
   ! grep -A5 "from('clients')" "$FILE" | grep -q "coach_id"; then
  warn "clients query found without coach_id scope — verify RLS is enforcing this."
fi

TEMPLATE_LINES=$(grep -n "from('workout_templates')\.select" "$FILE" | grep -v "eq('id'" | grep -v "\.single()")
if echo "$TEMPLATE_LINES" | grep -v "coach_id" | grep -q "select"; then
  warn "workout_templates query may be missing coach_id scope — check each instance."
fi

if grep -n "from('programs')\.select" "$FILE" | grep -v "eq('id'" | grep -v "single" | grep -qv "coach_id"; then
  warn "programs query may be missing coach_id scope."
fi

# ── 3. Cache bust — app.js version must match index.html ─────────────────────
echo "Checking cache bust..."

HTML_VER=$(grep -o "app\.js?v=[0-9]*" index.html | grep -o "[0-9]*$")
if [ -z "$HTML_VER" ]; then
  fail "index.html does not have a ?v=N version on app.js script tag."
else
  echo "  app.js version in index.html: v=$HTML_VER"
fi

# ── 4. No bare alert() calls ──────────────────────────────────────────────────
echo "Checking for bare alert() calls..."
ALERTS=$(grep -n "alert(" "$FILE" | grep -v "//")
if [ -n "$ALERTS" ]; then
  fail "bare alert() found — use showToast() or inline error elements instead:"
  echo "$ALERTS" | head -5 | sed 's/^/    /'
fi

# ── 5. No hardcoded UUIDs or emails ──────────────────────────────────────────
echo "Checking for hardcoded IDs..."
HARDCODED=$(grep -n "'[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}'" "$FILE" | grep -v "//")
if [ -n "$HARDCODED" ]; then
  warn "hardcoded UUID(s) found — should these be dynamic?"
  echo "$HARDCODED" | head -3 | sed 's/^/    /'
fi

HARDCODED_EMAIL=$(grep -n "'[a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]*\.[a-zA-Z]*'" "$FILE" | grep -v "placeholder\|example\|//")
if [ -n "$HARDCODED_EMAIL" ]; then
  warn "hardcoded email(s) found:"
  echo "$HARDCODED_EMAIL" | head -3 | sed 's/^/    /'
fi

# ── 6. set_type in inserts ────────────────────────────────────────────────────
# workout_log_sets has a DB check constraint that rejects unknown set_type values.
# Omit set_type entirely and let the DB use its default.
echo "Checking for set_type in inserts..."
SET_TYPE=$(grep -n "set_type:" "$FILE" | grep -v "//")
if [ -n "$SET_TYPE" ]; then
  fail "set_type: found — workout_log_sets check constraint rejects unknown values. Remove it."
  echo "$SET_TYPE" | head -5 | sed 's/^/    /'
fi

# ── 7. Silent write errors ────────────────────────────────────────────────────
# if (setsErr) with no return/throw means error is logged but success path runs.
echo "Checking for swallowed write errors..."
SILENT=$(grep -n "if (setsErr) log\." "$FILE" | grep -v "return\|throw\|setsHadError\|fetch failed\|load failed\|select\|SELECT")
if [ -n "$SILENT" ]; then
  fail "if (setsErr) log.error with no abort — write error swallowed, success path still runs:"
  echo "$SILENT" | head -5 | sed 's/^/    /'
fi

# ── 8. Bare clearInterval() ───────────────────────────────────────────────────
# clearInterval(x) cancels the timer but leaves x as a truthy numeric ID.
# Any if(x) guard then fires forever. Always use: x = clearTimer(x)
# Exceptions: inside clearTimer definition, and optional-chain calls in discardRunner.
echo "Checking for bare clearInterval calls..."
BARE_CLEAR=$(grep -n "clearInterval(" "$FILE" | grep -v "clearTimer\|_runner?\.\|://")
if [ -n "$BARE_CLEAR" ]; then
  fail "bare clearInterval() found — use 'x = clearTimer(x)' instead so the variable is nulled:"
  echo "$BARE_CLEAR" | head -5 | sed 's/^/    /'
fi

# ── 9a. PII in console logs ───────────────────────────────────────────────────
# Emails, real names, weight values, and health data must never appear in log
# calls — they end up in the browser console and can be captured by extensions.
echo "Checking for PII in log calls..."
PII_LOGS=$(grep -n "log\.\(info\|ok\|warn\|error\)(" "$FILE" | grep -iE "\{ email|\bemail\b.*\}|full_name|, row\b|weight_kg.*weight\b|body_fat|{ name: [a-z]" | grep -v "clientId\|userId\|date\|//")
if [ -n "$PII_LOGS" ]; then
  fail "PII found in log call(s) — strip email/name/weight values, log IDs only:"
  echo "$PII_LOGS" | head -5 | sed 's/^/    /'
fi

# ── 9a. Timed set guard — repsMin must never be rendered as 'reps' on same line ─
# The bug: s.repsMin used to be emitted as '90 reps' for timed sets because the
# timed check was missing. After the fix, repsStr is only derived when !s.timed.
# If repsMin and ' reps' appear on the same line it means the guard was removed.
echo "Checking timed set guard..."
TIMED_REPS=$(grep -n "repsMin.*' reps'" "$FILE")
if [ -n "$TIMED_REPS" ]; then
  fail "repsMin rendered as ' reps' on same line — missing timed guard (timed sets will show '90 reps' instead of '1:30'):"
  echo "$TIMED_REPS" | head -3 | sed 's/^/    /'
fi

# ── 9. Duplicate function definitions ────────────────────────────────────────
echo "Checking for duplicate function names..."
DUPES=$(grep -o "^function [a-zA-Z][a-zA-Z0-9_]*" "$FILE" | awk '{print $2}' | sort | uniq -d)
if [ -n "$DUPES" ]; then
  fail "duplicate function definition(s) found: $DUPES"
fi

# ── Result ────────────────────────────────────────────────────────────────────
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
