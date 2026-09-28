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
- hosting: Cloud Run service `rush`, GCP project resource-automation-61436, us-central1, at r.rxtm.net (DNS in Squarespace)
- deploy with gcloud from PowerShell (gcloud fails in Git Bash here)
- patterns to copy from ../welcome-pumpkin: keys with scopes, terminal-styled pages, Cloud Run deploy
