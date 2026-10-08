#!/usr/bin/env bash
# Explicit project selection protects unrelated applications in the gcloud default project.
set -euo pipefail
umask 077
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID explicitly}"
: "${GCP_REGION:?Set GCP_REGION to the chosen Firestore/Cloud Run region}"
: "${ALLOWED_ORIGINS:?Set ALLOWED_ORIGINS to the exact Pages origin, without a path}"
SOURCE_DIRECTORY="${SOURCE_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SOURCE_DIRECTORY=$(cd "$SOURCE_DIRECTORY" && pwd)
SERVICE_NAME="${SERVICE_NAME:-$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).name' "$SOURCE_DIRECTORY/package.json")}"
FIRESTORE_DATABASE_ID="${FIRESTORE_DATABASE_ID:-(default)}"
FIRESTORE_COLLECTION_PREFIX="${FIRESTORE_COLLECTION_PREFIX:-${SERVICE_NAME//-/_}}"
RUNTIME_ACCOUNT="${RUNTIME_ACCOUNT:-${SERVICE_NAME}-api}"
BUILD_ACCOUNT="${BUILD_ACCOUNT:-${SERVICE_NAME}-build}"
ADMIN_SECRET_ID="${ADMIN_SECRET_ID:-${SERVICE_NAME}-admin}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"
# Leave headroom for Node, the TypeScript loader, Firestore, and content snapshots.
SERVICE_MEMORY="${SERVICE_MEMORY:-512Mi}"
SERVICE_CPU="${SERVICE_CPU:-1}"
REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-30}"
TEMP_DIRECTORY=$(mktemp -d)
trap 'rm -rf "$TEMP_DIRECTORY"' EXIT
ACCOUNT_EMAIL="${RUNTIME_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
BUILD_ACCOUNT_EMAIL="${BUILD_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
if [[ "$RUNTIME_ACCOUNT" == "$BUILD_ACCOUNT" ]]; then
 printf 'Runtime and build accounts must be distinct.\n' >&2
 exit 1
fi
for account in "$RUNTIME_ACCOUNT" "$BUILD_ACCOUNT"; do
 if [[ ! "$account" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  printf 'Invalid service account ID: %s (use 6-30 lowercase letters, digits, or hyphens).\n' "$account" >&2
  exit 1
 fi
done
# Force ignore rules on even if the caller disabled them in gcloud configuration.
export CLOUDSDK_GCLOUDIGNORE_ENABLED=true
[[ -f "$SOURCE_DIRECTORY/.gcloudignore" ]] || { printf 'Source directory requires .gcloudignore.\n' >&2; exit 1; }
gcloud meta list-files-for-upload "$SOURCE_DIRECTORY" > "$TEMP_DIRECTORY/upload-files"
node --input-type=module - "$SOURCE_DIRECTORY" "$TEMP_DIRECTORY/upload-files" <<'JS'
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
const [source,list]=process.argv.slice(2);
const root=realpathSync(source);
const files=readFileSync(list,'utf8').trim().split(/\r?\n/).filter(Boolean);
const required=['Dockerfile','.dockerignore','package.json','package-lock.json','server/index.ts','public/trips/index.json'];
const permitted=/^(Dockerfile|\.dockerignore|package(?:-lock)?\.json|(?:server|shared)\/(?:[^/]+\/)*[^/]+\.ts|public\/trips\/(?:[^/]+\/)*[^/]+\.json)$/;
for(const file of files){
 if(!permitted.test(file)||/(?:^|\/)(?:\.data|\.env(?:\.[^/]*)?|test-results|playwright-report)(?:\/|$)/.test(file))throw new Error(`Unexpected source upload: ${file}`);
 if(!realpathSync(resolve(source,file)).startsWith(root+sep))throw new Error(`Source file points outside upload directory: ${file}`);
}
for(const file of required)if(!files.includes(file))throw new Error(`Required build file is excluded: ${file}`);
console.log(`Verified ${files.length} source files for upload.`);
JS
printf 'Target project: %s\nRegion: %s\nDatabase: %s\n' "$GCP_PROJECT_ID" "$GCP_REGION" "$FIRESTORE_DATABASE_ID"
gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectId)'
gcloud services enable firestore.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project="$GCP_PROJECT_ID"
# Listing must succeed; a permissions error must not be treated as an absent database.
gcloud firestore databases list --project="$GCP_PROJECT_ID" --format=json > "$TEMP_DIRECTORY/databases.json"
gcloud iam service-accounts list --project="$GCP_PROJECT_ID" --format=json > "$TEMP_DIRECTORY/accounts.json"
gcloud secrets list --project="$GCP_PROJECT_ID" --format=json > "$TEMP_DIRECTORY/secrets.json"
DATABASE_JSON="$TEMP_DIRECTORY/databases.json" DATABASE_ID="$FIRESTORE_DATABASE_ID" REGION="$GCP_REGION" node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const databases=JSON.parse(readFileSync(process.env.DATABASE_JSON,'utf8'));
const db=databases.find(d=>d.name.endsWith('/'+process.env.DATABASE_ID));
if(db){
 if(db.type!=='FIRESTORE_NATIVE')throw new Error('Existing database is not Firestore Native. Select an appropriate database or project.');
 if(db.locationId!==process.env.REGION)throw new Error(`Existing database region ${db.locationId} differs from ${process.env.REGION}. Choose its region explicitly.`);
 if(db.databaseEdition&&db.databaseEdition!=='STANDARD')throw new Error('This deployment expects Standard edition.');
}
writeFileSync(process.env.DATABASE_JSON+'.exists',db?'yes':'no');
JS
if [[ $(cat "$TEMP_DIRECTORY/databases.json.exists") == no ]]; then
 gcloud firestore databases create --database="$FIRESTORE_DATABASE_ID" --location="$GCP_REGION" --type=firestore-native --edition=standard --delete-protection --project="$GCP_PROJECT_ID"
fi
# Snapshot JSON is never queried; disabling its index avoids truncated long-string indexes.
gcloud firestore indexes fields update payload --collection-group="${FIRESTORE_COLLECTION_PREFIX}_packs" --database="$FIRESTORE_DATABASE_ID" --disable-indexes --project="$GCP_PROJECT_ID" --quiet
resource_exists() {
 # Successful lists distinguish absence from permission/network failures.
 node --input-type=module - "$1" "$2" "$3" <<'JS'
import {readFileSync} from 'node:fs';
const [file,key,value]=process.argv.slice(2);
const resources=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(resources))throw new Error('Unexpected resource list response.');
const resource=resources.find(item=>key==='name'?item[key]?.endsWith('/'+value):item[key]===value);
if(resource?.disabled)throw new Error(`Service account is disabled: ${value}`);
console.log(resource?'yes':'no');
JS
}
ensure_account() {
 local account="$1" email="$2" exists
 exists=$(resource_exists "$TEMP_DIRECTORY/accounts.json" email "$email")
 if [[ "$exists" == no ]]; then
  gcloud iam service-accounts create "$account" --display-name="$account" --project="$GCP_PROJECT_ID"
 fi
}
ensure_account "$RUNTIME_ACCOUNT" "$ACCOUNT_EMAIL"
ensure_account "$BUILD_ACCOUNT" "$BUILD_ACCOUNT_EMAIL"
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:${ACCOUNT_EMAIL}" --role=roles/datastore.user --condition=None --quiet >/dev/null
# https://docs.cloud.google.com/run/docs/configuring/services/build-service-account
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:${BUILD_ACCOUNT_EMAIL}" --role=roles/run.builder --condition=None --quiet >/dev/null
SECRET_EXISTS=$(resource_exists "$TEMP_DIRECTORY/secrets.json" name "$ADMIN_SECRET_ID")
if [[ "$SECRET_EXISTS" == no ]]; then
 gcloud secrets create "$ADMIN_SECRET_ID" --replication-policy=automatic --project="$GCP_PROJECT_ID"
 umask 077
 node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1],randomBytes(32).toString("base64url"));' "$TEMP_DIRECTORY/admin-token"
 gcloud secrets versions add "$ADMIN_SECRET_ID" --data-file="$TEMP_DIRECTORY/admin-token" --project="$GCP_PROJECT_ID"
