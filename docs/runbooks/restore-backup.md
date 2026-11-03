# Backups by hand, and restoring one (OWNER)

Run every command in **bash**, with these set (Postgres.app's tools, and pipelines that fail if any part fails):

```bash
set -o pipefail
PG=/Applications/Postgres.app/Contents/Versions/18/bin
```

You need `gcloud` (logged in as the project owner), `age`, and Postgres.app 18 running.

## Take a backup by hand

This is the same pipeline the nightly workflow runs. The dump is never written to disk unencrypted. Use it for the manual pre-merge backup (`go-live.md`, step 5).

```bash
read -rsp 'Neon libpq connection string: ' NEON_BACKUP_URL; echo
"$PG/pg_dump" --format=custom --no-owner --no-privileges "$NEON_BACKUP_URL" \
  | age -r '<AGE_PUBLIC_KEY>' \
  | gcloud storage cp - "gs://<BUCKET>/ddpet-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
unset NEON_BACKUP_URL
gcloud storage ls -l gs://<BUCKET>/
```

The connection string is read silently, so it isn't in your shell history. (It is briefly visible to other local processes as an argument; that's acceptable on your own laptop.)

Expected: no error, and a new `ddpet-<timestamp>.dump.age` object of a few KB or more.

## Restore into a local scratch database and check it

Use a scratch database only: never `dd_pet_care_dev`, `dd_pet_care_test` or production. Work in an empty temporary folder, not inside the repository:

```bash
cd "$(mktemp -d)"
```

1. Pick a backup and download it:
   ```bash
   gcloud storage ls gs://<BUCKET>/
   gcloud storage cp gs://<BUCKET>/ddpet-<TIMESTAMP>.dump.age .
   ```
2. Recreate the key file from your password manager (run the first command, paste the `AGE-SECRET-KEY-1...` line, press Enter, then Ctrl+D), and decrypt:
   ```bash
   (umask 077; cat > ddpet-backup-key.txt)
   age -d -i ddpet-backup-key.txt -o ddpet.dump ddpet-<TIMESTAMP>.dump.age
   ```
3. Restore:
   ```bash
   "$PG/createdb" ddpet_restore_check
   "$PG/pg_restore" --no-owner --no-privileges --exit-on-error --dbname=ddpet_restore_check ddpet.dump
   ```
4. Check row counts:
   ```bash
   "$PG/psql" -d ddpet_restore_check -c "
     SELECT 'clients' AS t, count(*) FROM clients
     UNION ALL SELECT 'dogs', count(*) FROM dogs
     UNION ALL SELECT 'bookings', count(*) FROM bookings
     UNION ALL SELECT 'booking_stays', count(*) FROM booking_stays
     UNION ALL SELECT 'flyway_schema_history', count(*) FROM flyway_schema_history;"
   ```
   Run the same query in Neon's SQL editor (database `dd_pet_care_prod`). The numbers should match, apart from anything created since the backup. `flyway_schema_history` should show at least 2 (V1 and V2).
5. Clean up:
   ```bash
   "$PG/dropdb" ddpet_restore_check
   rm -P ddpet.dump ddpet-backup-key.txt ddpet-<TIMESTAMP>.dump.age
   ```

## Restoring production for real

Only if Neon's own 6-hour restore can't help. Create a **new** Neon database, `pg_restore` into it with the same command, point the `ddpet-db-url` secret at it, and redeploy. Plan it first; don't restore over the live database.
