// The runner's timer cues are TONES, never speech (2026-10-25).
//
// THE BUG. On iOS 18, any speechSynthesis call stops the lifter's music in Spotify — including the silent
// word _unlockSpeech() spoke on every tap. Web Audio tones mix with the music and do not. Measured on Jake's
// phone 2026-10-25 (docs/bugs/2026-10-25-runner-sounds-stop-the-music-in-spotify-since-the-ios-safari-update.md).
// There is no iPhone in CI, so this pins the two things that decide it: no code anywhere reaches for speech,
// and the rest countdown makes the tones the lifter relies on, at the seconds they rely on them.
import { test, describe, beforeEach, afterEach } from 'node:test'
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
  let tones, resumes, made, closes
  // Only the FIRST engine gets the state under test; every engine built after it starts 'suspended', as a real one does.
  const install = (state, resumeMs) => {
    tones = []; resumes = 0; made = []; closes = 0
    let n = 0
    ctx.AudioContext = class {
      constructor () { this.state = n++ === 0 ? state : 'suspended'; this.currentTime = 0; this.destination = {}; made.push(this) }
      resume () { resumes++; return new Promise(res => setTimeout(() => { this.state = 'running'; res() }, resumeMs)) }
      close () { closes++; this.state = 'closed'; return Promise.resolve() }
      createGain () { return { connect () {}, gain: { setValueAtTime () {}, exponentialRampToValueAtTime () {} } } }
      createOscillator () { const o = { type: '', frequency: { value: 0 }, connect () {}, start () {}, stop () {} }; tones.push(o); return o }
    }
    run('_audioCtx = null; _audioStale = false; _audioProbe = null')
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

  test('a first tap resumes a suspended engine and leaves a running one alone', () => {
    for (const [state, want] of [['suspended', 1], ['running', 0]]) {
      install(state, 5)
      run('_unlockAudio()')
      assert.equal(resumes, want, state)
      assert.equal(made.length, 1, state + ': one engine built')
    }
  })
})

