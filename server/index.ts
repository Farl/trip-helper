import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { FileStore } from './store.js';
import { FirestoreStore } from './firestore.js';
import { ContentRepository } from './content.js';
import { createApp } from './app.js';
const config=await loadConfig();
const store=config.storage==='firestore'?new FirestoreStore({projectId:config.projectId,databaseId:config.databaseId,collectionPrefix:config.collectionPrefix}):new FileStore(resolve(config.dataDirectory,'store.json'));
const app=createApp(config,store,new ContentRepository(config.contentDirectory,config.maxCards,config.maxPackBytes));
const server=app.listen(config.port,config.host,()=>{
 console.log(`${config.appName} API listening at http://${config.host}:${config.port} (${config.storage})`);
 if(!config.production&&!process.env.ADMIN_TOKEN)console.log(`Organizer key is saved at ${resolve(config.dataDirectory,'admin-token')}`);
});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>process.exit(0)));
