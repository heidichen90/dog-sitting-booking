# Local login setup and check (OWNER)

Do this once, before any cloud setup. It adds your dev login to `db.dev.local` and checks the whole login flow against the **dev** database.

`db.dev.local` is gitignored (it matches `*.local`), so it is never committed. The coding agent must not read it; you edit it yourself.

## 1. Add the two lines to `db.dev.local`

Pick a dev-only password (never the production one). Avoid `\` in it: `db.dev.local` is read as a Java properties file.

From the repo root, **append** (`>>`, never `>`, which would wipe the `DB_*` lines). Reading the password with `read -rs` keeps it out of your shell history and off the screen:

```bash
read -rsp 'Dev password: ' DEVPW; echo
printf '%s\n' 'OWNER_USERNAME=ddpetcare' "OWNER_PASSWORD_HASH={noop}${DEVPW}" >> db.dev.local
unset DEVPW
```

Or open `db.dev.local` in a text editor and add the lines `OWNER_USERNAME=ddpetcare` and `OWNER_PASSWORD_HASH={noop}<dev password>`.

Check that both lines are there without printing the file:

```bash
grep -c '^OWNER_' db.dev.local
```

Expected: `2`.

(`{noop}` means "plain password, dev only". Production uses `{bcrypt}...`, and the API refuses to start in production with anything else.)

## 2. Start everything

1. Start Postgres.app.
2. `cd api && ./mvnw spring-boot:run`. The first start applies migration V2 to `dd_pet_care_dev`; the log shows `Migrating schema "public" to version "2 - spring session"`.
3. In another terminal: `cd web && npm run dev`, and open the URL it prints (usually http://localhost:5173).

## 3. Check

- [ ] The login page appears (username, password, Log in).
- [ ] A wrong password shows "Invalid username or password".
- [ ] Log in as `ddpetcare` with your dev password. The booking form loads, with "Log out" in the top bar.
- [ ] Create a booking (new client: there is no Phone field any more). Check History, then cancel it.
- [ ] Reload the page: you're still logged in.
- [ ] Stop the API (Ctrl+C), start it again, and reload: you're still logged in (the session is in the database).
- [ ] In DBeaver (dev database) run:
  ```sql
  SELECT principal_name, to_timestamp(expiry_time / 1000) AS expires FROM spring_session;
  ```
  One row for `ddpetcare`.
- [ ] Click "Log out". The login page appears, and the query above returns no rows.
- [ ] Optional, in the browser's developer tools:
  - Cookies show `SESSION` (HttpOnly) and `XSRF-TOKEN` (not HttpOnly).
  - A `POST` to `/api/bookings` carries an `X-XSRF-TOKEN` header.
- [ ] Optional: delete the `SESSION` cookie in the developer tools, then click something that calls the API. You should see "Your session has ended. Please log in again." and the login page.

The login lasts 30 days from the moment you log in (the cookie expires then, even if you use the app daily). After that you log in again.

If anything differs, stop and report it before any cloud setup.
