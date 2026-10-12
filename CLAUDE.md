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

# Philosophy

- simplest possible thing
- tiny code tiny docs
- challenge me, I'm new
- flat folder structure

# Tooling

- commonjs
- zero dependencies except `mongodb`, exact versions (.npmrc)
- `.env` holds MONGODB_URI, MONGODB_DB (never committed)
- database: Atlas cluster0, own `rush` / `rush-dev` databases and own db user
- hosting: Cloud Run service `rush`, GCP project resource-automation-61436, us-central1, at rush.rxtm.net (DNS in Squarespace)
- deploy with gcloud from PowerShell (gcloud fails in Git Bash here)
- db users: `.env` is `rush-dev` only (can't touch prod); `.env.prod` is all-access, use `node --env-file=.env.prod ...`; job uses `rush-backup` (read rush, readWrite rush-dev)
- patterns to copy from ../welcome-pumpkin: keys with scopes, terminal-styled pages, Cloud Run deploy

# Backups

Atlas M0 has none, so `backup.js` runs nightly as Cloud Run Job `rush-backup` (Scheduler `rush-backup-nightly`, 2am Chicago).
It saves prod to `gs://rush-backups-61436` (kept 90 days, create-only) and rebuilds `rush-dev` from that file: dev keys kept, phones faked.
A failed run emails Adam (alert "rush backup failed").

Restore (PowerShell):
1. `gcloud storage ls gs://rush-backups-61436` then `gcloud storage cp gs://rush-backups-61436/<file> backups/`
2. try it first: `node --env-file=.env.prod backup.js restore backups/<file> rush-restore-test`
3. for real: `node --env-file=.env.prod backup.js restore backups/<file> rush --prod` (replaces everything in prod, keys included)
