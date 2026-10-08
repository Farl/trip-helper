import { it,expect } from 'vitest';
import { readFile,mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Trip } from '../shared/types.js';

it('collects a reviewed independent venue with video and protects publication until English is complete',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'trip-collector-test-'));
 try{
  const config=JSON.parse(await readFile('public/trips/sources/taipei-config.json','utf8'));
  const first=config.plans[0];config.outputDirectory=join(directory,'published');
  config.plans=[{...first,id:'reviewed-independent',placeId:'verified-venue',name:'Independent venue outside catalog',catalogRequired:false,
   video:{url:'https://youtu.be/dkr12ZWDd9Y',kind:'embed',startSeconds:3,endSeconds:18,credit:'Source creator',sourceUrl:'https://www.youtube.com/watch?v=dkr12ZWDd9Y'}}];
  const path=join(directory,'config.json'),input=join(directory,'catalog.json'),draft=join(directory,'draft.json');
  await writeFile(path,JSON.stringify(config));await writeFile(input,JSON.stringify({Attractions:[]}));
  const entry=process.env.COLLECTOR_TEST_ENTRY??'scripts/collect-taipei.ts';
  const run=(...extra:string[])=>spawnSync(process.execPath,['--import','tsx',resolve(entry),'--config',path,'--input',input,'--checked-at','2026-10-08',...extra],{encoding:'utf8'});
  const candidate=run('--draft',draft);expect(candidate.status,candidate.stderr).toBe(0);
  const trip=JSON.parse(await readFile(draft,'utf8')) as Trip;expect(trip.cards[0].video?.startSeconds).toBe(3);expect(trip.cards[0].video?.credit).toBe('Source creator');expect(trip.cards[0].source.checkedAt).toBe(first.source.checkedAt);
  expect(run().status).toBe(1);await expect(readFile(join(config.outputDirectory,`${trip.id}.json`))).rejects.toMatchObject({code:'ENOENT'});
  const translation={tripId:trip.id,tripVersion:trip.version,locale:'en',title:'Independent test',destination:'Taipei',intro:'Choose this idea',cards:{'reviewed-independent':{title:'Reviewed activity',description:'An independently sourced activity',category:'Activity',tags:['Video'],sourceTitle:'Official source',imageAlt:'Reviewed source image',imageCredit:'Original credit',facts:{duration:'Planning estimate',cost:'Confirm with venue',mobility:'Confirm access',...(trip.cards[0].facts.seasonalNote?{seasonalNote:'Confirm seasonal conditions'}:{})}}}};
  const localeDirectory=join(config.outputDirectory,'locales/en',trip.id);await mkdir(localeDirectory,{recursive:true});
  await writeFile(join(localeDirectory,`${trip.version}.json`),JSON.stringify(translation));const published=run();expect(published.status,published.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(config.outputDirectory,`${trip.id}.json`),'utf8'))).toEqual(trip);
  const manifest=JSON.parse(await readFile(join(config.outputDirectory,'sources',`${trip.id}-manifest.json`),'utf8'));expect(manifest.records).toEqual([]);expect(manifest.mediaDecisions[0].mode).toBe('video');
  const again=run('--draft',draft);expect(again.status,again.stderr).toBe(0);expect(JSON.parse(await readFile(draft,'utf8'))).toEqual(trip);
 }finally{await rm(directory,{recursive:true,force:true});}
},15000);
