import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Answer, AnswerEvent, AnswerInput, Participant, Trip } from '../shared/types.js';
import type { ErrorCode } from '../shared/errors.js';
export class AppError extends Error {
  constructor(public status: number, message: string, public answer?: Answer | null, public errorCode:ErrorCode='INTERNAL_ERROR', public params?:Record<string,string|number>) { super(message); }
}
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function equalToken(a: string,b: string): boolean { return timingSafeEqual(Buffer.from(hashToken(a),'hex'),Buffer.from(hashToken(b),'hex')); }
export function newInvite(trip: Trip,name: string) {
 const token=randomBytes(32).toString('base64url');
 const participant:Participant={id:randomUUID(),name,tripId:trip.id,tripVersion:trip.version,createdAt:new Date().toISOString(),revoked:false};
 return {participant,token,tokenHash:hashToken(token)};
}
export function documentKey(...parts:string[]):string { return hashToken(parts.join('\0')); }
export function assertActive(participant:Participant|undefined): asserts participant is Participant {
 if(!participant) throw new AppError(401,'邀請連結無效，請向主揪取得連結。',undefined,'INVITE_INVALID');
 if(participant.revoked) throw new AppError(403,'這個邀請已停用，請向主揪取得新連結。',undefined,'INVITE_REVOKED');
}
/** Replay the original receipt; optimistic revisions reject stale device edits. */
export function planAnswer(participant: Participant, input: AnswerInput, current: Answer | undefined, event: AnswerEvent | undefined, now: string): {answer: Answer; event: AnswerEvent; replayed: boolean} {
 assertActive(participant);
 if(input.tripVersion!==participant.tripVersion) throw new AppError(409,'這份旅程內容已更新，請重新開啟邀請連結。',current??null,'TRIP_VERSION_CHANGED');
 if(event){
  const same=event.cardId===input.cardId&&event.choice===input.choice&&event.tripVersion===input.tripVersion&&event.expectedRevision===input.expectedRevision&&event.displayLocale===input.displayLocale;
  if(!same) throw new AppError(409,'這次操作已用於另一個選擇，請重新載入。',current??null,'OPERATION_REUSED');
  return {answer:{cardId:event.cardId,choice:event.choice,revision:event.revision,updatedAt:event.recordedAt},event,replayed:true};
 }
 if((current?.revision??0)!==input.expectedRevision) throw new AppError(409,'另一個裝置已更新這張卡片，請確認最新選擇。',current??null,'REVISION_CONFLICT');
 const revision=(current?.revision??0)+1;
 const answer:Answer={cardId:input.cardId,choice:input.choice,revision,updatedAt:now};
 return {answer,event:{...input,participantId:participant.id,tripId:participant.tripId,recordedAt:now,revision},replayed:false};
}

/** Verification dates may refresh; published choice context must remain unchanged. */
export function packFingerprint(trip:Trip):string { return hashToken(JSON.stringify({...trip,cards:trip.cards.map(({source,...card})=>({...card,source:{url:source.url,title:source.title}}))})); }
