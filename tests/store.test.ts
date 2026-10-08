import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileStore } from '../server/store.js';
import type { AnswerInput, FeedVisitInput, Trip } from '../shared/types.js';
import { fixture } from './fixture.js';
const dirs: string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'trip-store-'));dirs.push(dir);const store=new FileStore(join(dir,'store.json'));const invite=await store.createInvite(fixture,'Family');return {store,...invite};}
function input(cardId='ramen', expectedRevision=0): AnswerInput { return {operationId:randomUUID(),cardId,tripVersion:fixture.version,choice:'interested',expectedRevision}; }
describe('durable binary responses',()=>{
 it('replays one operation without creating another raw event',async()=>{const {store,participant}=await setup();const op=input();const first=await store.saveAnswer(participant,op);expect(await store.saveAnswer(participant,op)).toEqual(first);expect(await store.eventsForTrip(fixture.id)).toHaveLength(1);});
 it('keeps different experiences at the same place independent',async()=>{const {store,participant}=await setup();await store.saveAnswer(participant,input());await store.saveAnswer(participant,{...input('temple'),choice:'not_interested'});expect(await store.answersForParticipant(participant.id)).toEqual(expect.arrayContaining([expect.objectContaining({cardId:'ramen',choice:'interested'}),expect.objectContaining({cardId:'temple',choice:'not_interested'})]));});
 it('rejects stale revisions and preserves the newer answer',async()=>{const {store,participant}=await setup();await store.saveAnswer(participant,input());await expect(store.saveAnswer(participant,{...input(),choice:'not_interested'})).rejects.toMatchObject({status:409});expect((await store.answersForParticipant(participant.id))[0].choice).toBe('interested');});
 it('preserves edits as events while exposing only the current answer',async()=>{const {store,participant}=await setup();await store.saveAnswer(participant,input());await store.saveAnswer(participant,{...input('ramen',1),choice:'not_interested'});expect(await store.eventsForTrip(fixture.id)).toHaveLength(2);expect(await store.answersForParticipant(participant.id)).toEqual([expect.objectContaining({revision:2,choice:'not_interested'})]);});
 it('persists across process/store restarts without storing plain invite tokens',async()=>{const {store,participant,token}=await setup();await store.saveAnswer(participant,input());const restarted=new FileStore(store.filePath);expect((await restarted.resolveToken(token)).id).toBe(participant.id);expect(await restarted.answersForParticipant(participant.id)).toHaveLength(1);expect(await readFile(store.filePath,'utf8')).not.toContain(token);});
 it('revokes both reads and writes with a previously valid invite',async()=>{const {store,participant,token}=await setup();await store.revoke(fixture.id,participant.id);await expect(store.resolveToken(token)).rejects.toMatchObject({status:403});await expect(store.saveAnswer(participant,input())).rejects.toMatchObject({status:403});});
 it('does not allow an operation id to be reused with a different payload',async()=>{const {store,participant}=await setup();const op=input();await store.saveAnswer(participant,op);await expect(store.saveAnswer(participant,{...op,choice:'not_interested'})).rejects.toMatchObject({status:409});});
 it('commits concurrent distinct cards without losing either choice',async()=>{const {store,participant}=await setup();await Promise.all([store.saveAnswer(participant,input()),store.saveAnswer(participant,input('temple'))]);expect(await store.answersForParticipant(participant.id)).toHaveLength(2);expect(await store.packsForTrip(fixture.id)).toEqual([fixture]);});
});
it('allows verification-date refresh without replacing the immutable published snapshot',async()=>{
 const {store}=await setup();const refreshed={...fixture,cards:fixture.cards.map(card=>({...card,source:{...card.source,checkedAt:'2026-10-08'}}))};
 await expect(store.createInvite(refreshed,'Another family member')).resolves.toHaveProperty('participant');
 expect(await store.packsForTrip(fixture.id)).toEqual([fixture]);
});

it('rejects changed card meaning under an already published version',async()=>{const {store}=await setup();const changed={...fixture,cards:fixture.cards.map(c=>({...c,description:'Changed offer'}))};await expect(store.createInvite(changed,'Family')).rejects.toMatchObject({status:409});expect(await store.packsForTrip(fixture.id)).toEqual([fixture]);});

