#!/usr/bin/env node
// Self-test for check-policy-version.mjs. Runs from checks.sh BEFORE the rule itself.
//
// les-083, learned the hard way on guardrails RULE 6: fixtures prove the LOGIC, only the real repo
// proves the PLUMBING. All seven of that rule's fixture cases passed while the rule could never have
// fired in real use, because its path never resolved. So the last case here is LIVE -- it asserts
// the real js/app-core.js and privacy-policy.html both parse and yield a value. A green fixture
// suite over a path that resolves to nothing certifies a dead rule.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkPolicyVersion } from './check-policy-version.mjs'

const dir = mkdtempSync(join(tmpdir(), 'policyver-'))
let failed = 0

const core = (v) => {
  const p = join(dir, `core-${Math.random().toString(36).slice(2)}.js`)
  writeFileSync(p, v === null ? 'const SOMETHING_ELSE = 1\n' : `const PRIVACY_POLICY_VERSION = '${v}'\n`)
  return p
}
const policy = (line) => {
  const p = join(dir, `policy-${Math.random().toString(36).slice(2)}.html`)
  writeFileSync(p, `<html><body><p>${line}</p></body></html>\n`)
  return p
}

function expect (name, problems, shouldFail, mustMention) {
  const didFail = problems.length > 0
  let bad = didFail !== shouldFail
  if (!bad && shouldFail && mustMention && !problems.join('\n').includes(mustMention)) bad = true
  if (bad) {
    failed++
    console.error(`  [SELFTEST FAIL] ${name}`)
    console.error(`      expected ${shouldFail ? 'a problem' : 'no problem'}${mustMention ? ` mentioning "${mustMention}"` : ''}`)
    console.error(`      got: ${problems.length ? problems.join(' | ') : '(none)'}`)
  } else {
    console.log(`  [ok] ${name}`)
  }
}

// 1. The happy path must PASS -- a rule that refuses correct code gets switched off (les-071).
expect('matching versions pass',
  checkPolicyVersion(core('2026-06-29'), policy('Last updated: 29 June 2026 &nbsp;·&nbsp; Effective')),
  false)

// 2. THE REASON THIS EXISTS: policy edited, constant not bumped.
expect('policy newer than the constant REFUSES',
  checkPolicyVersion(core('2026-06-29'), policy('Last updated: 14 August 2026')),
  true, 'no existing user')

// 3. The reverse drift is equally wrong.
expect('constant ahead of the policy REFUSES',
  checkPolicyVersion(core('2026-09-01'), policy('Last updated: 29 June 2026')),
  true)

// 4. ISO form in the policy is accepted (so a future reformat does not silently break the rule).
expect('ISO date in the policy is understood',
  checkPolicyVersion(core('2026-06-29'), policy('Last updated: 2026-06-29')),
  false)

// 5+6. A check that cannot find its input must FAIL, never pass quietly.
expect('missing constant REFUSES',
  checkPolicyVersion(core(null), policy('Last updated: 29 June 2026')),
  true, 'no PRIVACY_POLICY_VERSION')

expect('unparseable policy date REFUSES',
  checkPolicyVersion(core('2026-06-29'), policy('Reviewed occasionally, whenever we feel like it')),
  true, 'must not pass silently')

// 7. Unreadable paths refuse rather than throwing.
expect('missing file REFUSES',
  checkPolicyVersion(join(dir, 'nope.js'), policy('Last updated: 29 June 2026')),
  true, 'cannot read')

// 8. LIVE PLUMBING (les-083). Not "does the repo currently agree" -- that is rule 11's job and it
//    would make this self-test go red for a real drift it is supposed to keep detecting. This
//    asserts only that both real paths RESOLVE and PARSE, i.e. that the rule is capable of firing
//    at all against the actual repo layout.
{
  const problems = checkPolicyVersion()
  const dead = problems.some(p =>
    p.includes('cannot read') || p.includes('no PRIVACY_POLICY_VERSION') || p.includes('must not pass silently'))
  if (dead) {
    failed++
    console.error('  [SELFTEST FAIL] live plumbing: the real paths do not resolve/parse')
    console.error(`      ${problems.join(' | ')}`)
    console.error('      Fixtures passing over a dead path is exactly les-083. Fix the paths.')
  } else {
    console.log('  [ok] live plumbing: real js/app-core.js + privacy-policy.html both resolve and parse')
  }
}

rmSync(dir, { recursive: true, force: true })

if (failed) {
  console.error(`\n  check-policy-version self-test: ${failed} case(s) FAILED\n`)
  process.exit(1)
}
console.log('\n  check-policy-version self-test: all cases pass (refuses AND allows)\n')