// THE BUG (measured on Jake's iPhone, 2026-10-28): leave Safari for Spotify and the sound engine's clock stops while it still says
// 'running' or 'interrupted'; resume() does not revive it, a NEW engine does. The runner used to resume only, so the beeps never came back.
// The engine is therefore replaced at the next tap whenever it can no longer be trusted. Time is faked here so the clock check is exact.
describe('the sound engine is replaced when it can no longer be trusted', () => {
  let tones, resumes, made, closes, now, realNow
  const install = (state) => {
    tones = []; resumes = 0; made = []; closes = 0
    let n = 0
    ctx.AudioContext = class {
      constructor () { this.state = n++ === 0 ? state : 'suspended'; this.currentTime = 0; this.destination = {}; made.push(this) }
      resume () { resumes++; this.state = 'running'; return Promise.resolve() }
      close () { closes++; this.state = 'closed'; return Promise.resolve() }
      createGain () { return { connect () {}, gain: { setValueAtTime () {}, exponentialRampToValueAtTime () {} } } }
      createOscillator () { const o = { type: '', frequency: { value: 0 }, connect () {}, start () {}, stop () {} }; tones.push(o); return o }
    }
    run('_audioCtx = null; _audioStale = false; _audioProbe = null')
  }
  const tap = () => run('_unlockAudio()')
  // Time passes: the wall clock moves by ms, and a HEALTHY engine's own clock moves with it.
  const wait = (ms, engineAlive = true) => { now += ms; if (engineAlive) made[made.length - 1].currentTime += ms / 1000 }
  beforeEach(() => { realNow = Date.now; now = 1_000_000; Date.now = () => now; run('_runner = null') })
  afterEach(() => { Date.now = realNow; run('_runner = null') })

  test('the first tap builds one engine and resumes it', () => {
    install('suspended'); tap()
    assert.equal(made.length, 1); assert.equal(resumes, 1)
  })

  test('a healthy engine whose clock keeps moving is left alone on later taps', () => {
    install('running'); tap()
    wait(60_000); tap()
    wait(60_000); tap()
    assert.equal(made.length, 1, 'no churn'); assert.equal(closes, 0)
  })

  test('after the page was hidden, the next tap closes the old engine and builds and resumes a new one', () => {
    install('running'); tap()
    run('_noteAudioHidden()')
    tap()
    assert.equal(made.length, 2); assert.equal(closes, 1, 'the old engine is closed'); assert.equal(made[0].state, 'closed')
    assert.equal(resumes, 1, 'the NEW engine is started inside the tap')
  })

  test('the hidden flag is cleared by the rebuild: the tap after that leaves the new engine alone', () => {
    install('running'); tap()
    run('_noteAudioHidden()'); tap()
    wait(20_000); tap()
    assert.equal(made.length, 2)
  })

  test('an interrupted engine is rebuilt, not resumed (resume() did not revive it on the phone)', () => {
    install('running'); tap()
    made[0].state = 'interrupted'
    tap()
    assert.equal(made.length, 2); assert.equal(closes, 1)
  })

  test('a closed engine is rebuilt', () => {
    install('running'); tap()
    made[0].state = 'closed'
    tap()
    assert.equal(made.length, 2)
  })

  test("'running' with a clock that has stopped for 3 s or more is the dead engine's signature: rebuilt", () => {
    install('running'); tap()
    wait(5_000, false)                                // 5 s pass, the engine's clock does not move
    tap()
    assert.equal(made.length, 2); assert.equal(closes, 1)
  })

  test('a clock check needs history: the same stopped clock 1 s later proves nothing', () => {
    install('running'); tap()
    wait(1_000, false)
    tap()
    assert.equal(made.length, 1)
  })

  test('a clock that is merely slow (a quarter speed or better) is not judged dead', () => {
    install('running'); tap()
    now += 8_000; made[0].currentTime += 3                  // 3 s of engine time in 8 s of wall time
    tap()
    assert.equal(made.length, 1)
  })

  test('the visibilitychange listener marks the engine untrustworthy when the page is hidden', () => {
    const src = blankComments(readFileSync(join(REPO, 'js', 'app-runner.js'), 'utf8'))
    const i = src.indexOf("addEventListener('visibilitychange'")
    assert.ok(i !== -1, 'the listener exists')
    const body = src.slice(i, src.indexOf('\n})', i))
    assert.match(body, /visibilityState === 'hidden'\)\s*\{\s*_noteAudioHidden\(\)/, 'hidden -> _noteAudioHidden()')
  })

  // The rest timer calls _unlockAudio every second. It is NOT a tap, and a new engine only starts from a tap, so it must never replace
  // the engine, burn the stale flag or refresh the clock probe (review, 2026-10-28: three reviewers found the first version did all three).
  test('a timer-driven unlock (no tap) never rebuilds the engine and leaves the stale flag for the next real tap', () => {
    install('running'); tap()
    run('_noteAudioHidden()')
    run('_unlockAudio(false)'); run('_unlockAudio(false)')
    assert.equal(made.length, 1, 'no rebuild on a timer'); assert.equal(closes, 0)
    tap()
    assert.equal(made.length, 2, 'the next REAL tap rebuilds it')
  })

  test('a timer-driven unlock does not refresh the clock probe, so the dead-clock check keeps its history through a rest', () => {
    install('running'); tap()
    wait(5_000, false); run('_unlockAudio(false)')
    tap()
    assert.equal(made.length, 2)
  })

  test('a timer-driven unlock still builds the very first engine and asks a suspended one to resume', () => {
    install('suspended'); run('_unlockAudio(false)')
    assert.equal(made.length, 1); assert.equal(resumes, 1)
  })

  test('a timer-driven unlock on an interrupted engine does not loop into rebuilds', () => {
    install('running'); tap(); made[0].state = 'interrupted'
    for (let i = 0; i < 6; i++) run('_unlockAudio(false)')
    assert.equal(made.length, 1)
  })

  test('the rest tick unlocks without a tap', () => {
    const src = blankComments(readFileSync(join(REPO, 'js', 'app-runner.js'), 'utf8'))
    const i = src.indexOf('function _restTick(')
    const body = src.slice(i, src.indexOf('\nfunction ', i + 1))
    assert.ok(body.includes('_unlockAudio(false)'), '_restTick calls the timer form')
    assert.ok(!/_unlockAudio\(\)/.test(body), '_restTick never calls the tap form')
  })

  // A tap ANYWHERE counts: the count-in, the interval timer and the set-timer overlay have no button that calls _unlockAudio.
  test('a tap anywhere rebuilds a stale engine, but only while the runner is open, and only once', () => {
    install('running'); tap()
    run('_noteAudioHidden()')
    run('_runner = null'); run('_audioTapUnlock()')
    assert.equal(made.length, 1, 'no runner open: nothing to do')
    run('_runner = {}'); run('_audioTapUnlock()')
    assert.equal(made.length, 2, 'rebuilt by a tap with no handler of its own')
    run('_audioTapUnlock()')
    assert.equal(made.length, 2, 'once, not on every tap')
  })

  test('a tap anywhere leaves a healthy engine alone', () => {
    install('running'); tap(); run('_runner = {}')
    wait(30_000); run('_audioTapUnlock()')
    assert.equal(made.length, 1)
  })

  test('the page listens for touchend AND click, in the capture phase', () => {
    const src = blankComments(readFileSync(join(REPO, 'js', 'app-runner.js'), 'utf8'))
    assert.match(src, /for \(const ev of \['touchend', 'click'\]\) document\.addEventListener\(ev, _audioTapUnlock, true\)/)
  })
})
