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

Confirmed working output:
```json
{ "serverId": "748dc4c9-78b9-4e36-a772-c7f99e1fecc2", "port": 3001, "name": "CoachApp" }
```

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

## Verified interaction (2026-06-20)

Ran `preview_snapshot` against the live app. Observed:
- Dashboard heading: "Welcome back, Jake 👋"
- Stats: 6 Total clients, 0 Active goals, 0 Sessions logged
- Nav: Dashboard / Clients / Workouts
- Quick actions: "+ Add client", "Build a workout"

This confirmed the app loads, Supabase session is active, and the dashboard renders correctly.

---

## Cache-busting

`index.html` references `js/app.js?v=N`. After editing `app.js`, bump `v=N` in `index.html` before deploying to Netlify. The preview server serves fresh files on every request — no cache issue locally.

---

## Deploy to Netlify (human path)

1. Go to https://superlative-khapse-b92582.netlify.app (Netlify dashboard)
2. Drag all files **inside** `C:\Users\jaken\coachapp\` onto the Netlify dropzone — not the folder itself
3. No build step, no `netlify.toml` needed

---

## Gotchas

- **`preview_screenshot` times out** if the app is mid-navigation or a Supabase call is in flight. Wait 1–2 seconds and retry, or use `preview_snapshot` instead — it's more reliable.
- **Auth screen shows instead of dashboard** — localStorage session has expired. Jake needs to log in manually. The skill cannot log in programmatically (credentials not stored here).
- **`v=N` must be bumped** on every deploy or the browser serves the old `app.js` from cache. The preview server is not affected (no caching).
- **Supabase Edge Functions require JWT off** — the `invite-client` function has "Verify JWT" toggled off in the Supabase dashboard. If re-enabled, invite calls will 401.
- **Netlify invite links** — Supabase Site URL must match the Netlify domain (`https://superlative-khapse-b92582.netlify.app`). If invite links 404, check Supabase Auth → URL Configuration.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `preview_start` returns error | Check `.claude/launch.json` exists at `C:\Users\jaken\coachapp\.claude\launch.json` |
| App shows white screen | Check `preview_console_logs` for JS errors; likely a Supabase connectivity issue or missing `v=N` bump |
| Dashboard shows login form | Session expired — Jake must log in manually |
| Invite sends but `user_id` is null | Edge Function is not running or JWT verification was re-enabled in Supabase |
