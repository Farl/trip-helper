import { YOUTUBE } from '../shared/video';
export interface YouTubePlayer {
 mute():void; unMute():void; playVideo():void; pauseVideo():void; destroy():void;
 loadVideoById(options:{videoId:string;startSeconds?:number;endSeconds?:number}):void;
}
interface PlayerEvent { target:YouTubePlayer; data:number }
export interface YouTubeApi {
 Player:new(element:HTMLElement,options:{videoId:string;host:string;playerVars:Record<string,string|number>;events:{onReady:(event:PlayerEvent)=>void;onStateChange:(event:PlayerEvent)=>void;onError:()=>void;onAutoplayBlocked:()=>void}})=>YouTubePlayer;
}
declare global { interface Window { YT?:YouTubeApi; onYouTubeIframeAPIReady?:()=>void } }
let pending:Promise<YouTubeApi>|undefined;
/** Load once on the first visible embedded card. A failed request may be retried later. */
export function loadYouTubeApi():Promise<YouTubeApi> {
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(pending)return pending;
 pending=new Promise<YouTubeApi>((resolve,reject)=>{
  const script=document.createElement('script');script.src=YOUTUBE.apiUrl;script.async=true;
  const previous=window.onYouTubeIframeAPIReady;
  const timeout=window.setTimeout(()=>fail(),YOUTUBE.readyTimeoutMs);
  function fail(){window.clearTimeout(timeout);script.remove();pending=undefined;reject(new Error('Video provider unavailable'));}
  window.onYouTubeIframeAPIReady=()=>{previous?.();window.clearTimeout(timeout);if(window.YT?.Player)resolve(window.YT);else fail();};
  script.onerror=fail;document.head.appendChild(script);
 });
 return pending;
}
