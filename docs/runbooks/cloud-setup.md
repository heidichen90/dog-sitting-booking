# Cloud setup (OWNER)

A one-time checklist. Do the steps in order. Run every command in **bash** (type `bash` first in a zsh terminal), from the repo root unless a step says otherwise.

**This repository is public.** Never paste a password, connection string, project id or private key into a chat, an issue, a commit or a workflow log. Everything below uses placeholders; keep your real values in your password manager.

## Placeholders

| Placeholder | What it is | Where it comes from |
|---|---|---|
| `<PROJECT_ID>` | Google Cloud project id | You choose it in step 2 (must be globally unique) |
| `<PROJECT_NUMBER>` | Its number | step 2 |
| `<BILLING_ACCOUNT_ID>` | Billing account | step 2 |
| `<GITHUB_OWNER>/<GITHUB_REPO>` | This repository | the GitHub URL |
| `<BUCKET>` | Backup bucket name | You choose it in step 11 (globally unique) |
| `<NEON_HOST>` | Neon direct host | step 5 |
| `<NEON_ROLE>` / `<NEON_PASSWORD>` | Neon database role | step 5 |
| `<AGE_PUBLIC_KEY>` | Backup public key | step 12, starts `age1` |

## 0. Tools

```bash
brew install --cask google-cloud-sdk   # gcloud
brew install age                       # backup encryption
```

`pg_dump` / `pg_restore` 18 come with Postgres.app (`/Applications/Postgres.app/Contents/Versions/18/bin`).

## 1. Two-step verification everywhere

- [ ] Google account: https://myaccount.google.com/security, 2-Step Verification on.
- [ ] Neon: Account settings, enable two-factor (or sign in with the Google/GitHub account above).
- [ ] GitHub: Settings, Password and authentication, Two-factor authentication on.
- [ ] Vercel: Account settings, Authentication, enable two-factor.

## 2. Google Cloud project and billing

```bash
gcloud auth login
gcloud projects create <PROJECT_ID> --name="DD Pet Care"
gcloud billing accounts list
gcloud billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>
gcloud config set project <PROJECT_ID>
gcloud projects describe <PROJECT_ID> --format='value(projectNumber)'   # -> <PROJECT_NUMBER>
```

