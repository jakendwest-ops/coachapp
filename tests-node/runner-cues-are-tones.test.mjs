// The runner's timer cues are TONES, never speech (2026-10-25).
//
// THE BUG. On iOS 18, any speechSynthesis call stops the lifter's music in Spotify — including the silent
// word _unlockSpeech() spoke on every tap. Web Audio tones mix with the music and do not. Measured on Jake's
// phone 2026-10-25 (docs/bugs/2026-10-25-runner-sounds-stop-the-music-in-spotify-since-the-ios-safari-update.md).
// There is no iPhone in CI, so this pins the two things that decide it: no code anywhere reaches for speech,
// and the rest countdown makes the tones the lifter relies on, at the seconds they rely on them.
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { app, scriptOrder, REPO } from './load-app.mjs'
import { blankComments } from '../scripts/lib/comments.mjs'

const ctx = app()
const run = src => vm.runInContext(src, ctx)

describe('no module reaches for speech', () => {
  test('no speechSynthesis / SpeechSynthesisUtterance outside a comment, in any module', () => {
    const SPEECH = /speechsynthesis|speechsynthesisutterance|webkitspeech/i
    const hits = []
    for (const rel of scriptOrder()) {
      const code = blankComments(readFileSync(join(REPO, rel), 'utf8'))
      code.split('\n').forEach((line, i) => { if (SPEECH.test(line)) hits.push(`${rel}:${i + 1}`) })
    }
    assert.deepEqual(hits, [], 'a speak() call stops the lifter\'s music on iOS — use playBeep() instead')
  })

  test('the speech helpers are gone', () => {
    for (const name of ['_unlockSpeech', 'speakCue', '_pickFemaleVoice']) {
      assert.equal(run(`typeof ${name}`), 'undefined', name)
    }
  })
})

describe('the rest countdown makes tones, and says nothing', () => {
  let tones, spoken
  beforeEach(() => {
    tones = []
    spoken = 0
    ctx.AudioContext = class {
      constructor () { this.state = 'running'; this.currentTime = 0; this.destination = {} }
      resume () { return Promise.resolve() }
      createGain () { return { connect () {}, gain: { setValueAtTime () {}, exponentialRampToValueAtTime () {} } } }
      createOscillator () {
        const o = { type: '', frequency: { value: 0 }, connect () {}, start () {}, stop () {} }
        tones.push(o)
        return o
      }
    }
    // If anything speaks, these count it. They are a trap, not a feature.
    ctx.speechSynthesis = { speak () { spoken++ }, cancel () {}, getVoices: () => [] }
    ctx.SpeechSynthesisUtterance = function () { spoken++ }
    run('_audioCtx = null; renderRunner = function () {}')
  })

  // Drive _restTick one displayed second at a time: restRemaining/_restShown say "n+1 is on screen" and the
  // clock says n seconds are left, so the tick sees the second change to n.
  const tickTo = n => {
    run(`_runner = { exIdx: 0, _restForExIdx: 1, exercises: [], _restInterval: 1,
      restRemaining: ${n + 1}, _restShown: ${n + 1}, restTotal: 90, _restEndsAt: Date.now() + ${n} * 1000 - 1 }`)
    run('_restTick()')
  }

  test('10 s is one low warning, 5..1 are one tick each, 0 is the long finish beep, the rest are silent', () => {
    const heard = []
    for (let n = 12; n >= 0; n--) {
      const before = tones.length
      tickTo(n)
      heard.push([n, tones.slice(before).map(o => o.frequency.value)])
    }
    const expected = new Map([[10, [660]], [5, [880]], [4, [880]], [3, [880]], [2, [880]], [1, [880]], [0, [1046]]])
    for (const [n, freqs] of heard) {
      assert.deepEqual(freqs, expected.get(n) || [], `at ${n} s`)
    }
    assert.equal(spoken, 0, 'the countdown must not speak')
  })

  test('the warning is audibly different from a tick (so it is not mistaken for one)', () => {
    run('playTenSecondWarning()')
    run('playCountdownTick()')
    assert.equal(tones.length, 2)
    assert.notEqual(tones[0].frequency.value, tones[1].frequency.value)
  })

  test('unlocking audio on a tap does not speak', () => {
    run('_unlockAudio()')
    assert.equal(spoken, 0)
  })
})

