import { describe, expect, it } from 'vitest';
import { youtubeVideoId, youtubeEmbedUrl } from '../shared/video.js';
import { tripSchema } from '../server/content.js';
import { fixture } from './fixture.js';

describe('reviewed video sources', () => {
 it('accepts real YouTube watch, short and embed links without accepting lookalike hosts', () => {
  const id='dkr12ZWDd9Y';
  for(const url of [`https://www.youtube.com/watch?v=${id}`,`https://youtu.be/${id}`,`https://www.youtube-nocookie.com/embed/${id}`,`https://www.youtube.com/shorts/${id}`]) expect(youtubeVideoId(url)).toBe(id);
  for(const url of ['https://youtube.com.evil.test/watch?v=dkr12ZWDd9Y','https://evil.test/?v=dkr12ZWDd9Y','javascript:alert(1)','https://www.youtube.com/watch?v=invalid','http://youtu.be/dkr12ZWDd9Y']) expect(youtubeVideoId(url)).toBeUndefined();
 });
 it('keeps a timed preview at the original provider and includes the current site origin', () => {
  const url=new URL(youtubeEmbedUrl({url:'https://youtu.be/dkr12ZWDd9Y',kind:'embed',startSeconds:3,endSeconds:18},'http://127.0.0.1:5173')!);
  expect(url.hostname).toBe('www.youtube-nocookie.com');expect(url.pathname).toBe('/embed/dkr12ZWDd9Y');
  expect(url.searchParams.get('start')).toBe('3');expect(url.searchParams.get('end')).toBe('18');expect(url.searchParams.get('origin')).toBe('http://127.0.0.1:5173');expect(url.searchParams.get('enablejsapi')).toBe('1');
 });
 it('rejects reversed clip boundaries and unsupported embed providers before publishing', () => {
  const pack=(video:unknown)=>({...fixture,cards:[{...fixture.cards[0],video}]});
  expect(tripSchema.safeParse(pack({url:'https://youtu.be/dkr12ZWDd9Y',kind:'embed',startSeconds:18,endSeconds:3})).success).toBe(false);
  expect(tripSchema.safeParse(pack({url:'https://evil.test/embed/a',kind:'embed'})).success).toBe(false);
  expect(tripSchema.safeParse(pack({url:'https://youtu.be/dkr12ZWDd9Y',kind:'embed',startSeconds:3,endSeconds:18,credit:'Din Tai Fung',sourceUrl:'https://www.youtube.com/watch?v=dkr12ZWDd9Y'})).success).toBe(true);
 });
});
