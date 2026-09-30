// Self-test for tests/global-setup.js — proves the preview-server precondition can FAIL.
//
// The dominant bug class in this project is a safeguard that reports success while doing nothing
// (see the Vault memory `feedback_reports_success_doing_nothing`). A precondition that has only
// ever been seen to PASS is indistinguishable from one that is structurally incapable of failing.
// So this drives it through all six states on real HTTP servers, on a spare port:
//
//   1. nothing listening             -> must throw "UNREACHABLE"
//   2. a 500                         -> must throw "RETURNED HTTP"
//   3. a 200 serving a DIFFERENT app -> must throw "WRONG APP"       <- a bare 200 check misses this
//   4. a 200 serving THIS checkout   -> must PASS
//   5. a 200 serving ANOTHER CoachApp checkout -> must throw "WRONG DIRECTORY"  <- the title misses this
//
// Case 3 is the reason this file exists. `run-coachapp` warns that a stale entry in
// .claude/launch.json can serve a different app on 3001, and a precondition that only checked for
// a 200 would sail straight past it.
//
// Case 5 was added 2026-09-30, after the title check passed while a worktree's suite ran entirely
// against the main checkout's JavaScript. Both copies are honestly titled CoachApp, so only a
// content comparison can tell them apart.
//
// Run: node scripts/check-preview-server.selftest.mjs

import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

async function expectThrow (label, mustContain, localIndexPath) {
  try {
    await assertPreviewServer(BASE, localIndexPath)
  } catch (err) {
    if (!err.message.includes(mustContain)) {
      throw new Error(`${label}: threw, but not for the right reason.\n  wanted substring: ${mustContain}\n  got: ${err.message.trim()}`)
    }
    console.log(`  PASS  ${label} — refused with "${mustContain}"`)
    return
  }
  throw new Error(`${label}: DID NOT THROW. The precondition cannot detect this case, so it is decorative.`)
}

async function expectPass (label, localIndexPath) {
  await assertPreviewServer(BASE, localIndexPath)
  console.log(`  PASS  ${label} — accepted a correct server`)
}

// A throwaway stand-in for "this checkout's index.html", so cases 4 and 5 can control whether the
// served body matches without depending on the real file.
function tmpIndex (contents) {
  const p = path.join(os.tmpdir(), `coachapp-selftest-index-${process.pid}-${Math.random().toString(36).slice(2, 8)}.html`)
  fs.writeFileSync(p, contents)
  tmpFiles.push(p)
  return p
}

const html = title => `<!doctype html><html><head><title>${title}</title></head><body>x</body></html>`
// Two CoachApp pages that differ only the way two checkouts of this repo differ: the module
// cache-bust versions. Case 5 is exactly the worktree bug of 2026-09-30.
const coachApp = v => `<!doctype html><html><head><title>CoachApp</title></head><body><script src="js/app-runner.js?v=${v}"></script></body></html>`

const tmpFiles = []
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

// 4. server up, 200, serving CoachApp FROM THIS CHECKOUT — must be accepted
s = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(coachApp(100)) })
await step(() => expectPass('200 serving this checkout', tmpIndex(coachApp(100))))
await close(s)

// 5. server up, 200, genuinely CoachApp — but a DIFFERENT checkout of it. This is the 2026-09-30
// worktree bug: .claude/launch.json is git-tracked and hardcoded the main checkout's path, so a
// worktree's suite ran against code its author had not written, and the title check waved it through.
s = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(coachApp(96)) })
await step(() => expectThrow('200 but a different checkout', 'WRONG DIRECTORY', tmpIndex(coachApp(100))))
await close(s)

// 6. the same checkout, differing ONLY by a leading BOM — must be accepted. index.html really is
// written with a BOM, and the two read paths disagree about it (readFileSync keeps U+FEFF,
// Response.text() strips it), so without normalisation case 5's comparison rejects a correct
// server. That is what happened on this check's first real run, 2026-09-30.
s = await serve((req, res) => { res.setHeader('content-type', 'text/html'); res.end(coachApp(100)) })
await step(() => expectPass('BOM-only difference', tmpIndex('﻿' + coachApp(100))))
await close(s)

for (const p of tmpFiles) { try { fs.unlinkSync(p) } catch {} }

if (failures) {
  console.error(`\n${failures} self-test failure(s) — the preview-server precondition cannot be trusted.`)
  // `process.exitCode`, NOT `process.exit(1)`. Verified 2026-08-29: calling process.exit() here
  // races the http server teardown and aborts libuv on Windows
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), which exits 127 instead of 1.
  // Non-zero either way, so the gate still blocked — but a crash is not a result, and the next
  // person reading 127 would go looking for a missing command rather than a failed check.
  process.exitCode = 1
} else {
  console.log('\nAll 6 states verified: it refuses four distinct bad servers and accepts the two good ones.')
}
