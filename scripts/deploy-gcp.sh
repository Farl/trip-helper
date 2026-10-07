#!/usr/bin/env bash
# Explicit project selection protects unrelated applications in the gcloud default project.
set -euo pipefail
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID explicitly}"
: "${GCP_REGION:?Set GCP_REGION to the chosen Firestore/Cloud Run region}"
: "${ALLOWED_ORIGINS:?Set ALLOWED_ORIGINS to the exact Pages origin, without a path}"
SERVICE_NAME="${SERVICE_NAME:-trip-helper}"
FIRESTORE_DATABASE_ID="${FIRESTORE_DATABASE_ID:-(default)}"
FIRESTORE_COLLECTION_PREFIX="${FIRESTORE_COLLECTION_PREFIX:-trip_helper}"
RUNTIME_ACCOUNT="${RUNTIME_ACCOUNT:-trip-helper-api}"
ADMIN_SECRET_ID="${ADMIN_SECRET_ID:-${SERVICE_NAME}-admin}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"
SERVICE_MEMORY="${SERVICE_MEMORY:-256Mi}"
SERVICE_CPU="${SERVICE_CPU:-1}"
TEMP_DIRECTORY=$(mktemp -d)
trap 'rm -rf "$TEMP_DIRECTORY"' EXIT
printf 'Target project: %s\nRegion: %s\nDatabase: %s\n' "$GCP_PROJECT_ID" "$GCP_REGION" "$FIRESTORE_DATABASE_ID"
gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectId)'
gcloud services enable firestore.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project="$GCP_PROJECT_ID"
# Listing must succeed; a permissions error must not be treated as an absent database.
gcloud firestore databases list --project="$GCP_PROJECT_ID" --format=json > "$TEMP_DIRECTORY/databases.json"
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
ACCOUNT_EMAIL="${RUNTIME_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$ACCOUNT_EMAIL" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
 gcloud iam service-accounts create "$RUNTIME_ACCOUNT" --display-name='Trip Helper API' --project="$GCP_PROJECT_ID"
fi
gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="serviceAccount:${ACCOUNT_EMAIL}" --role=roles/datastore.user --condition=None --quiet >/dev/null
if ! gcloud secrets describe "$ADMIN_SECRET_ID" --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
 gcloud secrets create "$ADMIN_SECRET_ID" --replication-policy=automatic --project="$GCP_PROJECT_ID"
 umask 077
 node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1],randomBytes(32).toString("base64url"));' "$TEMP_DIRECTORY/admin-token"
 gcloud secrets versions add "$ADMIN_SECRET_ID" --data-file="$TEMP_DIRECTORY/admin-token" --project="$GCP_PROJECT_ID"
fi
gcloud secrets add-iam-policy-binding "$ADMIN_SECRET_ID" --member="serviceAccount:${ACCOUNT_EMAIL}" --role=roles/secretmanager.secretAccessor --project="$GCP_PROJECT_ID" --quiet >/dev/null
# YAML prevents commas in the origin list from being interpreted as env-var separators.
ENV_FILE="$TEMP_DIRECTORY/env.yaml" node --input-type=module <<'JS'
import {writeFileSync} from 'node:fs';
const env={NODE_ENV:'production',API_HOST:'0.0.0.0',STORAGE_DRIVER:'firestore',GOOGLE_CLOUD_PROJECT:process.env.GCP_PROJECT_ID,FIRESTORE_DATABASE_ID:process.env.FIRESTORE_DATABASE_ID??'(default)',FIRESTORE_COLLECTION_PREFIX:process.env.FIRESTORE_COLLECTION_PREFIX??'trip_helper',ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS};
writeFileSync(process.env.ENV_FILE,Object.entries(env).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n');
JS
gcloud run deploy "$SERVICE_NAME" --source=. --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --service-account="$ACCOUNT_EMAIL" --allow-unauthenticated --env-vars-file="$TEMP_DIRECTORY/env.yaml" --set-secrets="ADMIN_TOKEN=${ADMIN_SECRET_ID}:latest" --min-instances=0 --max-instances="$MAX_INSTANCES" --memory="$SERVICE_MEMORY" --cpu="$SERVICE_CPU" --cpu-throttling --timeout=30 --quiet
printf '\nAPI URL:\n'
gcloud run services describe "$SERVICE_NAME" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)'
printf '\nOrganizer key is stored in Secret Manager: %s\n' "$ADMIN_SECRET_ID"
printf 'Set repository variable VITE_API_BASE_URL to the API URL before publishing Pages.\n'
