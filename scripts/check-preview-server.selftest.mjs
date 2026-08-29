// Self-test for tests/global-setup.js — proves the preview-server precondition can FAIL.
//
// The dominant bug class in this project is a safeguard that reports success while doing nothing
// (see the Vault memory `feedback_reports_success_doing_nothing`). A precondition that has only
// ever been seen to PASS is indistinguishable from one that is structurally incapable of failing.
// So this drives it through all four states on real HTTP servers, on a spare port:
//
//   1. nothing listening        -> must throw "UNREACHABLE"
//   2. a 500                    -> must throw "RETURNED HTTP"
//   3. a 200 serving a DIFFERENT app -> must throw "WRONG APP"   <- the case a bare 200 check misses
//   4. a 200 serving CoachApp   -> must PASS
//
// Case 3 is the reason this file exists. `run-coachapp` warns that a stale entry in
// .claude/launch.json can serve a different app on 3001, and a precondition that only checked for
// a 200 would sail straight past it.
//
// Run: node scripts/check-preview-server.selftest.mjs

import http from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { assertPreviewServer } = require('../tests/global-setup.js')

const PORT = 34117 // deliberately NOT 3001 — this must never collide with a real preview server
const BASE = `http://localhost:${PORT}`

function serve (handler) {
  return new Promise(resolve => {
    const s = http.createServer(handler)
    s.listen(PORT, () => resolve(s))
  })
}
const close = s => new Promise(resolve => s.close(resolve))

async function expectThrow (label, mustContain) {
  try {
    await assertPreviewServer(BASE)
  } catch (err) {
    if (!err.message.includes(mustContain)) {
      throw new Error(`${label}: threw, but not for the right reason.\n  wanted substring: ${mustContain}\n  got: ${err.message.trim()}`)
    }
    console.log(`  PASS  ${label} — refused with "${mustContain}"`)
    return
  }
  throw new Error(`${label}: DID NOT THROW. The precondition cannot detect this case, so it is decorative.`)
}

async function expectPass (label) {
  await assertPreviewServer(BASE)
  console.log(`  PASS  ${label} — accepted a correct server`)
}

const html = title => `<!doctype html><html><head><title>${title}</title></head><body>x</body></html>`

let failures = 0
async function step (fn) {
  try { await fn() } catch (err) { failures++; console.error(`  FAIL  ${err.message}`) }
}

console.log('preview-server precondition self-test')

// 1. nothing listening
await step(() => expectThrow('nothing listening', 'UNREACHABLE'))

// 2. server up, returns 500
let s = await serve((req, res) => { res.statusCode = 500; res.end('boom') })
await step(() => expectThrow('server returns 500', 'RETURNED HTTP'))
await close(s)

// 3. server up, 200, but it is a DIFFERENT app
s = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html('PTHub')) })
await step(() => expectThrow('200 but wrong app', 'WRONG APP'))
await close(s)

// 4. server up, 200, serving CoachApp — must be accepted
s = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html('CoachApp')) })
await step(() => expectPass('200 serving CoachApp'))
await close(s)

if (failures) {
  console.error(`\n${failures} self-test failure(s) — the preview-server precondition cannot be trusted.`)
  // `process.exitCode`, NOT `process.exit(1)`. Verified 2026-08-29: calling process.exit() here
  // races the http server teardown and aborts libuv on Windows
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), which exits 127 instead of 1.
  // Non-zero either way, so the gate still blocked — but a crash is not a result, and the next
  // person reading 127 would go looking for a missing command rather than a failed check.
  process.exitCode = 1
} else {
  console.log('\nAll 4 states verified: it refuses three distinct bad servers and accepts the good one.')
}
