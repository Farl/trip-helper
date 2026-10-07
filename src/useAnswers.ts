import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Answer, AnswerInput, Choice, Participant, Trip } from '../shared/types';
import { ApiError, getSession, saveAnswer } from './api';
import { createOutbox } from './outbox';
interface CachedSession { trip?: Trip; participant?: Participant; answers: Record<string, Answer>; outbox: AnswerInput[]; position: number }
interface Conflict { operationId: string; cardId: string; choice: Choice; remote: Answer | null }
const EMPTY: CachedSession = { answers: {}, outbox: [], position: 0 };
const RETRY_MS = 8000;
const STORAGE_WARNING = '瀏覽器無法保留資料。關閉頁面前，請確認全部已儲存。';
export const sessionCacheKey = (tripId: string, token: string) => `trip-helper:session:${tripId}:${token}`;
function readMetadata(key: string): CachedSession {
  try { const raw = localStorage.getItem(key); if (raw) return { ...EMPTY, ...JSON.parse(raw) }; } catch { /* Private browser settings may prevent persistence. */ }
  return { ...EMPTY, answers: {}, outbox: [] };
}
export function readCachedTrip(tripId: string, token: string) {
  const cached = readMetadata(sessionCacheKey(tripId, token));
  return cached.participant?.tripId === tripId && cached.trip?.id === tripId ? cached.trip : undefined;
}
function readCache(key: string): CachedSession {
  const cached = readMetadata(key);
  try {
    const box = createOutbox(localStorage, key);
    // Migrate the earlier whole-queue format once; future metadata writes never contain operations.
    for (const input of cached.outbox) box.add(input);
    if (cached.outbox.length) { const { outbox: _legacy, ...metadata } = cached; localStorage.setItem(key, JSON.stringify(metadata)); }
    return { ...cached, outbox: box.list() };
  } catch { return cached; }
}
function mergeAnswers(current: Record<string, Answer>, incoming: Answer[]) {
  const merged = { ...current };
  for (const answer of incoming) if (!merged[answer.cardId] || merged[answer.cardId].revision <= answer.revision) merged[answer.cardId] = answer;
  return merged;
}
/** Operation records are independent across tabs and retain their ID until acknowledged. */
export function useAnswers(trip: Trip, token: string) {
  const cacheKey = sessionCacheKey(trip.id, token);
  const [cache, setCache] = useState<CachedSession>(() => token ? readCache(cacheKey) : { ...EMPTY, answers: {}, outbox: [] });
  const cacheRef = useRef(cache); cacheRef.current = cache;
  const [ready, setReady] = useState(!token);
  const [error, setError] = useState(''); const [storageError, setStorageError] = useState('');
  const [saving, setSaving] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const [conflict, setConflict] = useState<Conflict | null>(null); const [retry, setRetry] = useState(0); const [blocked, setBlocked] = useState(false);
  const running = useRef(false); const mounted = useRef(true); const nextAttempt = useRef(0);
  const box = useMemo(() => { try { return createOutbox(localStorage, cacheKey); } catch { return undefined; } }, [cacheKey]);
  const updateCache = useCallback((update: (previous: CachedSession) => CachedSession) => {
    let next = update(cacheRef.current);
    if (token) {
      try {
        const persisted = readMetadata(cacheKey);
        next = { ...next, answers: mergeAnswers(next.answers, Object.values(persisted.answers)) };
        const { outbox: _pending, ...metadata } = next;
        localStorage.setItem(cacheKey, JSON.stringify(metadata));
      } catch { setStorageError(STORAGE_WARNING); }
    }
    cacheRef.current = next; setCache(next);
  }, [cacheKey, token]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!token || !box) return;
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== null && event.key !== cacheKey && !event.key.startsWith(box.prefix))) return;
      try {
        const metadata = readMetadata(cacheKey);
        // Storage-event updates stay in memory: writing them back would create a two-tab feedback loop.
        setCache(previous => ({ ...previous, answers: mergeAnswers(previous.answers, Object.values(metadata.answers)), outbox: box.list() }));
      } catch { setStorageError(STORAGE_WARNING); }
    };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, [token, cacheKey, box]);
  useEffect(() => {
    const onOnline = () => { nextAttempt.current = 0; setOnline(true); setRetry(n => n + 1); }; const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getSession(token).then(session => {
      if (!alive) return;
      if (session.participant.tripId !== trip.id) throw new Error('這份邀請屬於其他旅程，請使用原本的邀請連結。');
      if (session.participant.revoked) throw new Error('這份邀請已停用，請向旅程管理者索取新連結。');
      updateCache(previous => ({ ...previous, trip: session.trip ?? previous.trip, participant: session.participant, answers: mergeAnswers(previous.answers, session.answers) }));
      setError(''); setReady(true);
    }).catch(reason => {
      if (!alive) return;
      if (reason instanceof ApiError && [400, 401, 403].includes(reason.status)) { setError('邀請無法使用，請向旅程管理者索取有效連結。'); setBlocked(true); }
      else if (reason instanceof TypeError || (reason instanceof ApiError && reason.status >= 500)) { setError('暫時無法連線。你的選擇會保留在這台裝置，連線後再傳送。'); setReady(Boolean(cacheRef.current.participant)); }
      else { setError(reason.message || '無法載入邀請'); setBlocked(true); }
    });
    return () => { alive = false; };
  }, [trip.id, token, retry, updateCache]);
  useEffect(() => {
    if (!token || !ready || !online || blocked || conflict || !cache.outbox.length || running.current || Date.now() < nextAttempt.current) return;
    running.current = true; setSaving(true); const input = cache.outbox[0];
    saveAnswer(trip.id, token, input).then(({ answer }) => {
      if (!mounted.current) return;
      nextAttempt.current = 0; setError('');
      // Publish the acknowledged revision before removing its record, so other tabs see a complete state.
      updateCache(previous => ({ ...previous, answers: mergeAnswers(previous.answers, [answer]), outbox: previous.outbox.filter(item => item.operationId !== input.operationId) }));
      try { box?.remove([input.operationId]); const remaining = box?.list(); if (remaining) setCache(previous => ({ ...previous, outbox: remaining })); } catch { setStorageError(STORAGE_WARNING); }
    }).catch(reason => {
      if (!mounted.current) return;
      nextAttempt.current = Date.now() + RETRY_MS;
      if (reason instanceof ApiError && reason.status === 409) setConflict({ operationId: input.operationId, cardId: input.cardId, choice: input.choice, remote: reason.answer ?? null });
      else if (reason instanceof ApiError && [400, 401, 403].includes(reason.status)) { setError('這份邀請目前無法儲存。請聯絡旅程管理者；待傳送的選擇仍保留在這台裝置。'); setBlocked(true); }
      else setError('目前無法傳送。選擇已保留在這台裝置，稍後自動重試。');
    }).finally(() => { running.current = false; if (mounted.current) setSaving(false); });
  }, [cache.outbox, ready, online, blocked, conflict, trip.id, token, retry, saving, box, updateCache]);
  useEffect(() => {
    if (!token || blocked || conflict || (!error && !cache.outbox.length)) return;
    const timer = window.setTimeout(() => setRetry(n => n + 1), RETRY_MS); return () => clearTimeout(timer);
  }, [token, blocked, conflict, error, cache.outbox.length, retry]);
  const answers = useMemo(() => {
    const choices: Record<string, Choice> = Object.fromEntries(Object.values(cache.answers).map(answer => [answer.cardId, answer.choice]));
    for (const item of cache.outbox) choices[item.cardId] = item.choice;
    return choices;
  }, [cache.answers, cache.outbox]);
  const choose = useCallback((cardId: string, choice: Choice): boolean => {
    if (!token || !ready || blocked || conflict) return false;
    const previous = cacheRef.current; let queue = previous.outbox;
    try { if (box) queue = box.list(); } catch { setStorageError(STORAGE_WARNING); }
    const lastQueued = [...queue].reverse().find(item => item.cardId === cardId);
    if ((lastQueued?.choice ?? previous.answers[cardId]?.choice) === choice) return true;
    const input: AnswerInput = { operationId: crypto.randomUUID(), cardId, tripVersion: previous.trip?.version ?? trip.version, choice, expectedRevision: Math.max(previous.answers[cardId]?.revision ?? 0, lastQueued ? lastQueued.expectedRevision + 1 : 0) };
    try { if (!box) throw new Error('Storage unavailable'); box.add(input); queue = box.list(); } catch { queue = [...queue, input]; setStorageError(STORAGE_WARNING); }
    updateCache(current => ({ ...current, outbox: queue })); return true;
  }, [token, ready, blocked, conflict, trip.version, box, updateCache]);
  const resolveConflict = (keepLocal: boolean) => {
    if (!conflict) return;
    const previous = cacheRef.current; const known = previous.outbox.filter(item => item.cardId === conflict.cardId);
    const lastChoice = known.at(-1)?.choice ?? conflict.choice;
    let queue = previous.outbox.filter(item => !known.some(removed => removed.operationId === item.operationId));
    try { if (box) { box.remove(known.map(item => item.operationId)); queue = box.list(); } } catch { setStorageError(STORAGE_WARNING); }
    if (keepLocal) {
      const lastQueued = [...queue].reverse().find(item => item.cardId === conflict.cardId);
      const input: AnswerInput = { operationId: crypto.randomUUID(), cardId: conflict.cardId, choice: lastChoice, tripVersion: previous.trip?.version ?? trip.version, expectedRevision: Math.max(conflict.remote?.revision ?? 0, lastQueued ? lastQueued.expectedRevision + 1 : 0) };
      try { if (!box) throw new Error('Storage unavailable'); box.add(input); queue = box.list(); } catch { queue = [...queue, input]; setStorageError(STORAGE_WARNING); }
    }
    updateCache(current => { const answers = { ...current.answers }; if (conflict.remote) answers[conflict.cardId] = conflict.remote; else delete answers[conflict.cardId]; return { ...current, answers, outbox: queue }; });
    nextAttempt.current = 0; setConflict(null); setError('');
  };
  const setPosition = (position: number) => updateCache(previous => ({ ...previous, position }));
  return { answers, trip: cache.trip, participant: cache.participant, position: cache.position, setPosition, choose, ready, error, storageError, saving, online, pending: cache.outbox.length, conflict, resolveConflict, blocked, retryNow: () => { nextAttempt.current = 0; setRetry(n => n + 1); } };
}
