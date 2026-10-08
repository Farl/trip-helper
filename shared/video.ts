import type { CardVideo } from './types.js';
/** Embed only a recognized player, never arbitrary content inside the decision surface. */
export const YOUTUBE = {
 hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'],
 embedOrigin: 'https://www.youtube-nocookie.com', apiUrl: 'https://www.youtube.com/iframe_api',
 idPattern: /^[a-zA-Z0-9_-]{11}$/, readyTimeoutMs: 15_000,
 states: { ended: 0, playing: 1 },
} as const;
export function youtubeVideoId(source:string):string|undefined {
 try {
  const url=new URL(source);
  if(url.protocol!=='https:'||!(YOUTUBE.hosts as readonly string[]).includes(url.hostname)||url.username||url.password)return;
  const parts=url.pathname.split('/').filter(Boolean);
  const id=url.hostname==='youtu.be'&&parts.length===1?parts[0]:url.pathname==='/watch'?url.searchParams.get('v'):['embed','shorts'].includes(parts[0])&&parts.length===2?parts[1]:undefined;
  return id&&YOUTUBE.idPattern.test(id)?id:undefined;
 }catch{return;}
}
export function youtubeEmbedUrl(video:CardVideo,origin:string):string|undefined {
 const id=youtubeVideoId(video.url);if(!id)return;
 const url=new URL(`/embed/${id}`,YOUTUBE.embedOrigin);
 const params={enablejsapi:'1',playsinline:'1',controls:'0',rel:'0',origin,autoplay:'0'};
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 if(video.startSeconds!==undefined)url.searchParams.set('start',String(video.startSeconds));
 if(video.endSeconds!==undefined)url.searchParams.set('end',String(video.endSeconds));
 return url.href;
}
