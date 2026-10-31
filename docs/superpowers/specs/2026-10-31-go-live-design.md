# Go-live design: login, hosting, backups

**Date:** 2026-10-31
**Status:** approved 2026-10-31
**Builds on:** `2026-10-31-web-api-switch-design.md` (the API-backed website, on `feat/web-api`)
**Branch:** `feat/go-live`, branched from `feat/web-api`

## Goal

Make the API-backed website usable on the live Vercel site:
- **Login:** the API must not be public without it.
- **Hosting:** host the API and a production database.
- **Backups:** back up client data safely.

The owner is the only user, on a phone and a laptop.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Priority | Free or near-free and simple | Sole-trader budget |
| Login | Own login with Spring Security; one owner account | No outside service; standard and bank-relevant |
| Sessions | Stored in Postgres (`spring-session-jdbc`); you log in again 30 days after each login (approved 2026-10-31) | Survives restarts and scale-to-zero; logout and password changes end sessions for real |
| Session cookie | `SESSION`, `HttpOnly`, `Secure`, `SameSite=Lax`; holds only a random session id | Scripts can't read it; the database row is the source of truth |
| API hosting | Google Cloud Run, `europe-west2` (London), scale to zero, at most 1 instance | About £0 at this volume; a single instance means Flyway never runs twice at once |
| Database | Neon free plan, PostgreSQL 18, London region | Permanent free plan; same major version as dev and CI |
| Cold start | Accepted: about 5–15 s on the first API call after idle. Requests wait, they aren't lost | A free warm-up ping is a documented option for later |
| Website routing | `vercel.json` rewrite of `/api/:path*` to the Cloud Run URL | One origin in the browser: first-party cookies, no CORS |
| Backups | Nightly encrypted `pg_dump` to a private Cloud Storage bucket in London | Neon free only restores within 6 hours |
| Phone numbers | Field hidden on the website; the `phone` column stays | Data minimisation until the WhatsApp phase needs it |
| Old browser-stored bookings | Not migrated; the owner starts fresh | The owner has none to keep |
| Branching | Stacked: `feat/go-live` → PR into `feat/web-api`; then `feat/web-api` → `main` once | `main` (and Vercel) changes only when everything works together |

### New dependencies (approval required)

- `spring-boot-starter-security`
- `spring-session-jdbc`
- `spring-security-test` (test scope)

No new website dependencies.

### Tools used outside the codebase

- `age`, a file-encryption tool, used only in the backup workflow and by the owner when restoring.
- `pg_dump` / `psql` 18.

## Part 1: Login

### Owner account

- **One account.** The username and password come from configuration: `OWNER_USERNAME`, and `OWNER_PASSWORD_HASH` in `DelegatingPasswordEncoder` format (`{bcrypt}…` in production, `{noop}…` allowed in dev only).
  - **Locally:** from `db.dev.local`.
  - **In production:** from Google Secret Manager.
  - There's no users table.
- **Changing the password:**
  1. Update the secret.
  2. Redeploy.
  3. Run the documented SQL `DELETE FROM spring_session;` against production. This logs out every device.

### Local login setup

- **Local credentials:** `db.dev.local` (gitignored) gets two lines, added by the owner or by the coding agent on the owner's request (append-only; the file is never read or printed):
  ```
  OWNER_USERNAME=ddpetcare
  OWNER_PASSWORD_HASH={noop}<dev password>
  ```
  - `OWNER_PASSWORD_HASH` uses Spring Security's `DelegatingPasswordEncoder` format. `{noop}` means a plain dev-only password; production uses `{bcrypt}<hash>`.
  - The existing `DB_*` lines (database role `ddpet_dev`) are unchanged.
- **Production guard:** with the `prod` profile, the API fails at startup if `OWNER_PASSWORD_HASH` doesn't start with `{bcrypt}`, so a plain password can't be deployed.
- **Production password:** a separate, strong one, never the dev password. Its bcrypt hash is generated with a documented one-liner using the project's classpath, and stored in Secret Manager.
- **Dev profile:** the session cookie isn't `Secure` (plain `http://localhost`), and `/v3/api-docs` stays open without login.
- **Owner check before any cloud setup:**
  1. Start the API and `npm run dev`.
  2. Confirm the login page appears.
  3. Log in as `ddpetcare`, use the app, and log out.
  4. Check the `spring_session` table in DBeaver (dev database).

### Sessions

- `spring-session-jdbc` stores sessions in `spring_session` and `spring_session_attributes`.
- **Migration:** a new `V2__spring_session.sql` creates them, using Spring Session's PostgreSQL schema, copied into our migration so Flyway owns it.
- **Initialisation:** Spring Session's own schema initialisation is disabled.
- **Timeout:** the server-side session expires after 30 days of inactivity, and the `SESSION` cookie has a fixed 30-day `Max-Age` from login. So each device logs in again 30 days after login (owner decision, 2026-10-31). Spring Session's cleanup job removes expired rows.
- **Cookie:** `SESSION`, with `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Locally over `http://localhost`, `Secure` is off via the dev profile.

