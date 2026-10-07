import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Answer, AnswerEvent, AnswerInput, Participant, Trip } from '../shared/types.js';
import { AppError, assertActive, documentKey, hashToken, newInvite, packFingerprint, planAnswer } from './domain.js';
export interface StoredParticipant extends Participant { tokenHash: string }
export interface StoredAnswer extends Answer { participantId: string; tripId: string; tripVersion: string }
export interface Store {
 createInvite(trip: Trip, name: string): Promise<{participant: Participant; token: string}>;
 resolveToken(token: string): Promise<Participant>;
 answersForParticipant(id: string): Promise<Answer[]>;
 saveAnswer(participant: Participant, input: AnswerInput): Promise<Answer>;
 participantsForTrip(id: string): Promise<Participant[]>;
 answersForTrip(id: string): Promise<StoredAnswer[]>;
 eventsForTrip(id: string): Promise<AnswerEvent[]>;
 packsForTrip(id: string): Promise<Trip[]>;
 revoke(tripId: string, participantId: string): Promise<void>;
}
interface FileState {
 participants: Record<string,StoredParticipant>; answers: Record<string,StoredAnswer>;
 events: Record<string,AnswerEvent>; packs: Record<string,Trip>;
}
export function publicParticipant(p:StoredParticipant):Participant { const {tokenHash:_,...safe}=p; return safe; }
/** Development only: one API process owns the file; production requires Firestore. */
export class FileStore implements Store {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(public filePath:string) {}
 private async load():Promise<FileState>{
  try{return JSON.parse(await readFile(this.filePath,'utf8')) as FileState;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {participants:{},answers:{},events:{},packs:{}};throw error;}
 }
 private async write(state:FileState){
  await mkdir(dirname(this.filePath),{recursive:true});
  const temp=`${this.filePath}.${randomUUID()}.tmp`;
  await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,this.filePath);
 }
 private change<T>(fn:(state:FileState)=>T|Promise<T>):Promise<T>{
  const job=this.tail.then(async()=>{const state=await this.load();const result=await fn(state);await this.write(state);return result;});
  this.tail=job.catch(()=>undefined);return job;
 }
 private async snapshot(){await this.tail;return this.load();}
 async createInvite(trip:Trip,name:string){return this.change(state=>{
  const {participant,token,tokenHash}=newInvite(trip,name);
  const packKey=documentKey(trip.id,trip.version);
  if(state.packs[packKey]&&packFingerprint(state.packs[packKey])!==packFingerprint(trip))throw new AppError(409,'卡片內容已變更，請更新旅程版本後再建立邀請。');
  state.packs[packKey]??=structuredClone(trip);state.participants[participant.id]={...participant,tokenHash};return {participant,token};
 });}
 async resolveToken(token:string){const state=await this.snapshot();const found=Object.values(state.participants).find(p=>p.tokenHash===hashToken(token));assertActive(found);return publicParticipant(found);}
 async answersForParticipant(id:string){const state=await this.snapshot();return Object.values(state.answers).filter(a=>a.participantId===id).map(({participantId:_,tripId:__,tripVersion:___,...answer})=>answer);}
 async saveAnswer(participant:Participant,input:AnswerInput){return this.change(state=>{
  const active=state.participants[participant.id];assertActive(active);
  const answerKey=documentKey(participant.id,input.cardId),eventKey=documentKey(participant.id,input.operationId);
  const pack=state.packs[documentKey(active.tripId,active.tripVersion)];
  if(!pack?.cards.some(c=>c.id===input.cardId))throw new AppError(400,'這張卡片不存在。');
  const result=planAnswer(active,input,state.answers[answerKey],state.events[eventKey],new Date().toISOString());
  if(!result.replayed){state.events[eventKey]=result.event;state.answers[answerKey]={...result.answer,participantId:active.id,tripId:active.tripId,tripVersion:active.tripVersion};}
  return result.answer;
 });}
 async participantsForTrip(id:string){const state=await this.snapshot();return Object.values(state.participants).filter(p=>p.tripId===id).map(publicParticipant);}
 async answersForTrip(id:string){const state=await this.snapshot();return Object.values(state.answers).filter(a=>a.tripId===id);}
 async eventsForTrip(id:string){const state=await this.snapshot();return Object.values(state.events).filter(e=>e.tripId===id);}
 async packsForTrip(id:string){const state=await this.snapshot();return Object.values(state.packs).filter(t=>t.id===id);}
 async revoke(tripId:string,participantId:string){return this.change(state=>{const p=state.participants[participantId];if(!p||p.tripId!==tripId)throw new AppError(404,'找不到這位旅伴。');p.revoked=true;});}
}
