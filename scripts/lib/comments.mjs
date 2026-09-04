/**
 * Blank out comments, preserving every other byte and all offsets so line numbers stay exact.
 *
 * WHY THIS IS SHARED. "A checker counted a COMMENT as code" has now happened FOUR times in this repo,
 * most recently when the count ratchet refused a commit because a new code comment contained the
 * literal string "Loading…". A comment is documentation; counting it is a false refusal, and a gate
 * that refuses correct work is one that gets switched off.
 *
 * A line grep cannot do this. "//" appears inside every https:// URL in the source, and a regex like
 * /['"]/ would open a phantom string that swallows the rest of the file. So this tracks string,
 * template-literal and regex-literal state, using the standard "what was the last meaningful
 * character" heuristic to tell a regex from a division.
 *
 * Strings and template literals are SKIPPED, not blanked: some callers are looking for things that
 * live inside template literals.
 */
export function blankComments (src) {
  const out = src.split('')
  const n = src.length
  let i = 0
  let prev = ''
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out[i] = ' '; i++ }
      continue
    }
    if (c === '/' && c2 === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++ }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2 }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === c) { i++; break }
        i++
      }
      prev = c
      continue
    }
    if (c === '/' && /[(,=:[!&|?{};+\-*%~^\n]/.test(prev || '\n')) {
      i++
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '[') { while (i < n && src[i] !== ']') { if (src[i] === '\\') i++; i++ } }
        if (src[i] === '/' || src[i] === '\n') { i++; break }
        i++
      }
      continue
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
}