**Set a billing budget alert now**, so unexpected costs email you. In the console: Billing, Budgets & alerts, Create budget. Scope it to this project, set a monthly amount of £5, and keep email alerts at 50%, 90% and 100% to the billing admins. (A budget only alerts; it doesn't stop spending.)

## 3. Enable the APIs

```bash
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com iam.googleapis.com
```

(`iam.googleapis.com` is needed to create the service accounts and the Workload Identity pool.)

## 4. Artifact Registry

```bash
gcloud artifacts repositories create ddpet \
  --repository-format=docker --location=europe-west2 --description="DD Pet Care API images"
```

Add a cleanup policy to stay in the 0.5 GB free storage: keep only the newest 3 images and delete anything older than 7 days.

```bash
policy=$(mktemp)
cat > "$policy" <<'JSON'
[
  {"name": "keep-newest-3", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "delete-older", "action": {"type": "Delete"}, "condition": {"tagState": "any", "olderThan": "7d"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies ddpet --location=europe-west2 \
  --policy="$policy" --no-dry-run
rm "$policy"
```

## 5. Neon (production database)

In https://console.neon.tech:

1. **New project:** name `dd-pet-care`, Postgres version **18**, region **AWS Europe (London) / eu-west-2**.
2. **Databases, New database:** name `dd_pet_care_prod`, owner: the project's default role (`<NEON_ROLE>`, usually `neondb_owner`).
3. **Connect**, with database `dd_pet_care_prod` and **connection pooling off** (the direct host; it has no `-pooler` in the name). Note `<NEON_HOST>`, `<NEON_ROLE>` and `<NEON_PASSWORD>`.
4. Save these two strings in your password manager:
   - **For the API (JDBC):** `jdbc:postgresql://<NEON_HOST>/dd_pet_care_prod?sslmode=require`. The username and password are stored separately.
   - **For backups (libpq):** `postgresql://<NEON_ROLE>:<NEON_PASSWORD>@<NEON_HOST>/dd_pet_care_prod?sslmode=require&channel_binding=require`

## 6. Secret Manager (the five API secrets)

Define a helper that reads a value without echoing it (so it never reaches your shell history) and stores it in London from stdin:

```bash
add_secret() {
  local value
  read -rsp "Value for $1: " value; echo
  printf '%s' "$value" | gcloud secrets create "$1" \
    --replication-policy=user-managed --locations=europe-west2 --data-file=-
}
add_secret ddpet-db-url          # the JDBC string from step 5
add_secret ddpet-db-username     # <NEON_ROLE>
add_secret ddpet-db-password     # <NEON_PASSWORD>
add_secret ddpet-owner-username  # ddpetcare
unset -f add_secret
```

The fifth secret, `ddpet-owner-password-hash`, is created in step 7.

## 7. Production password hash

1. In your password manager, generate a **new** password, never the dev one: 20-40 characters, letters, digits and simple symbols, at most 72 characters. Save it as "DD Pet Care owner login".
2. Hash it with BCrypt from the project's own classpath and store the hash directly from stdin:

```bash
cd api
CP=$(./mvnw -q dependency:build-classpath -Dmdep.includeScope=runtime -Dmdep.outputFile=/dev/stdout)
tmp=$(mktemp -d)
cat > "$tmp/Hash.java" <<'JAVA'
public class Hash {
    public static void main(String[] args) {
        System.out.print("{bcrypt}" + new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
                .encode(System.getenv("OWNER_PW")));
    }
}
JAVA
read -rsp 'Production owner password: ' OWNER_PW; echo
OWNER_PW="$OWNER_PW" java -cp "$CP" "$tmp/Hash.java" | gcloud secrets create ddpet-owner-password-hash \
  --replication-policy=user-managed --locations=europe-west2 --data-file=-
unset OWNER_PW; rm -r "$tmp"; cd ..
```

Check the prefix without printing the hash:

```bash
gcloud secrets versions access latest --secret=ddpet-owner-password-hash | cut -c1-12
```

Expected: `{bcrypt}$2a$`.

**Changing the password later:**
1. Repeat this step, but with `gcloud secrets versions add ddpet-owner-password-hash --data-file=-` instead of `secrets create`.
2. Redeploy: Actions, api-deploy, Run workflow on `main`.
3. Run `DELETE FROM spring_session;` in the Neon SQL editor (database `dd_pet_care_prod`). This logs out every device.

## 8. Service accounts

```bash
gcloud iam service-accounts create ddpet-api-runtime   --display-name="Cloud Run runtime for ddpet-api"
gcloud iam service-accounts create ddpet-deployer      --display-name="GitHub Actions: deploy ddpet-api"
gcloud iam service-accounts create ddpet-backup-writer --display-name="GitHub Actions: write DB backups"

RUNTIME=ddpet-api-runtime@<PROJECT_ID>.iam.gserviceaccount.com
DEPLOYER=ddpet-deployer@<PROJECT_ID>.iam.gserviceaccount.com

# The runtime can read the five secrets, nothing else.
for s in ddpet-db-url ddpet-db-username ddpet-db-password ddpet-owner-username ddpet-owner-password-hash; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor
done

# The deployer can deploy Cloud Run (run.admin, so it can allow public access),
# push images to the one repository, and run the service as the runtime account.
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:$DEPLOYER" --role=roles/run.admin
gcloud artifacts repositories add-iam-policy-binding ddpet --location=europe-west2 \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser
```

The backup writer gets its only permission on the bucket in step 11.

## 9. Workload Identity Federation (GitHub to Google, no keys)

The trust condition is the security boundary. It must name this repository exactly and only exact branch refs; never use a wildcard or `startsWith`.

```bash
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-repo \
  --location=global --workload-identity-pool=github \
  --display-name="This repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '<GITHUB_OWNER>/<GITHUB_REPO>' && (assertion.ref == 'refs/heads/main' || assertion.ref == 'refs/heads/feat/go-live')"

MEMBER="principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/attribute.repository/<GITHUB_OWNER>/<GITHUB_REPO>"
for sa in ddpet-deployer ddpet-backup-writer; do
  gcloud iam service-accounts add-iam-policy-binding "$sa@<PROJECT_ID>.iam.gserviceaccount.com" \
    --role=roles/iam.workloadIdentityUser --member="$MEMBER"
done
```

`refs/heads/feat/go-live` is **temporary**, so the first deploy can run from the branch. `go-live.md` step 6 removes it with `providers update-oidc` before the merge, leaving only `refs/heads/main`.

## 10. GitHub repository variables and secret

GitHub, the repository, Settings, Secrets and variables, Actions.

**Repository variables are visible in public workflow logs** (and to anyone who can read a log); only *secrets* are masked. So put only non-sensitive values in variables, and never a password or connection string.

**Variables** tab:

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | `<PROJECT_ID>` |
| `GCP_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-repo` |
| `GCP_DEPLOYER_SA` | `ddpet-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `ddpet-api-runtime@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_BACKUP_SA` | `ddpet-backup-writer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `BACKUP_BUCKET` | `<BUCKET>` (created in step 11) |
| `AGE_PUBLIC_KEY` | `<AGE_PUBLIC_KEY>` (created in step 12; a public key, safe to expose) |

Anyone can therefore learn your project id and bucket name from a log. That is acceptable: they can't use them without a Google identity, which only this repository's `main` branch (and the temporary branch) can obtain.

**Secrets** tab: `NEON_BACKUP_URL` = the libpq string from step 5.

## 11. Backup bucket

```bash
gcloud storage buckets create gs://<BUCKET> \
  --location=europe-west2 --default-storage-class=STANDARD \
  --uniform-bucket-level-access --public-access-prevention

lifecycle=$(mktemp)
echo '{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 30}}]}' > "$lifecycle"
gcloud storage buckets update gs://<BUCKET> --lifecycle-file="$lifecycle"
rm "$lifecycle"

gcloud storage buckets add-iam-policy-binding gs://<BUCKET> \
  --member="serviceAccount:ddpet-backup-writer@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role=roles/storage.objectCreator

gcloud storage buckets describe gs://<BUCKET> \
  --format="yaml(location,public_access_prevention,uniform_bucket_level_access,lifecycle_config)"
```

Expected: location `EUROPE-WEST2`, public access prevention `enforced`, uniform access `true`, and one Delete rule with age 30.

You (the project owner) can read and list the bucket. The backup writer can only create objects.

## 12. Backup key pair (age)

```bash
age-keygen -o ddpet-backup-key.txt
```

It prints `Public key: age1...`. That's `<AGE_PUBLIC_KEY>`: set it as the `AGE_PUBLIC_KEY` variable (step 10).

1. Copy the whole content of `ddpet-backup-key.txt` (the line starting `AGE-SECRET-KEY-1`) into your password manager as "DD Pet Care backup key". Optionally also write it on paper and keep it somewhere safe.
2. **Losing it makes every backup unreadable.** Never commit it (add no copy to the repository folder beyond this moment).
3. Then delete the file: `rm -P ddpet-backup-key.txt`. The restore runbook recreates it from the password manager when needed.

## 13. Vercel

The project already deploys `main`, with Root Directory `web`. In Vercel, the project, Settings:

- [ ] General: Root Directory is `web`, so `web/vercel.json` is used.
- [ ] Git: Production Branch is `main`.
- [ ] Deployment Protection: leave Vercel Authentication on for previews (you're logged in to Vercel when you check them).

The `/api` rewrite target **isn't a dashboard setting**: `vercel.json` can't read project settings or environment variables. It's the committed line `https://ddpet-api-PROJECT_NUMBER.europe-west2.run.app/api/:path*` in `web/vercel.json`. You replace `PROJECT_NUMBER` after the first deploy (`go-live.md`, step 3). The Cloud Run URL is not secret, but treat it as public.

## Password manager checklist

- [ ] DD Pet Care owner login (production password)
- [ ] DD Pet Care backup key (age private key)
- [ ] Neon: login, `<NEON_ROLE>` / `<NEON_PASSWORD>`, the JDBC string and the libpq string
- [ ] Google Cloud project id and number, bucket name
