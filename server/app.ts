import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import type { Store } from './store.js';
import type { ContentRepository } from './content.js';
import type { Participant, Trip } from '../shared/types.js';
import { SUPPORTED_LOCALES } from '../shared/localization.js';
import { AppError, equalToken, hashToken } from './domain.js';
const answerSchema=z.object({operationId:z.uuid(),cardId:z.string().min(1).max(128),tripVersion:z.string().min(1).max(128),choice:z.enum(['interested','not_interested']),expectedRevision:z.number().int().min(0),displayLocale:z.enum(SUPPORTED_LOCALES).optional()}).strict();
const visitSchema=z.object({operationId:z.uuid(),sessionId:z.uuid(),cardId:z.string().min(1).max(128),tripVersion:z.string().min(1).max(128),displayLocale:z.enum(SUPPORTED_LOCALES).optional(),previousOperationId:z.uuid().nullable()}).strict();
function bearer(req:Request){const match=req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);if(!match)throw new AppError(401,'請使用有效的邀請連結或管理金鑰。',undefined,'AUTH_REQUIRED');return match[1];}
function param(req:Request,key:string):string {const value=req.params[key];if(typeof value!=='string')throw new AppError(400,'網址格式不正確。',undefined,'ROUTE_INVALID');return value;}
export function createApp(config:AppConfig,store:Store,content:ContentRepository){
 const app=express();app.disable('x-powered-by');
 const counters=new Map<string,{count:number;starts:number}>();
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});
  const origin=req.get('Origin');
  if(origin&&!config.allowedOrigins.includes(origin)){res.status(403).json({error:'這個網站來源不在允許清單。',errorCode:'ORIGIN_FORBIDDEN'});return;}
  if(origin){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');}
  if(req.method==='OPTIONS'){res.sendStatus(204);return;}
  if(req.path.startsWith('/api/')&&['PUT','POST'].includes(req.method)){
   const now=Date.now();for(const [key,counter]of counters)if(now-counter.starts>60000)counters.delete(key);
   const key=hashToken(req.get('Authorization')??req.ip??'unknown');const counter=counters.get(key)??{count:0,starts:now};
   // This per-instance safeguard complements Cloud Run instance caps, not a global billing cap.
   if(counter.count>=config.maxOperationsPerMinute||counters.size>=10000&&!counters.has(key)){res.set('Retry-After','60');res.status(429).json({error:'操作太快，請稍等一分鐘再試。',errorCode:'RATE_LIMITED'});return;}
   counter.count++;counters.set(key,counter);
  }
  next();
 });
 app.use(express.json({limit:'32kb'}));
 const admin=(req:Request,_res:Response,next:NextFunction)=>{try{if(!equalToken(bearer(req),config.adminToken))throw new AppError(401,'管理金鑰不正確。',undefined,'ADMIN_INVALID');next();}catch(error){next(error);}};
 async function participant(req:Request):Promise<Participant>{return store.resolveToken(bearer(req));}
 async function packFor(p:Participant):Promise<Trip>{const packs=await store.packsForTrip(p.tripId);const pack=packs.find(t=>t.version===p.tripVersion);if(!pack)throw new AppError(503,'旅程內容暫時無法取得，請稍後重試。',undefined,'PACK_UNAVAILABLE');return pack;}
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.get('/api/config',(_req,res)=>res.json({appName:config.appName,storage:config.storage==='file'?'local':'firestore'}));
 app.get('/api/session',async(req,res)=>{const p=await participant(req);const [answers,trip,progress]=await Promise.all([store.answersForParticipant(p.id),packFor(p),store.progressForParticipant(p.id)]);res.json({participant:p,answers,trip,progress,translations:await content.translationsFor(trip)});});
 app.post('/api/trips/:id/invites',admin,async(req,res)=>{
  const nameSchema=z.object({name:z.string().trim().min(1).max(config.maxNameLength).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict();const parsed=nameSchema.safeParse(req.body);
  if(!parsed.success)throw new AppError(400,`請填寫 1–${config.maxNameLength} 字的旅伴稱呼。`,undefined,'NAME_INVALID',{max:config.maxNameLength});
  const trip=await content.get(param(req,'id'));res.status(201).json(await store.createInvite(trip,parsed.data.name));
 });
 app.put('/api/trips/:id/answers',async(req,res)=>{
  const p=await participant(req);if(p.tripId!==param(req,'id'))throw new AppError(403,'這份邀請不能修改其他旅程。',undefined,'TRIP_FORBIDDEN');
  const parsed=answerSchema.safeParse(req.body);if(!parsed.success)throw new AppError(400,'選擇資料格式不正確。',undefined,'ANSWER_INVALID');
  res.json({answer:await store.saveAnswer(p,parsed.data)});
 });
 app.put('/api/trips/:id/visits',async(req,res)=>{
  const p=await participant(req);if(p.tripId!==param(req,'id'))throw new AppError(403,'這份邀請不能修改其他旅程。',undefined,'TRIP_FORBIDDEN');
  const parsed=visitSchema.safeParse(req.body);if(!parsed.success)throw new AppError(400,'瀏覽資料格式不正確。',undefined,'VISIT_INVALID');
  res.json(await store.recordVisit(p,parsed.data));
 });
 app.post('/api/trips/:id/invites/:participantId/revoke',admin,async(req,res)=>{await store.revoke(param(req,'id'),param(req,'participantId'));res.json({ok:true});});
 app.get('/api/trips/:id/stats',admin,async(req,res)=>{
  const trip=await content.get(param(req,'id'));const [participants,answers,packs]=await Promise.all([store.participantsForTrip(trip.id),store.answersForTrip(trip.id),store.packsForTrip(trip.id)]);
  const active=participants.filter(p=>!p.revoked);const activeIds=new Set(active.map(p=>p.id));
  const activeAnswers=answers.filter(a=>activeIds.has(a.participantId));
  const cards=new Map([...packs,trip].flatMap(t=>t.cards).map(c=>[c.id,c]));
  res.json({tripId:trip.id,participants:participants.map(p=>({...p,answered:answers.filter(a=>a.participantId===p.id).length,total:(packs.find(t=>t.version===p.tripVersion)??trip).cards.length})),cards:[...cards.keys()].map(cardId=>{const eligible=new Set(active.filter(p=>packs.find(pack=>pack.version===p.tripVersion)?.cards.some(c=>c.id===cardId)).map(p=>p.id));const cardAnswers=activeAnswers.filter(a=>a.cardId===cardId&&eligible.has(a.participantId));return {cardId,interested:cardAnswers.filter(a=>a.choice==='interested').length,notInterested:cardAnswers.filter(a=>a.choice==='not_interested').length,unanswered:eligible.size-cardAnswers.length};})});
 });
 app.get('/api/trips/:id/export',admin,async(req,res)=>{
  const id=param(req,'id');await content.get(id);
  // Cursor snapshots come first, then append-only receipts, then their invite/pack references.
  // Every exported cursor therefore has its committed visit in this download, even under writes.
  const progresses=await store.progressesForTrip(id);
  const [events,visits]=await Promise.all([store.eventsForTrip(id),store.visitsForTrip(id)]);
  const [participants,contentVersions]=await Promise.all([store.participantsForTrip(id),store.packsForTrip(id)]);
  // Immutable events provide a consistent logical cutoff even if someone answers during download.
  events.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.operationId.localeCompare(b.operationId));
  visits.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.operationId.localeCompare(b.operationId));
  const latest=new Map<string,typeof events[number]>();for(const event of events){const key=`${event.participantId}:${event.cardId}`;if((latest.get(key)?.revision??0)<event.revision)latest.set(key,event);}
  const answers=[...latest.values()].map(e=>({participantId:e.participantId,tripId:e.tripId,tripVersion:e.tripVersion,cardId:e.cardId,choice:e.choice,revision:e.revision,updatedAt:e.recordedAt}));
  res.set('Content-Disposition',`attachment; filename="${id}-responses.json"`);
  res.json({schemaVersion:2,tripId:id,exportedAt:new Date().toISOString(),throughEventAt:events.at(-1)?.recordedAt??null,throughVisitAt:visits.at(-1)?.recordedAt??null,participants,contentVersions,answers,events,visits,progresses,translations:(await Promise.all(contentVersions.map(pack=>content.translationsFor(pack)))).flatMap(translations=>Object.values(translations))});
 });
 app.use((_req,res)=>res.status(404).json({error:'找不到這個功能。',errorCode:'NOT_FOUND'}));
 app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof AppError){res.status(error.status).json({error:error.message,errorCode:error.errorCode,...(error.params?{params:error.params}:{}),...(error.answer!==undefined?{answer:error.answer}:{})});return;}
  const status=(error as {status?:number}).status;if(status===400||status===413){res.status(status).json({error:status===413?'資料太大，請縮小後再試。':'傳送的資料格式不正確。',errorCode:status===413?'BODY_TOO_LARGE':'BODY_INVALID'});return;}
  console.error('API request failed:',error instanceof Error?error.message:'Unknown error');res.status(500).json({error:'暫時無法處理，請稍後重試。',errorCode:'INTERNAL_ERROR'});
 });
 return app;
}
