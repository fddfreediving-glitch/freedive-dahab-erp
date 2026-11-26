# Deployment and first owner setup

## Before deploying

- Use a persistent disk for `DATA_DIR`; SQLite must not live on an ephemeral deploy filesystem.
- Set `NODE_ENV=production`, `ALLOW_DEMO_LOGIN=false`, and `VITE_ALLOW_DEMO_LOGIN=false`.
- For the first startup only, configure `INITIAL_OWNER_EMAIL`, `INITIAL_OWNER_NAME`, and a unique `INITIAL_OWNER_PASSWORD` with at least 16 characters as deployment secrets.
- Keep the service private until the owner can sign in and required staff accounts have been created with individual passwords and roles.
- Confirm the persistent disk is mounted before the first startup. The database path is `${DATA_DIR}/freedive_dahab.db`.

On an empty production database, startup creates only the configured owner. It does not seed demo accounts, students, inquiries, bookings, or invoices. If the production database already contains a user, the bootstrap settings are ignored and do not reset any account. `ALLOW_DEMO_LOGIN=true` stops production startup.

After confirming the owner can sign in, remove `INITIAL_OWNER_PASSWORD` from the deployment environment. The account remains in SQLite; removing the variable does not change its password.

## Operations

- `GET /health` checks that the server is responding. Monitor this endpoint and the host's deploy logs.
- Run the CI checks before deploying: `npm run typecheck`, `npm test`, and `npm run build`.
- Use the owner-only **Database backup** export regularly and store it outside the service disk. Test restoring a backup to a separate, non-production database before relying on it.
- Keep `DATA_DIR` mounted across releases. Losing the persistent volume loses the business records.

## Local training data

Development mode seeds demo users and records only when the database has no users. The demo passwords and seeded records are for local training and must not be copied into a live database.

## Remaining operational setup

The Google Calendar embed needs a public calendar URL to display external events; the ERP planner data remains separate. Email reminders and outbound messaging need a configured provider before they can deliver messages. Confirm the center's tax, privacy, retention, and backup procedures with the responsible local professionals before live use.
