# Il Camper Sacro — servizio di prenotazione

A small web service to book a camper van on a shared calendar.

- **Landing page** with the creed *"Il camper é il miglior amico dell'uomo"*, an
  animated camper driving along with friends partying on board, and the question
  *"Il camper é sacro"*. **Agree** leads to the dashboard (via login if needed);
  **Disagree** politely closes the door.
- **Dashboard** with a month calendar: click a day for the start and a second day
  for the end of the stay, then book. Days already taken are shown with the name
  of whoever booked them and cannot be selected.
- **To-do list** where anyone adds what needs doing before the trip and assigns a
  task to themselves with one click. A task can be claimed only while it is free,
  released again, marked done and reopened; filters narrow the list to the open,
  free, mine or finished ones.
- **Destinations** where travellers propose the stops of the trip, each with its
  own **wishlist**: every user asks for the products they would like brought back
  from that place, and whoever buys one ticks it off — the buyer does not have to
  be the person who asked.
- **Admin area** where an administrator creates the usernames and passwords that
  people log in with, resets passwords, deactivates accounts, and adds campers.

There is no self service sign up: accounts exist only because an admin created
them.

## Stack

Node.js + Express, PostgreSQL (`pg`), server side sessions stored in Postgres
(`express-session` + `connect-pg-simple`), bcrypt password hashes, and a
dependency-free vanilla JS front end in `public/`.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and SESSION_SECRET
npm start
```

`npm start` creates the tables if they are missing and creates the first
administrator, then serves the app on `PORT` (default 3000).

If `ADMIN_PASSWORD` is left empty a random password is generated and printed to
the log **once** — copy it before it scrolls away. Use `npm run migrate` to
apply the schema on its own, and `npm run seed-admin` to create the
administrator on its own.

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Required. |
| `SESSION_SECRET` | Signs the session cookie. Required when `NODE_ENV=production`. |
| `ADMIN_USERNAME` | Username of the bootstrap administrator (default `admin`). |
| `ADMIN_PASSWORD` | Its password. Generated and logged once if empty. |
| `PORT` | HTTP port (default 3000). |
| `PGSSLMODE` | Set to `disable` for a local Postgres without TLS. |

Managed providers present a certificate that is not in the public trust store,
so TLS is enabled with relaxed verification unless `PGSSLMODE=disable`.

## Database

The service owns seven tables, all prefixed `camper_` so it can share a database
with other applications (`src/schema.sql`):

| Table | Contents |
| --- | --- |
| `camper_users` | accounts, bcrypt hashes, admin and active flags |
| `camper_vehicles` | the campers that can be booked |
| `camper_reservations` | one row per stay, `start_date`/`end_date` inclusive |
| `camper_tasks` | to-do items, their status and who claimed them |
| `camper_destinations` | the stops of the trip |
| `camper_wishlist_items` | products requested from a destination |
| `camper_session` | session storage |

The schema is applied on every start and only ever adds what is missing, so an
existing installation picks up new tables by restarting.

Two reservations for the same camper can never overlap. Every booking takes a
`SELECT … FOR UPDATE` lock on the camper row before checking for a clash, so
concurrent requests are serialised; where the `btree_gist` extension is
available (`src/schema_exclusion.sql`, applied on a best effort basis) the
database enforces the same rule with an exclusion constraint.

## HTTP API

All endpoints answer JSON and require a session cookie unless noted.

| Method & path | Who | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | anyone | sign in |
| `POST /api/auth/logout` | anyone | sign out |
| `GET /api/auth/me` | user | current account |
| `POST /api/auth/password` | user | change own password |
| `GET /api/vehicles` | user | bookable campers |
| `GET /api/reservations` | user | reservations, optional `from`, `to`, `vehicleId` |
| `POST /api/reservations` | user | book `{vehicleId, startDate, endDate, note}` |
| `DELETE /api/reservations/:id` | owner or admin | cancel |
| `GET/POST /api/tasks` | user | list and add to-do items |
| `POST /api/tasks/:id/assignee` | user | claim a free task, or release your own |
| `POST /api/tasks/:id/status` | creator, assignee or admin | `todo`, `doing`, `done` |
| `DELETE /api/tasks/:id` | creator or admin | remove a task |
| `GET/POST /api/destinations` | user | list and add trip stops |
| `DELETE /api/destinations/:id` | creator or admin | remove a stop and its wishlist |
| `GET/POST /api/destinations/:id/wishlist` | user | read the wishlist, add a product |
| `POST /api/wishlist/:id/fulfilled` | user | mark a product bought, or undo it |
| `DELETE /api/wishlist/:id` | owner or admin | remove a wish |
| `GET/POST /api/admin/users` | admin | list and create accounts |
| `POST /api/admin/users/:id/password` | admin | reset a password |
| `POST /api/admin/users/:id/active` | admin | activate or deactivate |
| `DELETE /api/admin/users/:id` | admin | delete an account |
| `GET/POST /api/admin/vehicles` | admin | list and add campers |
| `GET /api/health` | anyone | liveness plus a database ping |

A booking is rejected when the dates are malformed or in the past, when the end
precedes the start, when the stay is longer than 60 days, or when the camper is
already taken (`409`). Claiming a task that somebody else already holds is
rejected the same way: the update only matches while `assignee_id` is still
null, so two people racing for the same task cannot both win.

## Testing

With the service running:

```bash
BASE=http://localhost:3000 ADMIN_PASSWORD=... ./scripts/smoke.sh
```