function visit(cardId='ramen',previousOperationId:string|null=null):FeedVisitInput {return {operationId:randomUUID(),sessionId:randomUUID(),cardId,tripVersion:fixture.version,displayLocale:'en',previousOperationId};}
describe('durable participant presentations and raw visits',()=>{
 it('persists a complete presentation across restart without changing the published pack',async()=>{
  const {store,participant,token}=await setup();
  expect(participant.presentation?.algorithm).toEqual(expect.any(String));
  expect([...participant.presentation!.cardIds].sort()).toEqual(['ramen','temple']);
  expect((await new FileStore(store.filePath).resolveToken(token)).presentation).toEqual(participant.presentation);
  expect(await store.packsForTrip(fixture.id)).toEqual([fixture]);
 });
 it('keeps legacy invites without inventing a presentation and initializes absent visit collections',async()=>{
  const {store,participant,token}=await setup();const state=JSON.parse(await readFile(store.filePath,'utf8'));
  delete state.participants[participant.id].presentation;delete state.visits;delete state.progresses;await writeFile(store.filePath,JSON.stringify(state));
  const restarted=new FileStore(store.filePath);const legacy=await restarted.resolveToken(token);expect(legacy.presentation).toBeUndefined();
  expect(await restarted.progressForParticipant(legacy.id)).toBeUndefined();
  expect((await restarted.recordVisit(legacy,visit('temple'))).visit.position).toBe(1);
  expect((await restarted.resolveToken(token)).presentation).toBeUndefined();
 });
 it('records presentation position and server time while leaving answers absent',async()=>{
  const {store,participant}=await setup();const op=visit();const before=Date.now();const result=await store.recordVisit(participant,op);
  expect(result.visit).toMatchObject({...op,participantId:participant.id,tripId:fixture.id,position:participant.presentation!.cardIds.indexOf(op.cardId)});
  expect(Date.parse(result.visit.recordedAt)).toBeGreaterThanOrEqual(before);
  expect(result.progress).toMatchObject({operationId:op.operationId,cardId:op.cardId,position:result.visit.position,revision:1,recordedAt:result.visit.recordedAt});
  expect(await store.answersForParticipant(participant.id)).toEqual([]);expect(await store.eventsForTrip(fixture.id)).toEqual([]);
  expect(await new FileStore(store.filePath).progressForParticipant(participant.id)).toEqual(result.progress);
 });
 it('stores stale offline chains without letting them replace or rewind current progress',async()=>{
  const {store,participant}=await setup();const first=visit();const initial=await store.recordVisit(participant,first);
  const second=visit('temple',first.operationId);const latest=await store.recordVisit(participant,second);
  const stale=visit('ramen',first.operationId);expect((await store.recordVisit(participant,stale)).progress).toEqual(latest.progress);
  expect((await store.recordVisit(participant,visit('temple',stale.operationId))).progress).toEqual(latest.progress);
  expect((await store.recordVisit(participant,first)).progress).toEqual(latest.progress);
  expect(await store.visitsForTrip(fixture.id)).toHaveLength(4);expect(latest.progress?.revision).toBe(2);expect(initial.progress?.revision).toBe(1);
 });
 it('deduplicates concurrent receipts and refuses changed visit payloads',async()=>{
  const {store,participant}=await setup();const op=visit();const receipts=await Promise.all([store.recordVisit(participant,op),store.recordVisit(participant,op)]);
  expect(receipts[1]).toEqual(receipts[0]);expect(await store.visitsForTrip(fixture.id)).toHaveLength(1);
  for(const changed of [{cardId:'temple'},{sessionId:randomUUID()},{displayLocale:'zh-Hant' as const},{previousOperationId:randomUUID()}])await expect(store.recordVisit(participant,{...op,...changed})).rejects.toMatchObject({status:409,errorCode:'OPERATION_REUSED'});
  expect(await store.progressForParticipant(participant.id)).toEqual(receipts[0].progress);
 });
 it('checks pinned version, unknown cards, trip scope, and revocation inside the write',async()=>{
  const {store,participant}=await setup();
  await expect(store.recordVisit(participant,{...visit(),tripVersion:'other'})).rejects.toMatchObject({status:409,errorCode:'TRIP_VERSION_CHANGED'});
  await expect(store.recordVisit(participant,visit('missing'))).rejects.toMatchObject({status:400,errorCode:'CARD_NOT_FOUND'});
  await expect(store.recordVisit({...participant,tripId:'other'},visit())).rejects.toMatchObject({status:403,errorCode:'TRIP_FORBIDDEN'});
  const op=visit();await store.recordVisit(participant,op);await store.revoke(fixture.id,participant.id);
  await expect(store.recordVisit(participant,op)).rejects.toMatchObject({status:403,errorCode:'INVITE_REVOKED'});
  expect(await store.visitsForTrip(fixture.id)).toHaveLength(1);
 });
 it('accepts only one cursor successor when two devices race',async()=>{
  const {store,participant}=await setup();const first=visit();await store.recordVisit(participant,first);
  const successors=[visit('ramen',first.operationId),visit('temple',first.operationId)];await Promise.all(successors.map(op=>store.recordVisit(participant,op)));
  const progress=await store.progressForParticipant(participant.id);expect(progress?.revision).toBe(2);expect(progress?.operationId).toBe(successors[0].operationId);expect(await store.visitsForTrip(fixture.id)).toHaveLength(3);
 });
});
