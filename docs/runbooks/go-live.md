# Go-live (OWNER)

Spec Part 5, steps 3-6. First do `local-login.md` and `cloud-setup.md`. The coding agent never pushes, merges or touches the cloud. Run commands in **bash**.

This repository is public: never paste real project ids, URLs, passwords or keys into commits, issues or chats.

## Step 3: First deploy

1. Push the branch (this is the first push of `feat/go-live`):
   ```bash
   git push -u origin feat/go-live
   ```
   The push changes `api/**`, so **api-deploy** starts (Actions tab). It runs the tests, then builds, pushes and deploys `ddpet-api`, and checks health.
   - If the run failed because setup wasn't finished, finish it, then open the run and click **Re-run all jobs**. Pushing again only starts a new run if the push changes something under `api/`.
2. Confirm the service URL:
   ```bash
   gcloud run services describe ddpet-api --region=europe-west2 --format='value(status.url)'
   ```
   It should look like `https://ddpet-api-<PROJECT_NUMBER>.europe-west2.run.app`. Call it `<CLOUD_RUN_URL>`.
3. Health, docs off, and login directly against Cloud Run:
   ```bash
   jar=$(mktemp)
   curl -s <CLOUD_RUN_URL>/actuator/health                                 # {"status":"UP"}
   curl -s -o /dev/null -w '%{http_code}\n' <CLOUD_RUN_URL>/v3/api-docs    # 404
   curl -s -o /dev/null -w '%{http_code}\n' <CLOUD_RUN_URL>/api/clients    # 401
   read -rsp 'Production owner password: ' PW; echo
   python3 -c 'import json,sys; print(json.dumps({"username": "ddpetcare", "password": sys.argv[1]}))' "$PW" \
     | curl -s -i -c "$jar" -H 'Content-Type: application/json' --data-binary @- \
       <CLOUD_RUN_URL>/api/login | grep -iE '^(HTTP|set-cookie: SESSION)'
   unset PW
   curl -s -b "$jar" <CLOUD_RUN_URL>/api/me          # {"username":"ddpetcare"}
   rm "$jar"
   ```
   Expected:
   - `HTTP/2 204`.
   - A `set-cookie: SESSION=...` line containing `Secure`, `HttpOnly` and `SameSite=Lax`.
   - Then `{"username":"ddpetcare"}`.
4. In Neon's SQL editor (`dd_pet_care_prod`): `SELECT version, description FROM flyway_schema_history;` shows 1 and 2.
5. Point the website at the API: replace `PROJECT_NUMBER` in `web/vercel.json` with `<PROJECT_NUMBER>`, either yourself or by asking the coding agent. Commit it, after approving the message `chore(web): point the /api rewrite at the Cloud Run service`, and push. This doesn't touch `api/`, so no deploy runs.

Deploying the API doesn't change the live site: Vercel's production still builds `main`.

## Step 4: Vercel preview

Vercel builds a preview for every pushed branch. `feat/go-live` contains all of `feat/web-api` plus this work, so its preview is what `feat/web-api` will be after the merge.

1. Vercel, the project, Deployments, the latest `feat/go-live` preview, Visit.
2. Check, on the laptop and on the phone:
   - [ ] The login page appears.
   - [ ] A wrong password shows the message. Then log in.
   - [ ] Create a booking (use a client name like "Test Client"), check History, cancel it.
   - [ ] Log out and see the login page.
3. Neon SQL editor:
   ```sql
   SELECT count(*) FROM clients; SELECT count(*) FROM bookings; SELECT status FROM bookings ORDER BY id DESC LIMIT 1;
   ```
   The test rows are there, and the last booking is `cancelled`.
4. Optional, to remove the test data: in the Neon SQL editor, find the ids with `SELECT id, name FROM clients;`, then delete that client's rows in this order: `booking_stays` (via its bookings), `bookings`, `dogs`, `clients`. Leave real data alone.

If the preview shows "Could not reach the server" or 404s on `/api`, check the `vercel.json` destination (step 3.5).

## Step 5: Backups

**Before the merge:**
1. Run "Take a backup by hand" in `restore-backup.md` (the manual pre-merge backup).
2. Run "Restore into a local scratch database and check it" on that backup. Do this once, and don't skip it: it proves the key and the commands work.

**After the merge** (step 6): the nightly workflow takes over.
1. Actions, **db-backup**, Run workflow (branch `main`).
2. Check a new object appeared: `gcloud storage ls -l gs://<BUCKET>/`.

## Step 6: Merge

1. **Remove the temporary `feat/go-live` deploy trigger.**
   - In `.github/workflows/api-deploy.yml`, change `branches: [main, feat/go-live]` to `branches: [main]`, and delete the two comment lines above it.
   - Commit, after approving the message `ci: deploy the API only from main`, and push to `feat/go-live`.
2. **Remove the branch's Workload Identity permission** (the temporary `refs/heads/feat/go-live` entry in the trust condition):
   ```bash
   gcloud iam workload-identity-pools providers update-oidc github-repo \
     --location=global --workload-identity-pool=github \
     --attribute-condition="assertion.repository == '<GITHUB_OWNER>/<GITHUB_REPO>' && assertion.ref == 'refs/heads/main'"
   ```
   Check it: `gcloud iam workload-identity-pools providers describe github-repo --location=global --workload-identity-pool=github --format='value(attributeCondition)'` should show only `refs/heads/main`.
3. **PR `feat/go-live` into `feat/web-api`.** Open it on GitHub (base `feat/web-api`), wait for the `api` and `web` checks to pass, and merge it with "Create a merge commit".
4. **PR `feat/web-api` into `main`, once.** Mark the existing draft PR "Ready for review", wait for the checks, and merge.
   - Vercel then deploys the live site from `main`.
   - **api-deploy** runs from `main` (the merge changes `api/**`) and deploys the same code.
5. **Check the live site end to end**, on the phone and the laptop:
   - [ ] Log in, create a booking, check History, cancel, log out.
   - [ ] Old browser-stored bookings no longer show; this is expected (starting fresh).
6. Do step 5's "After the merge" backup check.

The next morning, check that **db-backup** ran on its own at about 02:00 UK time. A failed run emails you. GitHub disables scheduled workflows in a public repository after 60 days without activity: if that happens, re-enable it in the Actions tab.
