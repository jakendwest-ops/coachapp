#!/usr/bin/env node
// Self-test for check-security-embargo.mjs: it must REFUSE on the shape it exists for and PASS on its
// neighbours — a check only ever seen passing cannot be told apart from one incapable of failing.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-security-embargo.mjs')
const row = (status, security) =>
  `---\nid: x\nstatus: ${status}\npriority: high\nreported: 2026-09-26\n${security === undefined ? '' : `security: ${security}\n`}---\n\n# x\n`

const cases = [
  ['open + security: true',               row('open', 'true'),               1],
  ['open + security: true (CRLF file)',   row('open', 'true').replace(/\n/g, '\r\n'), 1],
  ['closed + security: true',             row('closed', 'true'),             0],
  ['fixed-awaiting-jake + security: true', row('fixed-awaiting-jake', 'true'), 0],
  ['open + security: false',              row('open', 'false'),              0],
  ['open, no security field',             row('open'),                       0],
  // tolerant parsing, added after review 2026-09-27
  ['deferred + security: true',           row('deferred', 'true'),           1],
  ['quoted "open" + security: "true"',    row('"open"', '"true"'),           1],
  ['security: Yes # note',                row('open', 'Yes # note'),         1],
  ['BOM before the frontmatter',          '﻿' + row('open', 'true'),    1],
]

let bad = 0
for (const [name, body, want] of cases) {
  const dir = mkdtempSync(join(tmpdir(), 'embargo-'))
  const bugs = join(dir, 'bugs'); mkdirSync(bugs)
  writeFileSync(join(bugs, '2026-09-26-probe.md'), body)
  const r = spawnSync(process.execPath, [CHECK], { env: { ...process.env, EMBARGO_BUGS: bugs }, encoding: 'utf8', windowsHide: true })
  rmSync(dir, { recursive: true, force: true })
  const ok = r.status === want
  if (!ok) bad++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}: exit ${r.status}, expected ${want}`)
}
console.log(bad ? `\n${bad} case(s) FAILED` : `\nAll ${cases.length} cases behave.`)
process.exit(bad ? 1 : 0)
