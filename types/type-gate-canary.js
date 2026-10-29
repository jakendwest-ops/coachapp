// The type gate's canary. Type-checked only; the browser never loads it (index.html has no tag for it).
//
// tsc must report EXACTLY ONE error in this file. scripts/check-types.mjs refuses otherwise, because a
// tsc run that checked nothing (checkJs off, noCheck on, an empty run) also exits 0 and reports no
// errors, and every js/ file would then read as "improved to 0". Do not fix the error below, and do not
// add a second one.

/** @type {number} */
const _typeGateCanary = 'deliberately not a number'
