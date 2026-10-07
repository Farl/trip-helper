import { Firestore } from '@google-cloud/firestore';
import type { Answer, AnswerEvent, AnswerInput, Participant, Trip } from '../shared/types.js';
import type { Store, StoredAnswer } from './store.js';
import { AppError, assertActive, documentKey, hashToken, newInvite, packFingerprint, planAnswer } from './domain.js';
interface FirestoreOptions { projectId?:string; databaseId:string; collectionPrefix:string }
/** Only the API service account accesses these collections; Firebase client rules are not authorization. */
export class FirestoreStore implements Store {
 private db:Firestore;
 constructor(private options:FirestoreOptions){
  if(!/^[A-Za-z0-9_-]+$/.test(options.collectionPrefix))throw new Error('Invalid FIRESTORE_COLLECTION_PREFIX');
  this.db=new Firestore({projectId:options.projectId,databaseId:options.databaseId,ignoreUndefinedProperties:true});
 }
 private collection(name:string){return this.db.collection(`${this.options.collectionPrefix}_${name}`);}
 async createInvite(trip:Trip,name:string){
  const {participant,token,tokenHash}=newInvite(trip,name),payload=JSON.stringify(trip);
  const packRef=this.collection('packs').doc(documentKey(trip.id,trip.version));
  await this.db.runTransaction(async tx=>{
   const existing=await tx.get(packRef);
   if(existing.exists&&existing.get('contentHash')!==packFingerprint(trip))throw new AppError(409,'卡片內容已變更，請更新旅程版本後再建立邀請。',undefined,'PACK_CHANGED');
   if(!existing.exists)tx.create(packRef,{tripId:trip.id,version:trip.version,contentHash:packFingerprint(trip),payload});
   tx.create(this.collection('participants').doc(participant.id),participant);
   tx.create(this.collection('invites').doc(tokenHash),{participantId:participant.id,tripId:trip.id});
  });
  return {participant,token};
 }
 async resolveToken(token:string){
  const invite=await this.collection('invites').doc(hashToken(token)).get();
  if(!invite.exists)throw new AppError(401,'邀請連結無效，請向主揪取得連結。',undefined,'INVITE_INVALID');
  const doc=await this.collection('participants').doc(invite.get('participantId')).get();
  const participant=doc.exists?doc.data() as Participant:undefined;assertActive(participant);return participant;
 }
 async answersForParticipant(id:string):Promise<Answer[]>{const query=await this.collection('answers').where('participantId','==',id).get();return query.docs.map(doc=>{const {participantId:_,tripId:__,tripVersion:___,...answer}=doc.data() as StoredAnswer;return answer;});}
 async saveAnswer(participant:Participant,input:AnswerInput){
  const participantRef=this.collection('participants').doc(participant.id),answerRef=this.collection('answers').doc(documentKey(participant.id,input.cardId)),eventRef=this.collection('events').doc(documentKey(participant.id,input.operationId));
  const packRef=this.collection('packs').doc(documentKey(participant.tripId,participant.tripVersion));
  return this.db.runTransaction(async tx=>{
   const [pDoc,answerDoc,eventDoc,packDoc]=await tx.getAll(participantRef,answerRef,eventRef,packRef);
   const active=pDoc.exists?pDoc.data() as Participant:undefined;assertActive(active);
   if(active.tripId!==participant.tripId)throw new AppError(403,'這份邀請不能修改其他旅程。',undefined,'TRIP_FORBIDDEN');
   const pack=packDoc.exists?JSON.parse(packDoc.get('payload')) as Trip:undefined;
   if(!pack?.cards.some(c=>c.id===input.cardId))throw new AppError(400,'這張卡片不存在。',undefined,'CARD_NOT_FOUND');
   const result=planAnswer(active,input,answerDoc.exists?answerDoc.data() as Answer:undefined,eventDoc.exists?eventDoc.data() as AnswerEvent:undefined,new Date().toISOString());
   if(!result.replayed){
    tx.create(eventRef,result.event);
    tx.set(answerRef,{...result.answer,participantId:active.id,tripId:active.tripId,tripVersion:active.tripVersion});
   }
   return result.answer;
  });
 }
 private async byTrip<T>(collection:string,id:string):Promise<T[]>{const result=await this.collection(collection).where('tripId','==',id).get();return result.docs.map(doc=>doc.data() as T);}
 participantsForTrip(id:string){return this.byTrip<Participant>('participants',id);}
 answersForTrip(id:string){return this.byTrip<StoredAnswer>('answers',id);}
 eventsForTrip(id:string){return this.byTrip<AnswerEvent>('events',id);}
 async packsForTrip(id:string){return (await this.byTrip<{payload:string}>('packs',id)).map(p=>JSON.parse(p.payload) as Trip);}
 async revoke(tripId:string,participantId:string){
  const ref=this.collection('participants').doc(participantId);
  await this.db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists||doc.get('tripId')!==tripId)throw new AppError(404,'找不到這位旅伴。',undefined,'PARTICIPANT_NOT_FOUND');tx.update(ref,{revoked:true});});
 }
}
