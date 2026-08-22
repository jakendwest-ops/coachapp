#!/bin/sh
# scripts/style-count.sh -- the ONLY place the style-literal counting pattern may live.
#
# WHY THIS IS A SEPARATE FILE: the counting pipeline (strip var(...), then grep for
# font-size / border-radius / hex-color) was duplicated SIX times -- once in
# checks.sh's rule 3b, and five more as copy-pasted bash blocks in the design-tokens
# plan (each recomputing a module's count after conversion, for Tasks 5-7, and
# writing the result into scripts/style-baseline.json). One copy drifted stricter
# than the others -- case-sensitive, colon immediately after the property name --
# and it went unnoticed until an audit on 2026-08-22 caught it. If the baseline
# generator and this ratchet's counter ever again run two DIFFERENT patterns, the
# generator can write a LOWER baseline than this counter then produces on the exact
# same file, and checks.sh fails the very commit meant to lower the baseline
# cleanly -- a self-inflicted CI break, not a real regression. Six synchronised
# copies is not a fix for that; one shared script is.
#
# Two rules this script must keep, always, in the one place they now live:
#   1. Strip var(...) BEFORE counting -- the fallback form var(--danger, #ef4444)
#      (or a nested var(--a, var(--b, 13px))) contains a literal that must not be
#      counted as unconverted work.
#   2. Match case-insensitively, with optional whitespace on BOTH sides of the
#      colon -- `font-size : 13px` and `FONT-SIZE:13px` are both legal CSS.
#
# Usage: sh scripts/style-count.sh <path>   -- prints one integer to stdout, nothing
# else. Not marked executable on purpose: this tree is on Windows/OneDrive where
# mode bits are unreliable, so every caller invokes it as `sh scripts/style-count.sh`.

f="$1"
sed -E 's/var\([^)]*\)//g' "$f" | grep -ohiE 'font-size[[:space:]]*:[[:space:]]*[0-9.]+px|border-radius[[:space:]]*:[[:space:]]*[0-9]+px|#[0-9a-fA-F]{3,8}\b' | wc -l | tr -d ' '
