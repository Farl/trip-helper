import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedProgress, FeedVisitInput, Participant, Trip } from '../shared/types';
import type { Locale } from '../shared/localization';
import { ApiError, saveVisit } from './api';
import { createOutbox } from './outbox';
import { sessionCacheKey } from './useAnswers';
import { UiError, useI18n } from './i18n';

const RETRY_MS = 8000;
/** Visits have their own operation keys: viewing a card never creates a vote. */
export function useFeedActivity(trip: Trip, token: string, participant: Participant | undefined, ready: boolean, remoteProgress: FeedProgress | undefined, online: boolean, rememberProgress:(progress:FeedProgress | undefined)=>void) {
  const {t,errorMessage} = useI18n();
  const scope = `${sessionCacheKey(trip.id,token)}:visits`;
  const box = useMemo(() => { if (!token) return undefined; try { return createOutbox<FeedVisitInput>(localStorage,scope); } catch { return undefined; } },[scope,token]);
  const [queue,setQueue] = useState<FeedVisitInput[]>(() => { try { return box?.list() ?? []; } catch { return []; } });
  const queueRef = useRef(queue); queueRef.current = queue;
  const progress = useRef(remoteProgress);
  const initialized = useRef(false);
  const [resume,setResume] = useState<{ready:boolean;cardId?:string}>({ready:!token});
  const [error,setError] = useState<unknown>();
  const [blocked,setBlocked] = useState(false);
  const [storageError,setStorageError] = useState(false);
  const [saving,setSaving] = useState(false);
  const [retry,setRetry] = useState(0);
  const nextAttempt = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const sessionId = useRef(crypto.randomUUID());
  const lastSeen = useRef<string | undefined>(undefined);

  useEffect(() => { mounted.current=true; return () => { mounted.current=false; }; },[]);
  useEffect(() => {
    if (!token || !ready || !participant || initialized.current) return;
    initialized.current=true; progress.current=remoteProgress;
    // Unsent local navigation survives a restart. Otherwise the server cursor
    // wins over stale browser metadata, including when using a fresh device.
    let pending=queueRef.current;
    try { if (box) pending=box.list(); } catch { setStorageError(true); }
    queueRef.current=pending;setQueue(pending);
    const local=pending.at(-1);
    if (local) lastSeen.current=local.cardId;
    setResume({ready:true,cardId:local?.cardId ?? remoteProgress?.cardId});
  },[token,ready,participant,remoteProgress,box]);
  useEffect(() => {
    const changed=(event:StorageEvent) => {
      if (!box || event.storageArea!==localStorage || (event.key!==null && !event.key.startsWith(box.prefix))) return;
      try { const pending=box.list();queueRef.current=pending;setQueue(pending); } catch { setStorageError(true); }
    };
    const visible=() => { if(document.hidden){lastSeen.current=undefined;sessionId.current=crypto.randomUUID();} };
    window.addEventListener('storage',changed);document.addEventListener('visibilitychange',visible);
    return () => {window.removeEventListener('storage',changed);document.removeEventListener('visibilitychange',visible);};
  },[box]);
  const recordVisit=useCallback((cardId:string,displayLocale:Locale) => {
    if (!token || !initialized.current || blocked || document.hidden || lastSeen.current===cardId) return;
    let pending=queueRef.current;
    try { if(box) pending=box.list(); } catch {setStorageError(true);}
    const input:FeedVisitInput={operationId:crypto.randomUUID(),sessionId:sessionId.current,tripVersion:trip.version,cardId,displayLocale,previousOperationId:pending.at(-1)?.operationId ?? progress.current?.operationId ?? null};
    try {if(!box)throw new Error('Storage unavailable');box.add(input);pending=box.list();}
    catch {pending=[...pending,input];setStorageError(true);}
    lastSeen.current=cardId;queueRef.current=pending;setQueue(pending);
  },[token,blocked,box,trip.version]);
  useEffect(() => {
    if (!token || !ready || !resume.ready || !online || blocked || !queue.length || running.current || Date.now()<nextAttempt.current) return;
    const input=queue[0];running.current=true;setSaving(true);
    saveVisit(trip.id,token,input).then(response => {
      if(!mounted.current)return;
      progress.current=response.progress;rememberProgress(response.progress);nextAttempt.current=0;setError(undefined);
      let pending=queueRef.current.filter(item=>item.operationId!==input.operationId);
      try {box?.remove([input.operationId]);if(box)pending=box.list();} catch {setStorageError(true);}
      queueRef.current=pending;setQueue(pending);
    }).catch(reason => {
      if(!mounted.current)return;
      nextAttempt.current=Date.now()+RETRY_MS;
      if(reason instanceof ApiError && [400,401,403,409].includes(reason.status)){setError(reason);setBlocked(true);}
      else setError(new UiError('sendFailed'));
    }).finally(() => {running.current=false;if(mounted.current)setSaving(false);});
  },[token,ready,resume.ready,online,blocked,queue,retry,saving,trip.id,box,rememberProgress]);
  useEffect(() => {
    if(online){nextAttempt.current=0;setRetry(value=>value+1);}
  },[online]);
  useEffect(() => {
    if(!queue.length || blocked)return;
    const timer=window.setTimeout(()=>setRetry(value=>value+1),RETRY_MS);
    return ()=>clearTimeout(timer);
  },[queue.length,blocked,retry]);
  const retryNow=() => {nextAttempt.current=0;setRetry(value=>value+1);};
  return {resume,recordVisit,pending:queue.length,saving,blocked,error:error ? errorMessage(error):'',storageError:storageError ? t('storageWarning'):'',retryNow};
}