// Every timer that used to speak still sounds its cue. The rest timer is driven above; the other four are pinned by their source, because driving them needs a clock
// and a rendered runner: deleting a tick from any of them would otherwise leave that timer silent with every test still green.
describe('every timer that used to speak still makes its tones', () => {
  const src = blankComments(readFileSync(join(REPO, 'js', 'app-runner.js'), 'utf8'))
  const body = (name) => {
    const i = src.indexOf('function ' + name + '(')
    assert.ok(i !== -1, name + ' exists')
    const j = src.indexOf('\nfunction ', i + 1)
    return src.slice(i, j === -1 ? undefined : j)
  }
  const EXPECT = {
    _restTick: ['playTenSecondWarning()', 'playCountdownTick()'],
    startStrengthSetTimer: ['playTenSecondWarning()', 'playCountdownTick()'],
    startRunnerCountIn: ['playCountdownTick()'],
    startIntervalTimer: ['playCountdownTick()'],
    startIntervalPhaseTimer: ['playCountdownTick()'],
  }
  for (const [fn, calls] of Object.entries(EXPECT)) {
    test(fn + ' sounds ' + calls.join(' and '), () => {
      const b = body(fn)
      for (const c of calls) assert.ok(b.includes(c), `${fn} no longer calls ${c}: that timer would go silent`)
    })
  }
})

// A context that is not running (a call, Siri or another app took the audio session) starts a tone only when it resumes. A countdown tick that sounds late names the
// wrong second and a backlog would all sound at once, so a tick has a deadline; the finish beep has none.
describe('a context that is not running', () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  let tones, resumes
  const install = (state, resumeMs) => {
    tones = []; resumes = 0
    ctx.AudioContext = class {
      constructor () { this.state = state; this.currentTime = 0; this.destination = {} }
      resume () { resumes++; return new Promise(res => setTimeout(() => { this.state = 'running'; res() }, resumeMs)) }
      createGain () { return { connect () {}, gain: { setValueAtTime () {}, exponentialRampToValueAtTime () {} } } }
      createOscillator () { const o = { type: '', frequency: { value: 0 }, connect () {}, start () {}, stop () {} }; tones.push(o); return o }
    }
    run('_audioCtx = null')
  }

  test('the tick and the warning really carry a deadline (a finite fourth argument to playBeep)', () => {
    assert.match(run('playCountdownTick.toString()'), /playBeep\(880, 0\.12, 0\.8, \d+\)/)
    assert.match(run('playTenSecondWarning.toString()'), /playBeep\(660, 0\.3, 0\.8, \d+\)/)
  })

  test('a tick that resumes in time still sounds', async () => {
    install('suspended', 20)
    run('playCountdownTick()')
    await sleep(120)
    assert.deepEqual(tones.map(o => o.frequency.value), [880])
  })

  test('a tick that resumes too late is dropped, and the finish beep still sounds', async () => {
    install('suspended', 80)
    run('playBeep(880, 0.12, 0.8, 20)')        // a tick with a 20 ms deadline
    run('playBeep(1046, 0.5, 0.95)')           // the finish beep: no deadline
    await sleep(250)
    assert.deepEqual(tones.map(o => o.frequency.value), [1046])
  })

  test('a late warning is dropped too, so a backlog never sounds all at once', async () => {
    install('interrupted', 80)
    run('playBeep(660, 0.3, 0.8, 20)')
    run('playBeep(880, 0.12, 0.8, 20)')
    await sleep(250)
    assert.deepEqual(tones, [])
  })

  test('a tap resumes a suspended context AND an interrupted one, and leaves a running one alone', () => {
    for (const [state, want] of [['suspended', 1], ['interrupted', 1], ['running', 0]]) {
      install(state, 5)
      run('_unlockAudio()')
      assert.equal(resumes, want, state)
    }
  })
})