### Endpoints

| Method | Path | Auth | Result |
|---|---|---|---|
| `POST` | `/api/login` | Public | Body `{ "username", "password" }`. `204` and a session cookie on success. `401` ProblemDetail "Invalid username or password" on failure (the same message whichever part is wrong). `429` when throttled |
| `POST` | `/api/logout` | Logged in | Deletes the session. `204` |
| `GET` | `/api/me` | Logged in | `200 { "username" }`. The website calls it on startup |
| everything else under `/api/**` | | Logged in | Without a valid session: `401` ProblemDetail (no redirect, no HTML login page) |
| `GET` | `/actuator/health` | Public | Unchanged |

- **Production:** `/v3/api-docs` and Swagger UI are disabled.
- **Local dev:** they stay on, without login, so `npm run gen:api` keeps working.

### CSRF

- **Approach:** Spring Security's cookie-based CSRF for single-page apps. The API sets a readable `XSRF-TOKEN` cookie; the website sends its value in an `X-XSRF-TOKEN` header on every non-GET request.
- **Website:** `client.ts` adds the header.
- **Exemption:** `POST /api/login` is exempt, since there's no session yet. It's protected by `SameSite=Lax` and the throttle.
- **Missing or wrong token:** `403` ProblemDetail.

### Brute-force throttle

- **Rule:** after 5 failed logins within 15 minutes, further login attempts return `429` ProblemDetail ("Too many attempts, try again later") for 15 minutes. A successful login resets the count.
- **Storage:** in memory, which is enough with at most one instance. A restart resets the count; accepted.

### Website

- **On startup:** `App` calls `GET /api/me`.
  - `401` shows the **login page** (username, password, Log in button, error message).
  - `200` loads clients and bookings as today.
- **Session ends mid-use:** any `ApiError` with status `401` from any call returns to the login page and keeps nothing sensitive in memory.
- **Log out:** a button in the app bar calls `/api/logout`, then shows the login page.
- **Phone:** the Phone field and its conversion are removed from the form. New clients send `{ name }` only. The duplicate-name warning stays.
  - **Kept, unused:** `phone.ts` and its tests stay in the codebase for the WhatsApp phase.
  - **Removed:** the 409 "number belongs to …" UI is deleted with its tests. The API still supports the 409.

### Tests

**API**, using `spring-security-test`:
- Every existing endpoint test runs as a logged-in owner, with a CSRF token on non-GET requests. This is done once in `DatabaseTest`'s request helpers, e.g. `@WithMockUser` plus `.with(csrf())`, so individual tests don't change.
- New tests:
  - unauthenticated → `401`
  - correct login → `204` plus cookie, and `/api/me` works
  - wrong password → `401` with the same message for a wrong username
  - throttle → `429` after 5 failures
  - logout → session row deleted, and later calls `401`
  - non-GET without a CSRF token → `403`
  - a session row is written to `spring_session`
  - `/actuator/health` is public
  - the production profile has `/v3/api-docs` disabled

**Website:**
- startup → login page on `401`
- login success → app loads
- login failure message
- `401` mid-use → back to the login page
- logout
- `X-XSRF-TOKEN` header sent on POST
- the form no longer shows Phone

## Part 2: Hosting

### Google Cloud (project: owner-created)

