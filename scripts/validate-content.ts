import { readdir,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tripSchema } from '../server/content.js';
import type { TripSummary } from '../shared/types.js';
import { translationSchema } from '../server/content.js';
import { matchesTranslation,translationPath } from '../shared/localization.js';
const directory=resolve(process.env.CONTENT_DIRECTORY??'public/trips');
const registry=JSON.parse(await readFile(resolve(directory,'index.json'),'utf8')) as {trips:TripSummary[]};
let count=0;
for(const file of await readdir(directory)){
 if(!file.endsWith('.json')||file==='index.json')continue;
 const trip=tripSchema.parse(JSON.parse(await readFile(resolve(directory,file),'utf8')));
 if(file!==`${trip.id}.json`)throw new Error(`File/id mismatch: ${file}`);
 const listing=registry.trips.find(t=>t.id===trip.id);if(!listing||listing.cardCount!==trip.cards.length)throw new Error(`Registry mismatch: ${file}`);
 const english=translationSchema.parse(JSON.parse(await readFile(resolve(directory,translationPath(trip,'en').replace(/^trips\//,'')),'utf8')));
 if(!matchesTranslation(trip,english,'en'))throw new Error(`Incomplete or stale English translation: ${trip.id}`);
 const images=trip.cards.filter(c=>c.image).length;
 console.log(`${trip.id}: ${trip.cards.length} cards, ${images} images, ${new Set(trip.cards.map(c=>c.placeId)).size} places; Traditional Chinese + English coverage complete; binary-answer content valid.`);count++;
}
if(!count)throw new Error('No trips found');
