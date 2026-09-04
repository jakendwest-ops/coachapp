/**
 * Read a ratchet baseline from an environment variable, or refuse.
 *
 * WHY THIS IS VALIDATED AND SHARED. The first version of both callers wrote
 * `Number(process.env.X ?? DEFAULT)` inline, and the pre-push review on 2026-09-04 found that it
 * SILENTLY DISARMS the gate:
 *
 *   - a non-numeric value gives NaN, and every comparison against NaN is false. So neither the
 *     refusal branch (`count > baseline`) nor the lower-the-baseline note (`count < baseline`) fires.
 *     check-references.mjs printed "6 backward const/let reads (baseline NaN)" and exited 0.
 *     Reproduced with REFS_BACKWARD_BASELINE=abc before the fix.
 *   - an EMPTY string is the mirror failure: `??` catches only null and undefined, so `Number('')`
 *     is 0 -- the strictest possible baseline. `export REFS_BACKWARD_BASELINE=` in a shell, or a CI
 *     variable defined but unset, would refuse correct code. Refusing the legitimate user is this
 *     project's most-shipped guard bug.
 *
 * A safeguard reporting success while doing nothing, inside the files written to stop exactly that.
 * It lives here rather than being pasted into both callers because two copies of a validator is how
 * the next drift starts -- and because the second copy would have been written the same day the
 * single-source registry (rule 9j) landed.
 */

export function readBaseline (envName, dflt) {
  const raw = process.env[envName]
  if (raw === undefined) return dflt
  const n = Number(raw)
  // Empty/whitespace is rejected explicitly: Number('') is 0, which Number.isInteger accepts, so the
  // integer test alone lets the false-refusal case straight through.
  if (raw.trim() === '' || !Number.isInteger(n) || n < 0) {
    console.log(`  ${envName}='${raw}' is not a non-negative integer. Refusing to run with an unusable`)
    console.log('  baseline -- a NaN comparison passes silently and would disarm this check, and an')
    console.log('  empty value would read as 0 and refuse correct code.')
    process.exit(1)
  }
  return n
}
