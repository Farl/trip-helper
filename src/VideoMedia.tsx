import { useEffect, useRef, useState } from 'react';
import type { TripCard } from '../shared/types';
import { youtubeVideoId, youtubeEmbedUrl, YOUTUBE } from '../shared/video';
import { loadYouTubeApi, type YouTubePlayer } from './videoPlayer';
import { useI18n } from './i18n';
import { Icon, Image } from './ui';

/** The provider stays at its source. Only the active, unobstructed card is allowed to play. */
export function VideoMedia({card,active,adjacent}:{card:TripCard;active:boolean;adjacent:boolean}) {
 const {t}=useI18n();const clip=card.video!;
 const native=useRef<HTMLVideoElement>(null);const host=useRef<HTMLDivElement>(null);const embed=useRef<YouTubePlayer>(null);
 const [playing,setPlaying]=useState(false),[muted,setMuted]=useState(true),[failed,setFailed]=useState(false);
 const [ready,setReady]=useState(false);
 const start=clip.startSeconds??0;
 useEffect(()=>{setFailed(false);setMuted(true);},[clip.url]);
 useEffect(()=>{
  const player=native.current;
  if(!player)return;
  if(active&&!failed){player.muted=true;setMuted(true);void player.play().catch(()=>setPlaying(false));}else player.pause();
  return ()=>player.pause();
 },[active,adjacent,failed]);
 useEffect(()=>{
  if(!active||clip.kind!=='embed'||failed||!host.current)return;
  let cancelled=false;let player:YouTubePlayer|undefined;
  setReady(false);setPlaying(false);
  const root=host.current;
  const readyTimeout=window.setTimeout(()=>{if(!cancelled)setFailed(true);},YOUTUBE.readyTimeoutMs);
  void loadYouTubeApi().then(api=>{
   if(cancelled)return;
   const id=youtubeVideoId(clip.url);if(!id){setFailed(true);return;}
   const mount=document.createElement('iframe');mount.src=youtubeEmbedUrl(clip,window.location.origin)!;mount.title=card.title;mount.allow='autoplay; encrypted-media; picture-in-picture';mount.referrerPolicy='strict-origin-when-cross-origin';root.appendChild(mount);
   setMuted(true);
   player=new api.Player(mount,{videoId:id,host:YOUTUBE.embedOrigin,
    playerVars:{origin:window.location.origin,playsinline:1,controls:0,rel:0,start,...(clip.endSeconds!==undefined?{end:clip.endSeconds}:{} )},
    events:{onReady:event=>{if(cancelled)return;window.clearTimeout(readyTimeout);embed.current=event.target;event.target.mute();setReady(true);event.target.playVideo();},
     onStateChange:event=>{if(cancelled)return;setPlaying(event.data===YOUTUBE.states.playing);if(event.data===YOUTUBE.states.ended)event.target.loadVideoById({videoId:id,startSeconds:start,endSeconds:clip.endSeconds});},
     onError:()=>{if(!cancelled)setFailed(true);},onAutoplayBlocked:()=>{if(!cancelled)setPlaying(false);}}
   });
  }).catch(()=>{if(!cancelled)setFailed(true);});
  return ()=>{cancelled=true;window.clearTimeout(readyTimeout);embed.current=null;player?.destroy();root.replaceChildren();};
 },[active,clip.url,clip.kind,start,clip.endSeconds,failed]);
 function togglePlay(){
  if(clip.kind==='file'){const player=native.current;if(!player)return;if(player.paused)void player.play().catch(()=>setPlaying(false));else player.pause();}
  else if(playing)embed.current?.pauseVideo();else embed.current?.playVideo();
 }
 function toggleSound(){const next=!muted;setMuted(next);if(native.current)native.current.muted=next;if(next)embed.current?.mute();else embed.current?.unMute();}
 const visible=active&&!failed;
 return <div className={`feed-video-media ${clip.kind==='embed'?'is-embed':''}`} data-video-state={failed?'failed':playing?'playing':'paused'}>
  <Image card={card} cover={clip.poster} load={adjacent}/>
  {clip.kind==='file'&&adjacent&&!failed&&<video ref={native} className="feed-video" src={clip.url} poster={clip.poster??card.image?.url} autoPlay={active} muted={muted} loop={clip.endSeconds===undefined&&start===0} playsInline preload={active?'auto':'none'} aria-label={card.title}
   onLoadedMetadata={event=>{event.currentTarget.currentTime=start;setReady(true);}}
   onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setFailed(true)}
   onTimeUpdate={event=>{if(clip.endSeconds!==undefined&&event.currentTarget.currentTime>=clip.endSeconds)event.currentTarget.currentTime=start;}}
   onEnded={event=>{event.currentTarget.currentTime=start;if(active)void event.currentTarget.play().catch(()=>setPlaying(false));}}/>}
  {clip.kind==='embed'&&visible&&<div ref={host} className="feed-embed-host" aria-label={card.title}/>}
  {visible&&<div className="video-actions"><button className="video-icon" disabled={!ready} aria-label={t(playing?'pauseVideo':'playVideo')} onClick={togglePlay}><Icon name={playing?'pause':'play'} size={20}/></button><button className="video-icon" aria-label={t(muted?'unmuteVideo':'muteVideo')} aria-pressed={!muted} disabled={!ready} onClick={toggleSound}><Icon name={muted?'muted':'volume'} size={20}/></button></div>}
  {failed&&active&&<a className="video-fallback" href={clip.sourceUrl??clip.url} target="_blank" rel="noreferrer">{t('videoUnavailable')}<Icon name="arrow" size={16}/></a>}
 </div>;
}
