import type { Trip, TripCard } from './types.js';
export const SUPPORTED_LOCALES = ['zh-Hant', 'en'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export interface CardTranslation {
 title:string; description:string; category:string; tags:string[];
 imageAlt?:string; imageCredit?:string; sourceTitle:string; facts:TripCard['facts'];
}
export interface TripTranslation {
 tripId:string; tripVersion:string; locale:Locale;
 title:string; destination:string; intro:string; cards:Record<string,CardTranslation>;
}
export function translationPath(trip:Pick<Trip,'id'|'version'>,locale:Locale):string {
 return `trips/locales/${locale}/${encodeURIComponent(trip.id)}/${encodeURIComponent(trip.version)}.json`;
}
/** A whole pack switches together; stale or incomplete translations stay visibly in the canonical language. */
function isRecord(value:unknown):value is Record<string,unknown> { return typeof value==='object'&&value!==null&&!Array.isArray(value); }
function isText(value:unknown):value is string { return typeof value==='string'&&value.trim().length>0; }
export function matchesTranslation(trip:Trip,translation:unknown,locale:Locale):translation is TripTranslation {
 if(!isRecord(translation)||translation.tripId!==trip.id||translation.tripVersion!==trip.version||translation.locale!==locale)return false;
 if(!isText(translation.title)||!isText(translation.destination)||!isText(translation.intro)||!isRecord(translation.cards)||Object.keys(translation.cards).length!==trip.cards.length)return false;
 const cards=translation.cards;
 return trip.cards.every(card=>{
  const copy=cards[card.id];
  if(!isRecord(copy)||!isText(copy.title)||!isText(copy.description)||!isText(copy.category)||!isText(copy.sourceTitle)||!Array.isArray(copy.tags)||!copy.tags.every(isText)||!isRecord(copy.facts))return false;
  const facts=copy.facts;
  if(!isText(facts.duration)||!isText(facts.cost)||!isText(facts.mobility))return false;
  if((card.facts.seasonalNote||facts.seasonalNote!==undefined)&&!isText(facts.seasonalNote))return false;
  if((card.image||copy.imageAlt!==undefined)&&!isText(copy.imageAlt))return false;
  if((card.image||copy.imageCredit!==undefined)&&!isText(copy.imageCredit))return false;
  return true;
 });
}
/** Translation is presentation only: never replace the canonical pack passed to answer persistence. */
export function localizeTrip(trip:Trip,translation:TripTranslation|undefined,locale:Locale):Trip {
 if(locale==='zh-Hant'||!matchesTranslation(trip,translation,locale))return trip;
 return {...trip,title:translation.title,destination:translation.destination,intro:translation.intro,cards:trip.cards.map(card=>{
  const copy=translation.cards[card.id];
  return {...card,title:copy.title,description:copy.description,category:copy.category,tags:[...copy.tags],facts:{...copy.facts},source:{...card.source,title:copy.sourceTitle},...(card.image?{image:{...card.image,alt:copy.imageAlt!,credit:copy.imageCredit!}}:{})};
 })};
}
