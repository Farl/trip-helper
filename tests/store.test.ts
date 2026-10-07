import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileStore } from '../server/store.js';
import type { AnswerInput, Trip } from '../shared/types.js';
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
