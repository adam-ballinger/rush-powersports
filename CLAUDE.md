# rush-powersports

Apps for Rush Powersports: service shop, tire shop, eBay parts.

# Team

- Jonathan: owner, runs eBay parts and the tire shop mostly alone
- Brad: mechanic, does most of the service work
- Adam (adam-ballinger): developer

# First project: team todo list

Shared todo list for Jonathan, Brad and Adam, phone first.
Today Jonathan keeps it all in his head: projects, daily tasks, calls to make, tires to order, eBay todos.
Next: eBay listing helper (Jonathan's most annoying weekly task).

# v2 (this branch)

Ground-up rebuild, worked on in the `../rush-v2` worktree (branch `v2`). v1 stays on `main` in `../rush-powersports` until launch.

- designed and tested at dev.rush.rxtm.net (Cloud Run service `rush-dev`, db `dev`)
- launch: migrate v1 data into `prod`, deploy v2 as a new revision of service `rush` (rush.rxtm.net); v1 revision kept for rollback only
- login: phone + password. An admin makes a login link (team page, share sheet), the person sets a password in Safari, then signs in again inside the installed home-screen app (it has its own cookies) with Keychain autofill. db sessions in an HttpOnly cookie, 90 days sliding
- first admin / any link from the command line: `node server.js invite <name> <phone> [crew] [manager] [admin]` (`--env-file=.env.prod` for prod)
- nav: two rows of underlined tabs under the title, sections then that section's pages; urls `/<section>/<page>`, all listed in `NAV` (pages.js) and checked with `can()`. Sections so far: Account (Home: hero animation with RUSH POWERSPORTS V2 / By Resource Automation, intro, tour; Issues; Sessions: your phones; Profile), Admin (Users, Sessions, Invites, Events; Users and Sessions rows open `/admin/users/:id`, `/admin/sessions/:id`: edit, unlock, remove, delete). Everyone lands on Account → Home. Future: Service, Team, Shop
- dev db test users: `dev admin`, `dev manager`, `dev crew` (405-555-0201/02/03, one role each). New login link: Admin → Users, or `node server.js invite "dev crew" 405-555-0203`. Throwaway test people use 405-555-01xx
- `npm test` runs `*.test.js` with `node:test`
- data: people as `{ userId, name }`, `tasks` (optionally on a job), append-only `events`, `issues` (`{ text, by, at, doneAt }`; writer or admin edits/deletes, admin marks done); permissions are checked in the handler (writer-or-admin, `userId` filter on own sessions); customers stay text
- files: server.js (routes), db.js, more as needed (pages.js, app.css, app.js, qr.js); tests with `node:test`

# Philosophy

- simplest possible thing
- tiny code tiny docs
- challenge me, I'm new
- flat folder structure

# Tooling

- commonjs
- zero dependencies except `mongodb`, exact versions (.npmrc)
- `.env` holds MONGODB_URI, MONGODB_DB (never committed)
- database: Atlas cluster0 (rush only): v2 uses `prod` / `dev`; v1 still uses `rush` / `rush-dev`
- v2 db users: `.env` readWrite `dev` only; `.env.prod` readWrite `prod` only
- hosting: Cloud Run service `rush`, GCP project resource-automation-61436, us-central1, at rush.rxtm.net (DNS in Squarespace)
- deploy with gcloud from PowerShell (gcloud fails in Git Bash here)
- v1 db users: `.env` is `rush-dev` only (can't touch prod); `.env.prod` is all-access, use `node --env-file=.env.prod ...`; job uses `rush-backup` (read rush, readWrite rush-dev)
- patterns to copy from ../welcome-pumpkin: keys with scopes, terminal-styled pages, Cloud Run deploy

# Backups

v1 only for now: `backup.js` lives on `main`. v2 needs its own backup for `prod` before launch.

Atlas M0 has none, so `backup.js` runs nightly as Cloud Run Job `rush-backup` (Scheduler `rush-backup-nightly`, 2am Chicago).
It saves prod to `gs://rush-backups-61436` (kept 90 days, create-only) and rebuilds `rush-dev` from that file: dev keys kept, phones faked.
A failed run emails Adam (alert "rush backup failed").

Restore (PowerShell):
1. `gcloud storage ls gs://rush-backups-61436` then `gcloud storage cp gs://rush-backups-61436/<file> backups/`
2. try it first: `node --env-file=.env.prod backup.js restore backups/<file> rush-restore-test`
3. for real: `node --env-file=.env.prod backup.js restore backups/<file> rush --prod` (replaces everything in prod, keys included)
