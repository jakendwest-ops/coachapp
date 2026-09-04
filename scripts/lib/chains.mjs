/**
 * Read a whole chained Supabase expression, across however many lines it spans.
 *
 * WHY THIS IS SHARED. checks.sh has three rules whose subject is a chained call — 2 (query scoping),
 * 9a (PII in logs) and now spec hygiene — and the lesson that produced all of them is the same one:
 *
 *   a rule whose subject spans more than one line cannot live in a line-oriented grep.
 *
 * That was measured, not theorised. Rule 2's three shell sub-checks reported four violations on a
 * clean tree, every one a FALSE POSITIVE, because the anchor sat on the continuation line:
 *
 *     db.from('programs').select('id')
 *       .eq('coach_id', currentUser.id)      <- the anchor, invisible to a single-line grep
 *
 * Flipping those to blocking would have refused correct code on the rule guarding this project's
 * most-shipped bug class. This walker is what replaced them, and copying it into each new checker is
 * how the six-copy drift in scripts/style-count.sh happened — one copy went stricter than the others
 * and the two disagreed about the same file. One copy, here.
 */

/**
 * Net bracket movement on a line, ignoring brackets inside string literals.
 *
 * A template literal like `coach_id.eq.${uid}` would otherwise leave the depth permanently open and
 * swallow the rest of the file into a single "chain". A trailing `//` comment ends the code.
 */
export function depthOf (s) {
  let d = 0
  let quote = null
  for (let k = 0; k < s.length; k++) {
    const c = s[k]
    if (quote) {
      if (c === '\\') { k++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '/' && s[k + 1] === '/') break
    if (c === '(' || c === '[' || c === '{') d++
    if (c === ')' || c === ']' || c === '}') d--
  }
  return d
}

/**
 * Collect the chained expression starting at lines[i], from `startAt` characters in.
 *
 * Two things make this more than a line read, and the first draft of the original got both wrong:
 *   1. the interesting call is usually on a CONTINUATION line (`.eq('coach_id', …)` under `.select()`);
 *   2. a payload can be a multi-line object literal whose body lines start with a key, not a dot —
 *      so a dot-only rule stops dead at `.insert({` and never sees what follows.
 *
 * A COMMENT LINE DOES NOT END A CHAIN. This codebase annotates heavily between the `.from()` and the
 * `.insert()`/`.eq()` that follows (app-programs.js:1772 has four such lines), so treating a comment
 * as a terminator reports correctly-anchored code as unanchored.
 */
export function collectChain (lines, i, startAt = 0) {
  const continues = (idx) => {
    for (let k = idx; k < lines.length; k++) {
      const t = (lines[k] || '').trim()
      if (!t || t.startsWith('//')) continue            // blank / comment: look past it
      return t.startsWith('.')
    }
    return false
  }

  let chain = lines[i].slice(startAt)
  let depth = depthOf(chain)
  for (let j = i + 1; j < lines.length; j++) {
    const t = (lines[j] || '').trim()
    if (depth <= 0 && !t.startsWith('.') && !(!t || t.startsWith('//'))) break
    if (depth <= 0 && (!t || t.startsWith('//')) && !continues(j)) break
    if (!t.startsWith('//')) { chain += ' ' + t; depth += depthOf(lines[j]) }
    if (depth <= 0 && !continues(j + 1)) break
  }
  return chain
}

/** A line that is entirely a comment describes a query; it does not run one. */
export function isCommentLine (line) {
  return /^\s*(\/\/|\*)/.test(line)
}
