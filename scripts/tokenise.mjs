#!/usr/bin/env node
// Rewrites style literals to var(--token, <literal>) INSIDE style="..." attributes only.
//
// The scope rule is the safety property. js/app-progress.js:2303 passes colours to
// Chart.js on a canvas, which does not resolve var() -- substituting there would
// silently strip the chart's colours. Of 176 hex in js/, 116 are CSS declarations and
// 60 are JavaScript string values; only the former are in scope.
//
// EXACT-VALUE ONLY. A value with no exactly-matching token is REPORTED, never rounded.
// That is what makes "zero visual change" a property of this script rather than a hope.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const TYPE = {
  '9px': '--text-2xs', '10px': '--text-xs', '11px': '--text-sm', '12px': '--text-md',
  '13px': '--text-base', '14px': '--text-lg', '16px': '--text-xl', '18px': '--text-2xl',
  '20px': '--text-3xl', '24px': '--text-4xl', '32px': '--text-display',
  '7px': '--legacy-text-7', '8px': '--legacy-text-8', '10.5px': '--legacy-text-10-5',
  '11.5px': '--legacy-text-11-5', '12.5px': '--legacy-text-12-5', '13.5px': '--legacy-text-13-5',
  '15px': '--legacy-text-15', '17px': '--legacy-text-17', '19px': '--legacy-text-19',
  '22px': '--legacy-text-22', '26px': '--legacy-text-26', '30px': '--legacy-text-30',
  '40px': '--legacy-text-40', '64px': '--legacy-text-64'
}
const RADIUS = {
  '4px': '--radius-xs', '8px': '--radius-sm', '10px': '--radius', '12px': '--radius-md',
  '14px': '--radius-lg', '20px': '--radius-xl',
  '99px': '--radius-full', '100px': '--radius-full', '999px': '--radius-full',
  '2px': '--legacy-radius-2', '3px': '--legacy-radius-3', '5px': '--legacy-radius-5',
  '7px': '--legacy-radius-7', '9px': '--legacy-radius-9', '16px': '--legacy-radius-16',
  '18px': '--legacy-radius-18', '24px': '--legacy-radius-24'
}
const COLOUR = {
  '#ef4444': '--danger', '#f59e0b': '--warning', '#22c55e': '--success'
}

const file = process.argv[2]
const apply = process.argv.includes('--apply')
if (!file) { console.error('usage: tokenise.mjs <file> [--apply]'); process.exit(2) }

const src = readFileSync(file, 'utf8')
const stats = new Map()
const unmatched = new Map()
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)

// Only the inside of a style="..." attribute is ever touched.
const out = src.replace(/style="([^"]*)"/g, (whole, body) => {
  let b = body

  b = b.replace(/font-size:(\s*)([0-9.]+px)/g, (m, sp, val) => {
    const t = TYPE[val]
    if (!t) { bump(unmatched, `font-size:${val}`); return m }
    bump(stats, `font-size ${val} -> var(${t})`)
    return `font-size:${sp}var(${t}, ${val})`
  })

  b = b.replace(/border-radius:(\s*)([0-9]+px)/g, (m, sp, val) => {
    const t = RADIUS[val]
    if (!t) { bump(unmatched, `border-radius:${val}`); return m }
    bump(stats, `border-radius ${val} -> var(${t})`)
    return `border-radius:${sp}var(${t}, ${val})`
  })

  // Colour only where it follows a colour-bearing property, so a hex inside a
  // gradient string or an unrelated token is never touched.
  b = b.replace(/(background|background-color|color|border-color|fill|stroke)(:\s*)(#[0-9a-fA-F]{3,8})\b/g,
    (m, prop, sep, val) => {
      const t = COLOUR[val.toLowerCase()]
      if (!t) { bump(unmatched, `${prop}:${val}`); return m }
      bump(stats, `${prop} ${val} -> var(${t})`)
      return `${prop}${sep}var(${t}, ${val})`
    })

  return `style="${b}"`
})

// The literal-counting pattern has exactly one owner: scripts/style-count.sh (Task 3).
// An earlier draft of this file carried its own copy of the regex and it had already
// drifted stricter (case-sensitive, no space before the colon) than the shared script --
// a 7th copy, and a wrong one. Shell out instead so this count is provably the same
// count the checks.sh ratchet will use.
const styleCountSh = join(dirname(fileURLToPath(import.meta.url)), 'style-count.sh')
const count = s => {
  const tmp = join(tmpdir(), `tokenise-count-${randomBytes(6).toString('hex')}.tmp`)
  writeFileSync(tmp, s)
  try {
    return parseInt(execFileSync('sh', [styleCountSh, tmp], { encoding: 'utf8' }).trim(), 10)
  } finally {
    unlinkSync(tmp)
  }
}

console.log(`\n${file}  ${apply ? '[APPLY]' : '[DRY RUN -- nothing written]'}`)
console.log(`  literals before: ${count(src)}   after: ${count(out)}`)
console.log('  replacements:')
for (const [k, v] of [...stats].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
if (unmatched.size) {
  console.log('  LEFT ALONE (no exact token -- never rounded):')
  for (const [k, v] of [...unmatched].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`)
}
if (apply) { writeFileSync(file, out); console.log('  written.') }