- **Cloud Run service `ddpet-api`:**
  - region `europe-west2`
  - min instances 0, max instances 1
  - 512 MiB memory, 1 vCPU
  - request timeout 60 s
  - allow unauthenticated invocations (the API's login protects the data)
  - environment: `SPRING_PROFILES_ACTIVE=prod`
  - secrets mounted from Secret Manager: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `OWNER_USERNAME`, `OWNER_PASSWORD_HASH`
- **Artifact Registry** Docker repository in `europe-west2` for the API image.
- **Secret Manager** for the five secrets above.
- **Workload Identity Federation:**
  - GitHub Actions in this repo can impersonate two service accounts, each with only what it needs. The trust condition allows only this repository and the `main` branch, plus `feat/go-live` until it merges (see Part 5):
    - **deployer:** push images, deploy Cloud Run
    - **backup-writer:** `storage.objectCreator` on the backup bucket only
  - There are no service-account keys.

### Neon

- **Project** in the London region, PostgreSQL 18, database `dd_pet_care_prod`.
- **Credentials:** the connection string goes only into Secret Manager (and the owner's password manager). Never into the repo or CI logs.

### API production profile (`application-prod.yml`)

- **springdoc:** API docs and Swagger UI disabled.
- **Session cookie:** `Secure` on.
- **Behind a proxy:** forwarded headers trusted (`server.forward-headers-strategy: framework`), since Cloud Run and Vercel are proxies.
- **Logging:** the default; no personal data logged (existing rule).

### Container

- **`api/Dockerfile`:** a multi-stage build. The build stage is a Maven + JDK 21 image that runs `./mvnw -DskipTests package`; the runtime stage is a JRE 21 image running the jar as a non-root user.
- **JVM flags** for 512 MiB: `-XX:MaxRAMPercentage=75`. Tests run in CI before the image is built.

### Deploy workflow (`.github/workflows/api-deploy.yml`)

- **Trigger:** push to `main` touching `api/**`, plus a manual trigger.
  - **Before the merge:** GitHub only offers manual and scheduled runs for workflows already on `main`. So the workflow also triggers on pushes to `feat/go-live` touching `api/**`. That trigger and the branch's Workload Identity Federation permission are removed in the merge PR.
- **Steps:**
  1. Run the API tests (same as `api.yml`).
  2. Authenticate to Google via Workload Identity Federation.
  3. Build and push the image tagged with the commit SHA.
  4. `gcloud run deploy` with that tag.
  5. Smoke-test `GET /actuator/health` on the service URL.
- **Never prints secrets.** The repo is public, so its logs are public.

### Website routing (`web/vercel.json`)

- **Rewrite:** `/api/:path*` → `https://ddpet-api-<PROJECT_NUMBER>.europe-west2.run.app/api/:path*`. The file is committed with a `PROJECT_NUMBER` placeholder that the owner fills in after the first deploy (`docs/runbooks/cloud-setup.md`).
- **Timeout:** Vercel's limit for external rewrites is 120 s, and Cloud Run's request timeout is set to 60 s, so a 5–15 s cold start fits. No setup step is needed.

## Part 3: Backups

### Workflow (`.github/workflows/db-backup.yml`)

- **Trigger:** schedule, daily at 02:00 UK time, plus manual.
- **Steps:**
  1. Install `postgresql-client-18` and `age`.
  2. Authenticate as **backup-writer** via Workload Identity Federation.
  3. `pg_dump --format=custom` from Neon, streamed straight into `age -r <owner public key>`, streamed into `gcloud storage cp - gs://<bucket>/ddpet-<UTC timestamp>.dump.age`.
     - No plain-text file is written.
     - Nothing is echoed.
- **Inputs:**
  - The Neon connection string is a GitHub Actions **secret**.
  - The `age` **public** key is a repository variable; it's safe to publish.
- **Failure:** a failed run emails the owner (GitHub default).

### Bucket

- **Location:** `europe-west2`, Standard class.
- **Access:**
  - **Public access prevention: enforced.** Uniform bucket-level access.
  - **Readers:** only the owner's Google account. The backup-writer can create objects, but not read, list or delete them.
- **Lifecycle:** delete objects older than 30 days.

### Keys and restore

- **Key creation:** the owner generates an `age` key pair locally and stores the **private key** in a password manager, and optionally on paper. Losing it makes the backups unrecoverable.
- **Documented restore** (`docs/runbooks/restore-backup.md`):
  1. Download a backup.
  2. `age -d -i key.txt`.
  3. `pg_restore` into a scratch database.
  4. Check row counts.
- **Test restore:** done once before go-live, into a local scratch database (not dev, not prod).

## Part 4: Security checklist (owner)

- **Two-step verification** on Google, Neon, GitHub and Vercel.
- **Password manager entries:** the owner login password, the `age` private key, and the Neon credentials.
- **Repo:** public. CI secrets live only in GitHub Actions secrets or Secret Manager.

## Part 5: Order of work and go-live

1. **Build on `feat/go-live`, tested locally,** ending with the owner's local login check (see "Local login setup"):
   - login (API and website)
   - hide the phone field
   - production profile and Dockerfile
   - `vercel.json`, deploy and backup workflows
   - runbooks
2. **Owner setup:** follow `docs/runbooks/cloud-setup.md`, a step-by-step checklist covering the Google Cloud project and billing, the APIs, Artifact Registry, Secret Manager, Workload Identity Federation, the Neon project, the bucket, and the `age` key pair.
3. **First deploy:** a push to `feat/go-live` triggers the deploy workflow. Then confirm health, and confirm that login works directly against the Cloud Run URL. Deploying the API doesn't touch the live website.
4. **Vercel preview** of `feat/web-api` (with `feat/go-live` merged into it):
   - set the rewrite target
   - log in, create a booking, view history, cancel it
   - check the rows exist in Neon
5. **Backups:**
   - **Before the merge:** the owner runs the backup runbook's commands once locally (the same `pg_dump | age | gcloud storage cp` pipeline), then test-restores that backup into a local scratch database.
   - **After the merge:** the scheduled workflow takes over. The owner triggers it manually once and checks a new object appears in the bucket.
6. **Merge:**
   1. The `feat/go-live` PR into `feat/web-api`, after removing the temporary `feat/go-live` deploy trigger and its Workload Identity Federation permission.
   2. The `feat/web-api` PR into `main` once. Vercel deploys the live site.
   3. Check the live site end to end.

## Out of scope

- Moving old browser-stored bookings (starting fresh).
- Phone numbers (until the WhatsApp phase).
- The warm-up ping (optional later).
- Custom domain.
- Monitoring and alerting beyond workflow-failure emails.
- Multiple users or roles.
- Moving CI to Node 22.
