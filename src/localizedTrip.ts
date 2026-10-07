import { useEffect, useState } from 'react';
import { localizeTrip, matchesTranslation, translationPath, type Locale, type TripTranslation } from '../shared/localization';
import type { Trip } from '../shared/types';
import { assetUrl } from './api';
import { useI18n } from './i18n';
const cache = new Map<string,TripTranslation>();
const pending = new Map<string,Promise<TripTranslation | undefined>>();
function key(trip:Trip,locale:Locale) { return `trip-helper:translation:${trip.id}:${trip.version}:${locale}`; }
function read(trip:Trip,locale:Locale) {
 const id=key(trip,locale); if (cache.has(id)) return cache.get(id);
 try { const saved=JSON.parse(localStorage.getItem(id) ?? 'null'); if(matchesTranslation(trip,saved,locale)){cache.set(id,saved);return saved;} } catch { /* A cache miss can always be recovered from the version-specific pack. */ }
 return undefined;
}
function remember(trip:Trip,locale:Locale,value:TripTranslation) { cache.set(key(trip,locale),value); try { localStorage.setItem(key(trip,locale),JSON.stringify(value)); } catch { /* Keep the loaded translation in memory. */ } }
export function loadTranslation(trip:Trip,locale:Locale): Promise<TripTranslation | undefined> {
 const saved=read(trip,locale); if(saved) return Promise.resolve(saved);
 const id=key(trip,locale); const existing=pending.get(id); if(existing) return existing;
 const request=fetch(assetUrl(translationPath(trip,locale))).then(async response => {
  if(!response.ok) return undefined;
  const value=await response.json(); if(!matchesTranslation(trip,value,locale)) return undefined;
  remember(trip,locale,value);return value;
 }).catch(() => undefined).finally(() => pending.delete(id));
 pending.set(id,request);return request;
}
/** Translations are immutable presentation packs. The canonical trip stays in answer persistence. */
export function useLocalizedTrip(trip:Trip | null, pinned?:Partial<Record<Locale,TripTranslation>>) {
 const {locale}=useI18n();
 const [requestState,setRequestState]=useState<{key:string;value?:TripTranslation;settled:boolean}>();
 const scope=trip ? key(trip,locale) : '';
 const loaded=requestState?.key === scope ? requestState.value : undefined;
 const snapshot=trip && matchesTranslation(trip,pinned?.[locale],locale) ? pinned?.[locale] : undefined;
 const cached=trip ? read(trip,locale) : undefined;
 const translation=trip && matchesTranslation(trip,snapshot ?? cached ?? loaded,locale) ? snapshot ?? cached ?? loaded : undefined;
 const loading=Boolean(trip && locale !== 'zh-Hant' && !translation && (requestState?.key !== scope || !requestState.settled));
 useEffect(() => {
  if(!trip || locale === 'zh-Hant' || snapshot || cached)return;
  let alive=true;setRequestState({key:scope,settled:false});
  loadTranslation(trip,locale).then(value => { if(alive)setRequestState({key:scope,value,settled:true}); });
  return () => {alive=false;};
 },[trip?.id,trip?.version,locale,scope,snapshot,cached]);
 const display=trip ? localizeTrip(trip,translation,locale) : null;
 return {trip:display,displayLocale:(locale === 'en' && translation ? 'en' : 'zh-Hant') as Locale,loading,fallback:Boolean(trip && locale !== 'zh-Hant' && !translation && !loading)};
}
