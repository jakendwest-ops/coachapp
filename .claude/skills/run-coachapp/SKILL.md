---
name: run-coachapp
description: Run, start, launch, preview, screenshot, or interact with CoachApp — the PT/coach management web app. Use this skill whenever asked to start the dev server, take a screenshot, verify a UI change, or test a feature in the browser.
---

# run-coachapp

CoachApp is a static vanilla JS + Supabase app served by a PowerShell HttpListener on **port 3001**. There is no build step. The server is configured in `.claude/launch.json` and launched via `preview_start "CoachApp"`.

The primary agent interaction path is via the **preview tools** (`preview_start`, `preview_snapshot`, `preview_screenshot`, `preview_click`, `preview_fill`). These are the correct tools — do not use Bash to start the server or Chromium CLI.

---

## Prerequisites

- `.claude/launch.json` at `C:\Users\jaken\coachapp\.claude\launch.json` — already present, no changes needed.
- Supabase project `avilxuiacmtgeoxxhfhc` must be reachable (requires internet). The app will show a loading state and then redirect to login if Supabase is down.
- Active Supabase session (coach login) is persisted in `localStorage` — the app auto-logs in if a session exists. If no session: show the auth screen.

---

## Start the server (agent path)

```
preview_start("CoachApp")
```

Returns a `serverId`. Reuses the server if already running. Always use this — never start a Bash process for the server.

---

## Interact with the running app

Use `serverId` from `preview_start` for all further calls.

### Verify structure / find elements
```
preview_snapshot(serverId)
```
Returns an accessibility tree with element UIDs, text, and roles. **Use this first** — it's faster than a screenshot and gives you UIDs for clicking/filling.

### Take a screenshot
```
preview_screenshot(serverId)
```
Returns a JPEG. Use after UI changes to confirm visual output. Note: can time out if a modal or navigation is mid-flight — check `preview_console_logs` if it does.

### Click a button
```
preview_click(serverId, uid)   // uid from preview_snapshot
```

### Fill a form field
```
preview_fill(serverId, uid, "value")
```

### Check for JS errors
```
preview_console_logs(serverId, level="error")
```

---

## Hosting

- **Live site:** `https://jakendwest-ops.github.io/coachapp` (GitHub Pages)
- **CI/CD:** GitHub Actions — pushes to `master` branch auto-deploy
- **Supabase project:** `avilxuiacmtgeoxxhfhc` (eu-west-1, Ireland)

---

## Cache-busting

`index.html` references `js/app.js?v=N`. After editing `app.js`, bump `v=N` in `index.html` in the same commit. The preview server serves fresh files on every request — no cache issue locally. GitHub Pages CDN caches aggressively — bumping the version is mandatory for every push.

---

## Gotchas

- **`preview_screenshot` times out** if the app is mid-navigation or a Supabase call is in flight. Wait 1–2 seconds and retry, or use `preview_snapshot` instead — it's more reliable.
- **Auth screen shows instead of dashboard** — localStorage session has expired. Jake needs to log in manually.
- **`v=N` must be bumped** on every push or the browser serves the old `app.js` from cache. The preview server is not affected (no caching).
- **Supabase Edge Functions require JWT off** — the `invite-client` function has "Verify JWT" toggled off in the Supabase dashboard. If re-enabled, invite calls will 401.
- **Resize preview to 480×844 after start.** Default 390px causes black bars. Always call `preview_resize(480, 844)` immediately after `preview_start`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `preview_start` returns error | Check `.claude/launch.json` exists at `C:\Users\jaken\coachapp\.claude\launch.json` |
| App shows white screen | Check `preview_console_logs` for JS errors; likely a Supabase connectivity issue or missing `v=N` bump |
| Dashboard shows login form | Session expired — Jake must log in manually |
| Invite sends but `user_id` is null | Edge Function is not running or JWT verification was re-enabled in Supabase |
| GitHub Pages serving stale JS | `v=N` not bumped in `index.html` — bump and push |
