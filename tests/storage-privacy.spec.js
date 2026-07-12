const { test, expect } = require('./fixtures')
const { loginAsClient, loginAsPT2 } = require('./helpers')

/**
 * STORAGE SECURITY
 * ================
 * The behavioural RLS audit (rls-audit.spec.js) covers `public.*` tables. It does NOT cover Supabase
 * Storage — a separate RLS surface (storage.objects) with its own policies — and /deploy-check used
 * to check storage only as a config read: `select id, public from storage.buckets`. But `public =
 * false` is a claim about configuration; what actually matters is whether a stranger can pull down a
 * client's progress photo. So these tests attempt the reads for real.
 *
 * The progress-photos FEATURE (upload/view UI) was removed 2026-07-12, but the BUCKET and its
 * contents remain (restorable), and it holds at least one real photo — so guarding it matters MORE
 * now that no UI is watching it. If the bucket were ever flipped public, or storage.objects RLS
 * dropped, these go red.
 */
test.describe('Storage privacy', () => {

  test('an unauthenticated stranger cannot fetch a progress photo by URL', async ({ page }) => {
    // `public = false` proven behaviourally: upload as the client, then fetch the "public" URL with
    // no credentials at all. A 200 means client body photos — health data — are served to anyone
    // holding the link, no login. That is a reportable breach, not a config nit.
    await loginAsClient(page)

    const probe = await page.evaluate(async () => {
      // Upload into the client's OWN folder ({clients.id}/…). The correctly-scoped "Client manages
      // own photos" policy only permits writes there — a probe that uploaded to some arbitrary path
      // would (rightly) be denied once the over-broad "Authenticated upload" policy is dropped.
      const { data: me } = await db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id','is',null).single()
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
      const path = `${me.id}/__e2e-privacy-probe__${Date.now()}.png`
      const { error: upErr } = await db.storage.from('progress-photos').upload(path, new Blob([bytes], { type: 'image/png' }))
      if (upErr) return { fatal: `upload failed: ${upErr.message}` }

      // getPublicUrl always hands back a URL — it does not check whether the bucket is public. What
      // the network returns for it is the finding.
      const { data } = db.storage.from('progress-photos').getPublicUrl(path)
      let status = null, bodyLen = null
      try {
        const res = await fetch(data.publicUrl, { method: 'GET', credentials: 'omit' })
        status = res.status
        bodyLen = (await res.arrayBuffer()).byteLength
      } catch { status = 'network-error' }

      await db.storage.from('progress-photos').remove([path])
      return { status, bodyLen }
    })

    expect(probe.fatal, 'could not upload a probe photo, so this proves nothing').toBeUndefined()

    console.log('\n═══ storage privacy — anonymous fetch ═══')
    console.log(`  anonymous GET → HTTP ${probe.status}${probe.bodyLen != null ? ` (${probe.bodyLen} bytes)` : ''}`)
    console.log(`  ${probe.status === 200 ? '🔴 BUCKET IS PUBLIC — client health data served with no auth' : '✅ private — stranger is refused'}`)
    console.log('═════════════════════════════════════════\n')

    expect(probe.status, 'progress-photos is PUBLIC: a client\'s body photos are downloadable by anyone with the URL, no login. Reportable breach.').not.toBe(200)
  })

  test('an unrelated coach cannot download another tenant\'s progress photo', async ({ browser }) => {
    // Probe A, for storage. PT2 is a real, authenticated coach who owns NOTHING and shares no client
    // with anyone, so any progress photo they can DOWNLOAD is some other tenant's client's body photo.
    //
    // This OWNS its victim rather than relying on whatever happens to be in the bucket — a probe that
    // depends on ambient data goes falsely green the moment that data is cleaned up (the exact trap
    // that has bitten this harness before). The real client plants a photo in their OWN folder; PT2
    // attempts to download that specific path; the client tears it down. So the test proves the
    // policy, not the bucket's current contents.
    const clientCtx = await browser.newContext()
    const pt2Ctx = await browser.newContext()
    const clientPage = await clientCtx.newPage()
    const pt2Page = await pt2Ctx.newPage()
    let victimPath, result

    try {
      // ── Plant, as the CLIENT (their own folder) ──────────────────────────────────────────────
      await loginAsClient(clientPage)
      const planted = await clientPage.evaluate(async () => {
        const { data: me } = await db.from('clients').select('id').eq('user_id', currentUser.id).not('coach_id','is',null).single()
        const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])
        const path = `${me.id}/__e2e-crosstenant__${Date.now()}.png`
        const { error } = await db.storage.from('progress-photos').upload(path, new Blob([bytes], { type: 'image/png' }))
        return { path, err: error?.message || null }
      })
      expect(planted.err, 'client could not upload their own photo, so this proves nothing').toBeNull()
      victimPath = planted.path

      // ── Attempt to steal it, as an UNRELATED COACH ───────────────────────────────────────────
      await loginAsPT2(pt2Page)
      result = await pt2Page.evaluate(async (path) => {
        const { data: blob, error } = await db.storage.from('progress-photos').download(path)
        return { downloadedBytes: (!error && blob) ? blob.size : null, err: error?.message || null }
      }, victimPath)
    } finally {
      await clientPage.evaluate(async (path) => { if (path) await db.storage.from('progress-photos').remove([path]) }, victimPath).catch(() => {})
      await clientCtx.close().catch(() => {})
      await pt2Ctx.close().catch(() => {})
    }

    console.log('\n═══ storage cross-tenant — coach who owns nothing ═══')
    console.log(`  victim photo: ${victimPath}`)
    console.log(`  PT2 download → ${result.downloadedBytes != null ? `🔴 ${result.downloadedBytes} bytes` : `✅ refused (${result.err})`}`)
    console.log('════════════════════════════════════════════════════\n')

    expect(result.downloadedBytes, 'a coach who owns nothing downloaded another tenant\'s client photo — storage.objects SELECT policy on progress-photos is scoped to any authenticated user instead of the owning client + their coach').toBeNull()
  })
})
