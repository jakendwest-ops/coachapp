-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SECURITY FIX — cross-tenant leak in the progress-photos storage bucket
-- Found 2026-07-12 by tests/storage-privacy.spec.js (the behavioural audit, extended to Storage).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE LEAK (both CONFIRMED live against production, as an unrelated coach who owns nothing):
--   • READ   — PT2 downloaded another tenant's client progress photo in full (1,791,830 bytes).
--   • DELETE — PT2 deleted another tenant's client progress photo.
--   • UPLOAD — same policy shape, so any authenticated user can also write into any client's folder.
--
-- ROOT CAUSE: three storage.objects policies scoped by bucket_id ALONE, with no path/ownership check
-- and open to every authenticated user:
--
--   "Public read"          SELECT  using   (bucket_id = 'progress-photos')
--   "Authenticated delete" DELETE  using   (bucket_id = 'progress-photos')
--   "Authenticated upload" INSERT  check   (bucket_id = 'progress-photos')
--
-- (The name "Public read" is a misnomer — it is not granted to the anon role, so an unauthenticated
--  stranger is still refused, HTTP 400. It is granted to every *authenticated* user, which is the
--  entire tenant population. That is the breach.)
--
-- WHY DROPPING THEM IS SAFE — the correctly path-scoped policies already exist and cover every
-- legitimate operation for both roles, so nothing legitimate depends on the three broken ones:
--
--   "Client manages own photos"  ALL   foldername[1] = (the caller's own clients.id)
--   "Coach manages client photos" ALL  foldername[1] IN (clients WHERE coach_id = auth.uid())
--
-- A client manages their own {clients.id}/ folder; a coach manages their own clients' folders;
-- nobody else can read, write, or delete. The logos bucket is untouched (its policies are already
-- scoped to auth.uid()).
--
-- PROOF: tests/storage-privacy.spec.js is RED before this runs (PT2 downloads a planted victim photo)
-- and must go GREEN after (PT2 download refused; the client can still manage their own folder).
--
-- Run in the Supabase SQL editor. Safe, minimal, reversible (the dropped policies are reproduced in
-- the comment above should they ever need restoring — though they never should).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

drop policy "Public read"          on storage.objects;
drop policy "Authenticated delete" on storage.objects;
drop policy "Authenticated upload" on storage.objects;

-- Verify — should list ONLY the two correctly-scoped progress-photos policies (plus the logos ones):
--   select policyname, cmd, qual::text, with_check::text
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
