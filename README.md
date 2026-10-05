# CoachApp

A web app for personal trainers to manage clients and build, assign and track workout programmes. It is built by a working PT, who is also its main
user. There are three roles: **coach**, **client** and **solo** (a coach who also trains themselves).

**Live:** https://jakendwest-ops.github.io/coachapp

## How it is built

- Plain vanilla JavaScript in the browser: no framework, no TypeScript, no build step. `index.html` loads `css/main.css` and the modules in `js/` directly.
- Backend: [Supabase](https://supabase.com) (Postgres with row-level security, Auth and Storage). SQL and setup scripts are in `scripts/`.
- Tests: Playwright end-to-end tests in `tests/`, plus a small `node:test` suite for pure functions in `tests-node/`.
- Hosting: GitHub Pages. Pushing to `master` does **not** deploy; pushing a release tag (`v*`) does, through GitHub Actions. A release is cut with
  `node scripts/release.mjs`.

## Run it locally

```bash
npm install
node scripts/preview-server.mjs . 3001   # then open http://localhost:3001
npm run test:unit                        # pure-function tests; no browser or login needed
npm test                                 # end-to-end suite; needs test accounts, see below
```

The preview server answers only on your own machine. The end-to-end suite starts its own server and signs in to a real Supabase project, so copy
`.env.example` to `.env` and fill in your own test accounts first. It is slow: a full run takes the better part of an hour.

## Where to read next

- [`docs/handover.md`](docs/handover.md): orientation for a developer new to the codebase.
- [`docs/architecture.md`](docs/architecture.md) and [`docs/schema.md`](docs/schema.md): the modules, the data layer, the tables and the two-level
  editing model (a programme is a shared master; a client's plan is their own copy).
- [`CLAUDE.md`](CLAUDE.md): the project's working rules, written for the AI coding assistant that helps build it, and the best list of what must not break.
- [`docs/vision.md`](docs/vision.md) and [`docs/roadmap.md`](docs/roadmap.md): what the app is for and what comes next.
