import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../server/app.js';
import { FileStore } from '../server/store.js';
import { ContentRepository } from '../server/content.js';
import type { AppConfig } from '../server/config.js';
import { fixture } from './fixture.js';
let dir:string,server:Server,url:string,store:FileStore;
const admin='a-long-test-admin-token-not-in-public-assets';
beforeEach(async()=>{
 dir=await mkdtemp(join(tmpdir(),'trip-api-'));await writeFile(join(dir,`${fixture.id}.json`),JSON.stringify(fixture));
 const config:AppConfig={appName:'Test',port:8080,host:'127.0.0.1',storage:'file',dataDirectory:dir,contentDirectory:dir,allowedOrigins:['https://allowed.example'],adminToken:admin,production:false,databaseId:'(default)',collectionPrefix:'test',maxNameLength:48,maxCards:200,maxPackBytes:786432,maxOperationsPerMinute:180};
 store=new FileStore(join(dir,'store.json'));
 server=createApp(config,store,new ContentRepository(dir)).listen(0,'127.0.0.1');await once(server,'listening');url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterEach(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});});
async function request(path:string,token?:string,method='GET',body?:unknown){return fetch(url+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
async function invite(name='Family'){const response=await request(`/api/trips/${fixture.id}/invites`,admin,'POST',{name});expect(response.status).toBe(201);return response.json();}
it('requires admin authorization to create invites and read raw data',async()=>{expect((await request(`/api/trips/${fixture.id}/invites`,undefined,'POST',{name:'Family'})).status).toBe(401);expect((await request(`/api/trips/${fixture.id}/export`, 'wrong')).status).toBe(401);});
it('records binary answers and exports provenance without credentials',async()=>{
 const {token,participant}=await invite();const op={operationId:randomUUID(),cardId:'ramen',tripVersion:'v1',choice:'interested',expectedRevision:0};
 expect((await request(`/api/trips/${fixture.id}/answers`,token,'PUT',op)).status).toBe(200);
 const session=await (await request('/api/session',token)).json();expect(session.answers).toHaveLength(1);expect(session.trip).toEqual(fixture);
 const response=await request(`/api/trips/${fixture.id}/export`,admin);const raw=await response.text();const data=JSON.parse(raw);expect(data.events).toHaveLength(1);expect(data.contentVersions).toEqual([fixture]);expect(data.participants[0].id).toBe(participant.id);expect(raw).not.toContain(token);expect(raw).not.toContain('tokenHash');
});
it('rejects invalid answers, unknown cards and another journey scope',async()=>{const {token}=await invite();const op={operationId:randomUUID(),cardId:'ramen',tripVersion:'v1',choice:'maybe',expectedRevision:0};expect((await request(`/api/trips/${fixture.id}/answers`,token,'PUT',op)).status).toBe(400);expect((await request('/api/trips/another/answers',token,'PUT',{...op,choice:'interested'})).status).toBe(403);expect((await request(`/api/trips/${fixture.id}/answers`,token,'PUT',{...op,choice:'interested',cardId:'missing'})).status).toBe(400);});
it('denies disallowed browser origins and revoked invitations',async()=>{expect((await fetch(url+'/api/config',{headers:{Origin:'https://evil.example'}})).status).toBe(403);const {token,participant}=await invite();expect((await request(`/api/trips/${fixture.id}/invites/${participant.id}/revoke`,admin,'POST')).status).toBe(200);expect((await request('/api/session',token)).status).toBe(403);});
it('returns explicit current answer on a stale-device conflict',async()=>{const {token}=await invite();const op={operationId:randomUUID(),cardId:'ramen',tripVersion:'v1',choice:'interested',expectedRevision:0};await request(`/api/trips/${fixture.id}/answers`,token,'PUT',op);const response=await request(`/api/trips/${fixture.id}/answers`,token,'PUT',{...op,operationId:randomUUID(),choice:'not_interested'});expect(response.status).toBe(409);expect((await response.json()).answer.choice).toBe('interested');});

it('does not count old-pack participants as unanswered for new cards',async()=>{
 await invite('First version');
 const next={...fixture,version:'v2',cards:[...fixture.cards,{...fixture.cards[0],id:'walk',title:'Walk'}]};
 await writeFile(join(dir,`${fixture.id}.json`),JSON.stringify(next));
 await invite('Second version');
 const stats=await (await request(`/api/trips/${fixture.id}/stats`,admin)).json();
 expect(stats.cards.find((c:{cardId:string})=>c.cardId==='walk').unanswered).toBe(1);
});
it('exports complete participant and pack references when an invite answers during export',async()=>{
 const originalParticipants=store.participantsForTrip.bind(store),originalPacks=store.packsForTrip.bind(store),originalEvents=store.eventsForTrip.bind(store);
 let release!:()=>void;const eventReady=new Promise<void>(resolve=>{release=resolve;});
 store.participantsForTrip=async id=>{const snapshot=await originalParticipants(id);await eventReady;return snapshot;};
 store.packsForTrip=async id=>{const snapshot=await originalPacks(id);await eventReady;return snapshot;};
 store.eventsForTrip=async id=>{const created=await store.createInvite(fixture,'Concurrent family');await store.saveAnswer(created.participant,{operationId:randomUUID(),cardId:'ramen',tripVersion:'v1',choice:'interested',expectedRevision:0});release();return originalEvents(id);};
 const data=await (await request(`/api/trips/${fixture.id}/export`,admin)).json();
 expect(data.events).toHaveLength(1);
 expect(data.participants.some((p:{id:string})=>p.id===data.events[0].participantId)).toBe(true);
 expect(data.contentVersions.some((p:{version:string})=>p.version===data.events[0].tripVersion)).toBe(true);
});

it('records display language as metadata without creating separate language answers',async()=>{
 const {token}=await invite('Bilingual family');
 const op={operationId:randomUUID(),cardId:'ramen',tripVersion:'v1',choice:'interested',expectedRevision:0,displayLocale:'en'};
 expect((await request(`/api/trips/${fixture.id}/answers`,token,'PUT',op)).status).toBe(200);
 expect((await request(`/api/trips/${fixture.id}/answers`,token,'PUT',op)).status).toBe(200);
 const exported=await(await request(`/api/trips/${fixture.id}/export`,admin)).json();
 expect(exported.answers).toHaveLength(1);expect(exported.events).toHaveLength(1);expect(exported.events[0].displayLocale).toBe('en');
});
it('supplies complete version-matched English for existing invitation snapshots and exports',async()=>{
 const translated={tripId:fixture.id,tripVersion:fixture.version,locale:'en',title:'Our Taipei trip',destination:'Taipei',intro:'Choose an experience',cards:Object.fromEntries(fixture.cards.map(card=>[card.id,{title:card.id,description:'An experience',category:'Experience',tags:['activity'],sourceTitle:'Source',facts:{duration:'Estimate',cost:'Check prices',mobility:'Check access'}}]))};
 const directory=join(dir,'locales','en',fixture.id);await mkdir(directory,{recursive:true});await writeFile(join(directory,`${fixture.version}.json`),JSON.stringify(translated));
 const {token}=await invite();const session=await(await request('/api/session',token)).json();expect(session.translations.en).toEqual(translated);expect(session.trip).toEqual(fixture);
 const data=await(await request(`/api/trips/${fixture.id}/export`,admin)).json();expect(data.translations).toEqual([translated]);
});
it('returns stable error codes so errors can change language with the UI',async()=>{
 const invalid=await(await request('/api/session','unknown')).json();expect(invalid.errorCode).toBe('INVITE_INVALID');
 const badName=await(await request(`/api/trips/${fixture.id}/invites`,admin,'POST',{name:''})).json();expect(badName.errorCode).toBe('NAME_INVALID');expect(badName.params.max).toBe(48);
});
