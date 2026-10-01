// What marks a row as leftover TEST data — ONE definition, shared by scripts/reap-e2e-debris.mjs and its tests.
//
// WHY THIS IS A FILE OF ITS OWN (2026-10-01). The reaper reported "exercises clean / No debris found" for an
// account holding 6,275 exercises of it. Its prefix match was a case-sensitive LIKE on '[E2E' / '[TEST]':
//   - 810 rows were lowercase '[e2e] …' (older spec versions): `LIKE '[E2E%'` matched 0 of them;
//   - ~5,400 were 'Playwright …' / no tag at all (runner.spec.js's pickOrCreateExercise), which no prefix
//     list could ever match.
// A cleaner that cannot see its own mess says "clean". Keeping the definition here, as plain functions, lets
// a unit test pin it without a database.

// The tag family the suite uses. '[E2E' as a prefix covers '[E2E]', '[E2E-RLS]', '[E2E-PP]' and so on; [ and ]
// are literal in SQL LIKE. '[TEST]' is kept because rows carrying it may still exist.
export const TAG_PREFIXES = ['[E2E', '[TEST]']

// UNTAGGED names that older specs created. RETIRED as a convention — specs now tag with [E2E] — and listed
// only so the existing debris can be cleared. They apply to `exercises` alone, which is the only table they
// were found in, and may be deleted from this list once the table is clean.
export const LEGACY_EXERCISE_PREFIXES = ['Playwright ', 'PW ']

export const prefixesFor = table =>
  table === 'exercises' ? [...TAG_PREFIXES, ...LEGACY_EXERCISE_PREFIXES] : TAG_PREFIXES

// A LIKE pattern for "starts with this exact text" — % and _ in the prefix would otherwise be wildcards.
export const likePattern = prefix => prefix.replace(/[\\%_]/g, '\\$&') + '%'

// The same rule in JS, CASE-INSENSITIVE. The reaper asks the server with ILIKE and then filters the answer
// through this before it deletes anything, so the set that is deleted can never be broader than this says.
export const isDebrisName = (name, table) => {
  const n = String(name ?? '').toLowerCase()
  return prefixesFor(table).some(p => n.startsWith(p.toLowerCase()))
}
