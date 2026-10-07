import { describe,expect,it } from 'vitest';
import { localizeTrip,matchesTranslation,translationPath,type TripTranslation } from '../shared/localization.js';
import { fixture } from './fixture.js';
const english:TripTranslation={tripId:fixture.id,tripVersion:fixture.version,locale:'en',title:'Our Taipei trip',destination:'Taipei',intro:'Choose the experiences you like.',cards:Object.fromEntries(fixture.cards.map(card=>[card.id,{title:`English ${card.id}`,description:'A translated experience',category:'Experience',tags:['activity'],sourceTitle:'Official source',facts:{duration:'Planning estimate',cost:'Check official prices',mobility:'Check access'}}]))};
describe('language-independent card identity',()=>{
 it('translates every visible field without changing IDs, version, order or source URLs',()=>{
  const original=structuredClone(fixture);const display=localizeTrip(fixture,english,'en');
  expect(display.title).toBe(english.title);expect(display.cards[0].description).toBe(english.cards.ramen.description);
  expect(display.cards.map(c=>({id:c.id,placeId:c.placeId,url:c.source.url}))).toEqual(fixture.cards.map(c=>({id:c.id,placeId:c.placeId,url:c.source.url})));
  expect(display.version).toBe(fixture.version);expect(fixture).toEqual(original);
 });
 it('does not apply English copy from another published version',()=>{expect(localizeTrip(fixture,{...english,tripVersion:'different-version'},'en')).toBe(fixture);});
 it('returns canonical Traditional Chinese when switching back',()=>{expect(localizeTrip(fixture,english,'zh-Hant')).toBe(fixture);});
 it('does not silently mix incomplete English with Chinese cards',()=>{expect(localizeTrip(fixture,{...english,cards:{}},'en')).toBe(fixture);});
 it('loads locale resources by both journey and immutable content version',()=>{expect(translationPath(fixture,'en')).toBe('trips/locales/en/test-trip/v1.json');});
});

it('rejects malformed cached copy instead of passing objects to React',()=>{
 const malformed=[{...english,destination:{}},{...english,cards:{...english.cards,ramen:{...english.cards.ramen,title:{bad:'value'}}}},{...english,cards:{...english.cards,ramen:{...english.cards.ramen,facts:{...english.cards.ramen.facts,duration:{}}}}},{...english,cards:{...english.cards,ramen:{...english.cards.ramen,tags:[{}]}}}];
 for(const copy of malformed){expect(matchesTranslation(fixture,copy as unknown as TripTranslation,'en')).toBe(false);expect(localizeTrip(fixture,copy as unknown as TripTranslation,'en')).toBe(fixture);}
});
