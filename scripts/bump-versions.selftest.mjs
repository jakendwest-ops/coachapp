#!/usr/bin/env node
/**
 * Proves bump-versions.mjs bumps what it should and, just as importantly, does NOT touch what it
 * should not.
 *
 * The second half is where an auto-bump goes wrong. This hook rewrites the content of a commit the
 * author is in the middle of making, so every case where it acts when it should have stayed still is a
 * silent edit to someone else's work. A hand-raised version must survive; a merge must be left alone;
 * a commit with no js/ or css/ in it must leave index.html byte-identical.
 *
 * Every case runs in a REAL throwaway git repo (BUMP_REPO), because the whole behaviour is defined in
 * terms of the staged set and HEAD:index.html. A fixture that faked those would be testing a
 * different program.
 *
 * Run: node scripts/bump-versions.selftest.mjs      (exit 1 = a case misbehaved)
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUMP = join(dirname(fileURLToPath(import.meta.url)), 'bump-versions.mjs')

const indexHtml = (vs) => [
  `  <link rel="stylesheet" href="css/main.css?v=${vs.css}">`,
  `  <script src="js/app-core.js?v=${vs.core}"></script>`,
  `  <script src="js/app-runner.js?v=${vs.runner}"></script>`
].join('\n') + '\n'

function newRepo () {
  const repo = mkdtempSync(join(tmpdir(), 'bump-selftest-'))
  const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
  g('init', '-q')
  g('config', 'user.email', 'selftest@example.invalid')
  g('config', 'user.name', 'selftest')
  g('config', 'commit.gpgsign', 'false')
  // Fixtures are LF. Without this, git prints a CRLF warning for every file in every case and the
  // real output -- including a genuine failure line -- is buried in fifty lines of noise.
  g('config', 'core.autocrlf', 'false')
  mkdirSync(join(repo, 'js'))
  mkdirSync(join(repo, 'css'))
  writeFileSync(join(repo, 'js', 'app-core.js'), 'function a(){}\n')
  writeFileSync(join(repo, 'js', 'app-runner.js'), 'function b(){}\n')
  writeFileSync(join(repo, 'css', 'main.css'), 'body{color:red}\n')
  writeFileSync(join(repo, 'index.html'), indexHtml({ css: 12, core: 24, runner: 82 }))
  g('add', '-A')
  g('commit', '-q', '-m', 'base')
  return { repo, g }
}

function run (repo) {
  try {
    return { out: execFileSync(process.execPath, [BUMP], { encoding: 'utf8', env: { ...process.env, BUMP_REPO: repo } }), exit: 0 }
  } catch (err) {
    return { out: (err.stdout || '') + (err.stderr || ''), exit: err.status }
  }
}

const readVs = (repo) => {
  const html = readFileSync(join(repo, 'index.html'), 'utf8')
  const m = new Map()
  for (const x of html.matchAll(/((?:js|css)\/[a-zA-Z0-9._-]+)\?v=(\d+)/g)) m.set(x[1], Number(x[2]))
  return m
}

const CASES = [
  {
    why: 'a staged module with an unchanged ?v= is bumped by exactly one, and index.html is staged',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'js', 'app-core.js'), 'function a(){ return 1 }\n')
      g('add', 'js/app-core.js')
      run(repo)
      const vs = readVs(repo)
      const stagedNow = g('diff', '--cached', '--name-only').split('\n').map(s => s.trim())
      return [
        [vs.get('js/app-core.js') === 25, `app-core should be v25, is v${vs.get('js/app-core.js')}`],
        [vs.get('js/app-runner.js') === 82, 'an UNSTAGED module must not be bumped'],
        [stagedNow.includes('index.html'), 'index.html must be staged, or the bump misses the commit']
      ]
    }
  },
  {
    why: 'a version already raised BY HAND is left exactly as written, not bumped again',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'js', 'app-core.js'), 'function a(){ return 1 }\n')
      writeFileSync(join(repo, 'index.html'), indexHtml({ css: 12, core: 30, runner: 82 }))
      g('add', 'js/app-core.js', 'index.html')
      run(repo)
      const v = readVs(repo).get('js/app-core.js')
      return [[v === 30, `hand-set v30 must survive, got v${v}`]]
    }
  },
  {
    why: 'a version accidentally LOWERED is raised back above HEAD -- it must never ship below it',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'js', 'app-core.js'), 'function a(){ return 1 }\n')
      writeFileSync(join(repo, 'index.html'), indexHtml({ css: 12, core: 3, runner: 82 }))
      g('add', 'js/app-core.js', 'index.html')
      run(repo)
      const v = readVs(repo).get('js/app-core.js')
      return [[v === 25, `must be raised to HEAD+1 = 25, got v${v}`]]
    }
  },
  {
    why: 'a commit with no js/ or css/ leaves index.html byte-identical',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'README.md'), 'hello\n')
      g('add', 'README.md')
      const before = readFileSync(join(repo, 'index.html'), 'utf8')
      run(repo)
      return [[readFileSync(join(repo, 'index.html'), 'utf8') === before, 'index.html was modified for a non-asset commit']]
    }
  },
  {
    why: 'css is bumped too -- the 2026-08-22 miss was js, but the same hazard applies',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'css', 'main.css'), 'body{color:blue}\n')
      g('add', 'css/main.css')
      run(repo)
      const v = readVs(repo).get('css/main.css')
      return [[v === 13, `css should be v13, is v${v}`]]
    }
  },
  {
    why: 'several staged modules are all bumped in one pass',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'js', 'app-core.js'), 'function a(){ return 1 }\n')
      writeFileSync(join(repo, 'js', 'app-runner.js'), 'function b(){ return 2 }\n')
      g('add', '-A')
      run(repo)
      const vs = readVs(repo)
      return [
        [vs.get('js/app-core.js') === 25, `core v${vs.get('js/app-core.js')}`],
        [vs.get('js/app-runner.js') === 83, `runner v${vs.get('js/app-runner.js')}`]
      ]
    }
  },
  {
    why: 'a staged module with NO ?v= entry warns instead of passing silently',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'js', 'app-orphan.js'), 'function c(){}\n')
      g('add', 'js/app-orphan.js')
      const { out } = run(repo)
      return [[/no \?v= entry/.test(out), `expected a warning, got: ${out.trim() || '(nothing)'}`]]
    }
  },
  {
    why: 'mid-merge it stays out of the way -- the staged set is not the author\'s own change',
    run: ({ repo, g }) => {
      writeFileSync(join(repo, 'js', 'app-core.js'), 'function a(){ return 1 }\n')
      g('add', 'js/app-core.js')
      writeFileSync(join(repo, '.git', 'MERGE_HEAD'), g('rev-parse', 'HEAD'))
      run(repo)
      const v = readVs(repo).get('js/app-core.js')
      return [[v === 24, `must not bump mid-merge, got v${v}`]]
    }
  }
]

let failures = 0
for (const c of CASES) {
  const { repo, g } = newRepo()
  let results
  try {
    results = c.run({ repo, g })
  } catch (err) {
    results = [[false, `threw: ${err.message}`]]
  }
  for (const [ok, msg] of results) {
    if (!ok) { failures++; console.log(`  [fail] ${c.why}\n         ${msg}`) }
  }
  rmSync(repo, { recursive: true, force: true })
}

// Non-zero denominator: an empty CASES array would otherwise print success and assert nothing.
if (CASES.length < 5) {
  console.log('  self-test has too few cases to be meaningful')
  process.exit(1)
}
if (failures) {
  console.log(`  ${failures} assertion(s) failed across ${CASES.length} cases.`)
  process.exit(1)
}
console.log(`  bump-versions self-test: ${CASES.length} cases behaved (bumps, and just as important, the four non-bumps).`)
process.exit(0)
