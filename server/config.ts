import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
/** Content is trusted project data; cap card count and keep snapshots below Firestore’s document limit. */
export const CONTENT_LIMITS={maxCards:300,maxPackBytes:786432};
export interface AppConfig {
 appName:string; port:number; host:string; storage:'file'|'firestore'; dataDirectory:string; contentDirectory:string;
 allowedOrigins:string[]; adminToken:string; production:boolean; projectId?:string; databaseId:string; collectionPrefix:string;
 maxNameLength:number; maxCards:number; maxPackBytes:number; maxOperationsPerMinute:number;
}
function positive(name:string,fallback:number):number {const value=Number(process.env[name]??fallback);if(!Number.isInteger(value)||value<1)throw new Error(`${name} must be a positive integer`);return value;}
export async function loadConfig():Promise<AppConfig>{
 if(existsSync('.env'))process.loadEnvFile('.env');
 const production=process.env.NODE_ENV==='production';
 const storage=process.env.STORAGE_DRIVER??'file';
 if(storage!=='file'&&storage!=='firestore')throw new Error('STORAGE_DRIVER must be file or firestore');
 const dataDirectory=resolve(process.env.DATA_DIRECTORY??'.data');
 let adminToken=process.env.ADMIN_TOKEN;
 if(production&&(storage!=='firestore'||!adminToken||adminToken.length<32||!process.env.ALLOWED_ORIGINS))throw new Error('Production requires Firestore, ADMIN_TOKEN (at least 32 characters) and ALLOWED_ORIGINS.');
 if(!adminToken){
  await mkdir(dataDirectory,{recursive:true});const tokenPath=resolve(dataDirectory,'admin-token');
  try{adminToken=(await readFile(tokenPath,'utf8')).trim();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;adminToken=randomBytes(32).toString('base64url');await writeFile(tokenPath,adminToken,{mode:0o600});}
 }
 return {appName:process.env.APP_NAME??'一起去',port:positive('PORT',8080),host:process.env.API_HOST??'127.0.0.1',storage,dataDirectory,contentDirectory:resolve(process.env.CONTENT_DIRECTORY??'public/trips'),allowedOrigins:(process.env.ALLOWED_ORIGINS??'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s=>s.trim()).filter(Boolean),adminToken,production,projectId:process.env.GOOGLE_CLOUD_PROJECT,databaseId:process.env.FIRESTORE_DATABASE_ID??'(default)',collectionPrefix:process.env.FIRESTORE_COLLECTION_PREFIX??'trip_helper',maxNameLength:positive('MAX_NAME_LENGTH',48),maxCards:positive('MAX_CARDS',CONTENT_LIMITS.maxCards),maxPackBytes:positive('MAX_PACK_BYTES',CONTENT_LIMITS.maxPackBytes),maxOperationsPerMinute:positive('MAX_OPERATIONS_PER_MINUTE',180)};
}