fi
# An existing empty/disabled secret needs deliberate repair, never silent key rotation.
gcloud secrets versions list "$ADMIN_SECRET_ID" --project="$GCP_PROJECT_ID" --format=json > "$TEMP_DIRECTORY/versions.json"
node --input-type=module - "$TEMP_DIRECTORY/versions.json" <<'JS'
import {readFileSync} from 'node:fs';
const versions=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(!versions.some(version=>version.state==='ENABLED'))throw new Error('Organizer secret has no enabled version. Restore or add a version before deploying.');
JS
gcloud secrets add-iam-policy-binding "$ADMIN_SECRET_ID" --member="serviceAccount:${ACCOUNT_EMAIL}" --role=roles/secretmanager.secretAccessor --project="$GCP_PROJECT_ID" --quiet >/dev/null
# Explicit assignments preserve nonexported defaults; quoted YAML preserves origin commas.
ENV_FILE="$TEMP_DIRECTORY/env.yaml" GCP_PROJECT_ID="$GCP_PROJECT_ID" FIRESTORE_DATABASE_ID="$FIRESTORE_DATABASE_ID" FIRESTORE_COLLECTION_PREFIX="$FIRESTORE_COLLECTION_PREFIX" ALLOWED_ORIGINS="$ALLOWED_ORIGINS" node --input-type=module <<'JS'
import {writeFileSync} from 'node:fs';
const env={NODE_ENV:'production',API_HOST:'0.0.0.0',STORAGE_DRIVER:'firestore',GOOGLE_CLOUD_PROJECT:process.env.GCP_PROJECT_ID,FIRESTORE_DATABASE_ID:process.env.FIRESTORE_DATABASE_ID,FIRESTORE_COLLECTION_PREFIX:process.env.FIRESTORE_COLLECTION_PREFIX,ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS};
for(const key of ['GOOGLE_CLOUD_PROJECT','FIRESTORE_DATABASE_ID','FIRESTORE_COLLECTION_PREFIX','ALLOWED_ORIGINS'])if(!env[key])throw new Error(`Missing runtime configuration: ${key}`);
writeFileSync(process.env.ENV_FILE,Object.entries(env).filter(([,value])=>value!==undefined).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n');
JS
gcloud run deploy "$SERVICE_NAME" --source="$SOURCE_DIRECTORY" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --service-account="$ACCOUNT_EMAIL" --build-service-account="projects/${GCP_PROJECT_ID}/serviceAccounts/${BUILD_ACCOUNT_EMAIL}" --allow-unauthenticated --env-vars-file="$TEMP_DIRECTORY/env.yaml" --set-secrets="ADMIN_TOKEN=${ADMIN_SECRET_ID}:latest" --min-instances=0 --max-instances="$MAX_INSTANCES" --memory="$SERVICE_MEMORY" --cpu="$SERVICE_CPU" --cpu-throttling --timeout="$REQUEST_TIMEOUT" --quiet
printf '\nAPI URL:\n'
gcloud run services describe "$SERVICE_NAME" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)'
printf '\nOrganizer key is stored in Secret Manager: %s\n' "$ADMIN_SECRET_ID"
printf 'Set repository variable VITE_API_BASE_URL to the API URL before publishing Pages.\n'
