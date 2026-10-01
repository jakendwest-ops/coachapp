// Who may change the goals themselves? A coach and a solo user; never a client (Jake, 2026-10-01). One definition, _canManageGoals,
// gates the Add / Edit / Delete / milestone-Add controls AND every function behind them, so the whole matrix is one table here.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { get, app } from './load-app.mjs'

const ctx = app()
const as = profile => { ctx.__p = profile; vm.runInContext('currentProfile = __p', ctx); return get('_canManageGoals')() }

describe('_canManageGoals', () => {
  test('a coach may', () => assert.equal(as({ role: 'coach' }), true))
  test('a solo user may (their own goals)', () => assert.equal(as({ role: 'solo' }), true))
  test('a CLIENT may not — they track progress on goals their coach set', () => assert.equal(as({ role: 'client' }), false))
  test('an unknown role, a missing role and no profile at all get no controls (fail closed)', () => {
    assert.equal(as({ role: 'admin' }), false)
    assert.equal(as({}), false)
    assert.equal(as(null), false)
  })
})
