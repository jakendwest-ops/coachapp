#!/usr/bin/env node
// Asserts PRIVACY_POLICY_VERSION (js/app-core.js) still equals the "Last updated" date printed in
// privacy-policy.html.
//
// WHY THIS IS A CHECK AND NOT A COMMENT
// js/app-core.js:7 already said "MUST match the Last updated: date in privacy-policy.html -- bump
// both together". That is a prose obligation with no writer, which is the exact class OS v3 was
// built to close (RULE 0 for documents). They happened to agree when this was written on
// 2026-08-25; nothing made them keep agreeing.
//
// The failure is SILENT and it is a compliance failure, not a cosmetic one. _needsConsent() returns
// true only when `consent_policy_version !== PRIVACY_POLICY_VERSION`. Edit the policy text without
// bumping the constant and every existing user keeps a consent record pointing at a version of the
// document they never saw, and NOBODY is re-prompted. Nothing in the app surfaces that; the gate
// simply stops firing. There is no user-visible symptom to notice later.
//
// This one is safe to make blocking because its source of truth is unambiguous: privacy-policy.html
// prints its own date, so the check compares a value against the document it describes rather than
// against another copy of itself. That is what separates it from a general "two fields, one fact"
// detector, which would guess.
//
// Paths are overridable ONLY so the self-test can point at fixtures. Same convention as
// check-query-scope.mjs and os-lint's OSLINT_* overrides: a check with no way to be pointed at a
// failing input cannot be distinguished from a dead one.

import { readFileSync } from 'node:fs'

const CORE   = process.env.POLICY_CHECK_CORE   || 'js/app-core.js'
const POLICY = process.env.POLICY_CHECK_POLICY || 'privacy-policy.html'

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
}

export function checkPolicyVersion (corePath = CORE, policyPath = POLICY) {
  const problems = []

  let coreText, policyText
  try { coreText = readFileSync(corePath, 'utf8') } catch { return [`cannot read ${corePath}`] }
  try { policyText = readFileSync(policyPath, 'utf8') } catch { return [`cannot read ${policyPath}`] }

  // The constant. Absence is a FAILURE, never a pass -- a check that finds nothing to compare and
  // reports success is the "green verdict over zero items" class.
  const cm = coreText.match(/PRIVACY_POLICY_VERSION\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/)
  if (!cm) {
    problems.push(`no PRIVACY_POLICY_VERSION = 'YYYY-MM-DD' found in ${corePath} -- ` +
      'the consent gate cannot version-compare without it')
    return problems
  }
  const constant = cm[1]

  // The document's own printed date. Accepts "29 June 2026" (what the page uses today) and ISO.
  let printed = null
  const dm = policyText.match(/Last updated:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i)
  const im = policyText.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/i)
  if (dm) {
    const mon = MONTHS[dm[2].toLowerCase()]
    if (mon) printed = `${dm[3]}-${mon}-${String(dm[1]).padStart(2, '0')}`
    else problems.push(`unparseable month "${dm[2]}" in ${policyPath} "Last updated" line`)
  } else if (im) {
    printed = im[1]
  }

  if (!printed) {
    if (!problems.length) {
      problems.push(`no parseable "Last updated: <date>" found in ${policyPath} -- ` +
        'the check has nothing to compare against and must not pass silently')
    }
    return problems
  }

  if (printed !== constant) {
    problems.push(
      `PRIVACY_POLICY_VERSION is '${constant}' but ${policyPath} says it was last updated ${printed}.\n` +
      '    Bump BOTH together. If the policy text changed, the constant MUST rise or no existing user\n' +
      '    is ever re-prompted for consent -- _needsConsent() compares exactly these two values.')
  }

  return problems
}

// CLI
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('check-policy-version.mjs')) {
  const problems = checkPolicyVersion()
  for (const p of problems) console.error(`  ${p}`)
  process.exit(problems.length ? 1 : 0)
}
