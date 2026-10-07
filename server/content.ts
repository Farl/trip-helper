import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppError } from './domain.js';
import type { Trip } from '../shared/types.js';
const httpsUrl=z.url().refine(value=>value.startsWith('https://'),'Source URLs must use HTTPS');
const media=z.object({url:httpsUrl,alt:z.string().min(1),credit:z.string().min(1),sourceUrl:httpsUrl});
export const tripSchema=z.object({
 id:z.string().regex(/^[a-z0-9-]+$/),version:z.string().min(1).max(128),title:z.string().min(1),destination:z.string().min(1),
 startsOn:z.iso.date(),endsOn:z.iso.date(),audience:z.object({minAge:z.number().int().min(0),maxAge:z.number().int().min(0)}),intro:z.string(),
 cards:z.array(z.object({id:z.string().regex(/^[a-z0-9-]+$/),placeId:z.string().min(1),title:z.string().min(1),description:z.string().min(1),category:z.string().min(1),tags:z.array(z.string().min(1)),image:media.optional(),video:z.object({url:httpsUrl,kind:z.enum(['file','embed']),poster:httpsUrl.optional()}).optional(),source:z.object({url:httpsUrl,title:z.string().min(1),checkedAt:z.iso.date()}),facts:z.object({duration:z.string(),cost:z.string(),mobility:z.string(),seasonalNote:z.string().optional()})})).min(1)
}).superRefine((trip,ctx)=>{
 if(new Set(trip.cards.map(c=>c.id)).size!==trip.cards.length)ctx.addIssue({code:'custom',message:'Card IDs must be unique',path:['cards']});
 if(trip.endsOn<trip.startsOn)ctx.addIssue({code:'custom',message:'End date is before start',path:['endsOn']});
 if(trip.audience.maxAge<trip.audience.minAge)ctx.addIssue({code:'custom',message:'Invalid audience ages',path:['audience']});
});
export class ContentRepository {
 constructor(private directory:string,private maxCards=200,private maxBytes=786432){}
 async get(id:string):Promise<Trip>{
  if(!/^[a-z0-9-]+$/.test(id))throw new AppError(404,'找不到這份旅程。');
  let raw:string;
  try{raw=await readFile(resolve(this.directory,`${id}.json`),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new AppError(404,'找不到這份旅程。');throw error;}
  if(Buffer.byteLength(raw)>this.maxBytes)throw new AppError(422,'旅程資料太大，請拆成多組內容。');
  const result=tripSchema.safeParse(JSON.parse(raw));
  if(!result.success||result.data.cards.length>this.maxCards)throw new AppError(422,'旅程資料格式不正確。');
  return result.data;
 }
}
