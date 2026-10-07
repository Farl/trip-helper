import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type TouchEvent } from 'react';
import type { Choice, Trip, TripCard } from '../shared/types';
import { useAnswers } from './useAnswers';
import { LanguageToggle, useI18n } from './i18n';
import { useLocalizedTrip } from './localizedTrip';
import { Details, Icon, Image, Notice, dateRange } from './ui';

const GESTURE = { axisThreshold: 8, axisRatio: 1.25, commitRatio: .18, minCommit: 55, maxCommit: 95, rotation: 7 };
type Drag = { startX: number; startY: number; x: number; index: number; axis: 'pending' | 'horizontal' | 'vertical' };
function isControl(target: EventTarget | null) { return target instanceof Element && Boolean(target.closest('button,a,input,video')); }
function Media({ card, active, adjacent }: { card: TripCard; active: boolean; adjacent: boolean }) {
  const {t} = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [card.video?.url]);
  useEffect(() => { if (!active) video.current?.pause(); }, [active]);
  if (card.video?.kind === 'file' && adjacent && !failed) return <div className="feed-video-media"><video ref={video} className="feed-video" src={card.video.url} poster={card.video.poster ?? card.image?.url} playsInline preload={active ? 'metadata' : 'none'} aria-label={card.title} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} /><button className="feed-video-toggle" onClick={() => { if (video.current?.paused) void video.current.play().catch(() => setFailed(true)); else video.current?.pause(); }}>{t(playing ? 'pauseVideo' : 'playVideo')}</button></div>;
  return <Image card={card} load={adjacent} />;
}
/** Vertical snapping changes the visible card; only explicit binary choices enter the outbox. */
export default function Feed({ trip: initialTrip, token }: { trip: Trip; token: string }) {
  const {locale,t,choiceLabel} = useI18n();
  const session = useAnswers(initialTrip, token);
  const canonical = session.trip ?? initialTrip;
  const localized = useLocalizedTrip(canonical,session.translations);
  const trip = localized.trip ?? canonical;
  const [index, setIndex] = useState(() => Math.min(session.position, Math.max(0, trip.cards.length - 1)));
  const indexRef = useRef(index);
  const [mode, setMode] = useState<'cards' | 'review' | 'complete'>('cards');
  const [details, setDetails] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const preview = !token;
  const canVote = !preview && session.ready && !session.blocked && !session.conflict && !details;
  const answered = trip.cards.filter(card => session.answers[card.id]).length;
  const status = preview ? t('previewMode') : session.blocked ? t('cannotSave') : session.saving ? t('saving') : session.pending ? t('pending',{count:session.pending}) : !session.ready ? t('confirmingInvite') : !session.online ? t('offlineStatus') : t('saved');
  function activate(next: number) {
    const value = Math.max(0, Math.min(trip.cards.length - 1, next));
    if (value !== indexRef.current) { indexRef.current = value; setIndex(value); session.setPosition(value); }
    return value;
  }
  function resetDrag() { dragRef.current = null; setDrag(null); }
  function navigate(next: number) {
    const value = activate(next); resetDrag(); setMode('cards');
    const feed = viewport.current; if (feed) feed.scrollTo({ top: value * feed.clientHeight, behavior: 'instant' });
  }
  function choose(choice: Choice, cardIndex = indexRef.current) {
    const card = trip.cards[cardIndex];
    if (!card || !canVote || !session.choose(card.id, choice, localized.displayLocale)) return;
    if (cardIndex < trip.cards.length - 1) navigate(cardIndex + 1); else { resetDrag(); setMode('complete'); }
  }
  useLayoutEffect(() => {
    if (mode !== 'cards') return;
    const feed = viewport.current; if (feed) feed.scrollTop = indexRef.current * feed.clientHeight;
  }, [mode, trip.cards.length]);
  useEffect(() => {
    const resize = () => { const feed = viewport.current; if (feed) feed.scrollTop = indexRef.current * feed.clientHeight; };
    window.addEventListener('resize', resize); return () => { window.removeEventListener('resize', resize); if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (mode !== 'cards' || details || session.conflict || isControl(event.target) && event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); navigate(indexRef.current + (event.key === 'ArrowDown' ? 1 : -1)); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); if (!preview) choose(event.key === 'ArrowRight' ? 'interested' : 'not_interested'); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [mode, details, session.conflict, session.choose, canVote, preview, localized.displayLocale]);
  function onScroll() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const feed = viewport.current; if (feed && feed.clientHeight) activate(Math.round(feed.scrollTop / feed.clientHeight));
      scrollFrame.current = null;
    });
  }
  function start(x: number, y: number, cardIndex: number, target: EventTarget | null) {
    if (!canVote || cardIndex !== indexRef.current || isControl(target)) return;
    const value: Drag = { startX: x, startY: y, x: 0, index: cardIndex, axis: 'pending' }; dragRef.current = value; setDrag(value);
  }
  function move(x: number, y: number) {
    const current = dragRef.current; if (!current) return;
    const dx = x - current.startX, dy = y - current.startY;
    let axis = current.axis;
    if (axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) > GESTURE.axisThreshold) axis = Math.abs(dx) > Math.abs(dy) * GESTURE.axisRatio ? 'horizontal' : 'vertical';
    const value = { ...current, axis, x: axis === 'horizontal' ? dx : 0 }; dragRef.current = value; setDrag(value);
  }
  function finish(x: number, y: number) {
    move(x, y); const value = dragRef.current; resetDrag();
    if (!value || value.axis !== 'horizontal' || !canVote) return;
    const threshold = Math.min(GESTURE.maxCommit, Math.max(GESTURE.minCommit, (viewport.current?.clientWidth ?? window.innerWidth) * GESTURE.commitRatio));
    if (Math.abs(value.x) >= threshold) choose(value.x > 0 ? 'interested' : 'not_interested', value.index);
  }
  function pointerStart(event: PointerEvent<HTMLElement>, cardIndex: number) {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    start(event.clientX, event.clientY, cardIndex, event.target);
    if (dragRef.current) event.currentTarget.setPointerCapture(event.pointerId);
  }
  function touchStart(event: TouchEvent<HTMLElement>, cardIndex: number) { if (event.touches.length > 1) { resetDrag(); return; } const point = event.changedTouches[0]; if (point) start(point.clientX, point.clientY, cardIndex, event.target); }
  const firstUnanswered = trip.cards.findIndex(card => !session.answers[card.id]);
  if (!trip.cards.length) return <div className="empty-page"><h1>{t('emptyTrip')}</h1><a href="#/">{t('backToTrips')}</a></div>;
  return <main className="feed-page"><div className="feed-shell">
    <header className="feed-hud">
      <div className="hud-top"><a className="feed-home" href="#/" aria-label={t('backToTrips')}><span className="reverse"><Icon name="arrow" size={20} /></span></a><div className="hud-trip"><strong>{trip.destination}</strong><span>{dateRange(trip,locale)}</span></div><LanguageToggle/><button className="hud-review" onClick={() => { resetDrag(); setMode(mode === 'review' ? 'cards' : 'review'); }}>{t(mode === 'review' ? 'backToCards' : 'reviewChoices')}</button></div>
      <div className="hud-meta"><span className="hud-participant">{session.participant?.name ?? t(preview ? 'previewWelcome' : 'readingInvite')}</span><span>{t('answeredCount',{answered,total:trip.cards.length})}</span><div className={`sync-status ${session.pending ? 'pending' : ''}`} role="status"><span className="status-dot" />{status}</div></div>
      <div className="feed-progress" role="progressbar" aria-label={t('progressLabel')} aria-valuemin={0} aria-valuemax={trip.cards.length} aria-valuenow={answered}><span style={{ width: `${answered / trip.cards.length * 100}%` }} /></div>
      {preview && <div className="feed-preview">{t('previewNotice')}<a href={`#/manage/${encodeURIComponent(trip.id)}`}>{t('createInvite')}</a></div>}
    </header>
    <div className="feed-alerts">{localized.loading && <Notice>{t('loadingTranslation')}</Notice>}{localized.fallback && <Notice>{t('translationFallback')}</Notice>}{session.error && <Notice kind="error">{session.error}<button className="inline-button" onClick={session.retryNow}>{t('reconnect')}</button></Notice>}{session.storageError && <Notice kind="error">{session.storageError}</Notice>}{session.conflict && <Notice kind="error"><strong>{t('conflictTitle')}</strong><p>{t('conflictCurrent',{title:trip.cards.find(card => card.id === session.conflict?.cardId)?.title ?? '',choice:session.conflict.remote ? choiceLabel(session.conflict.remote.choice) : t('unanswered')})}</p><div className="conflict-actions"><button onClick={() => session.resolveConflict(false,localized.displayLocale)}>{t('useSaved')}</button><button onClick={() => session.resolveConflict(true,localized.displayLocale)}>{t('keepLocal')}</button></div></Notice>}</div>
    {mode === 'cards' ? <div className="feed-viewport" ref={viewport} onScroll={onScroll} aria-label={t('feedLabel')}>
      {trip.cards.map((card, cardIndex) => {
        const active = cardIndex === index;
        const currentDrag = drag?.index === cardIndex && drag.axis === 'horizontal' ? drag.x : 0;
        const intent = currentDrag > 0 ? 'interested' : currentDrag < 0 ? 'not_interested' : '';
        const width = viewport.current?.clientWidth ?? window.innerWidth;
        return <section className="feed-pane" key={card.id} aria-hidden={!active} inert={!active}>
          <article className={`experience-card ${currentDrag ? 'is-dragging' : ''}`} data-active={active} data-card-id={card.id} data-drag-intent={intent || undefined} style={{ transform: currentDrag ? `translateX(${currentDrag * .8}px) rotate(${currentDrag / width * GESTURE.rotation}deg)` : undefined }}
            onPointerDown={event => pointerStart(event, cardIndex)} onPointerMove={event => { if (event.pointerType !== 'touch') move(event.clientX, event.clientY); }} onPointerUp={event => { if (event.pointerType !== 'touch') finish(event.clientX, event.clientY); }} onPointerCancel={resetDrag}
            onTouchStart={event => touchStart(event, cardIndex)} onTouchMove={event => { const point = event.changedTouches[0]; if (point) move(point.clientX, point.clientY); }} onTouchEnd={event => { const point = event.changedTouches[0]; if (point) finish(point.clientX, point.clientY); }} onTouchCancel={resetDrag}>
            <Media card={card} active={active} adjacent={Math.abs(cardIndex - index) <= 1} /><div className="feed-scrim" />
            {intent && <><div className={`gesture-wash ${intent}`} style={{ opacity: Math.min(.5, Math.abs(currentDrag) / width) }} /><div className={`gesture-stamp ${intent}`} style={{ opacity: Math.min(1, Math.abs(currentDrag) / GESTURE.minCommit) }}>{choiceLabel(intent)}</div></>}
            <div className="feed-copy"><div className="feed-card-meta"><span>{card.category}</span><span>{cardIndex + 1} / {trip.cards.length}</span>{session.answers[card.id] && <span className={`feed-answer ${session.answers[card.id]}`}>{choiceLabel(session.answers[card.id])}</span>}</div><h1>{card.title}</h1><p>{card.description}</p><button className="detail-button" onClick={() => setDetails(card.id)}>{t('details')}<Icon name="info" size={18} /></button>
              <div className="answer-controls"><button className={`answer-button no ${session.answers[card.id] === 'not_interested' ? 'selected' : ''}`} disabled={!active || !canVote} onClick={() => choose('not_interested', cardIndex)}><Icon name="close" /><span>{t('notInterested')}</span></button><button className={`answer-button yes ${session.answers[card.id] === 'interested' ? 'selected' : ''}`} disabled={!active || !canVote} onClick={() => choose('interested', cardIndex)}><Icon name="check" /><span>{t('interested')}</span></button></div>
              <nav className="card-navigation" aria-label={t('feedLabel')}><button disabled={cardIndex === 0} onClick={() => navigate(cardIndex - 1)}><span className="reverse"><Icon name="arrow" size={15} /></span>{t('previous')}</button><span>{t(preview ? 'previewGesture' : 'gestureHint')}</span><button disabled={cardIndex === trip.cards.length - 1} onClick={() => navigate(cardIndex + 1)}>{t('next')}<Icon name="arrow" size={15} /></button></nav>
            </div>
          </article>
        </section>;
      })}
    </div> : mode === 'review' ? <section className="feed-panel review-panel"><h1>{t('myChoices')}</h1><p>{t('reviewIntro')}</p><div className="review-list">{trip.cards.map((card, cardIndex) => <button key={card.id} className="review-row" onClick={() => navigate(cardIndex)}><div className="review-thumb"><Image card={card} /></div><div><small>{card.category}</small><strong>{card.title}</strong></div><span className={`review-choice ${session.answers[card.id] ?? 'unanswered'}`}>{session.answers[card.id] ? choiceLabel(session.answers[card.id]) : t('unanswered')}</span><Icon name="arrow" size={18} /></button>)}</div></section> : <section className="feed-panel completion-panel"><div className="completion-mark"><Icon name="check" size={40} /></div><h1>{t(answered === trip.cards.length ? 'allDone' : 'seenAll')}</h1><p>{answered === trip.cards.length ? t('doneIntro') : t('incompleteIntro',{count:trip.cards.length - answered})}</p><Notice>{session.pending ? t('pendingClose',{count:session.pending}) : t(session.saving ? 'saving' : 'choicesSaved')}</Notice><button className="primary-button" onClick={() => setMode('review')}>{t('checkChoices')}<Icon name="arrow" /></button><button className="text-button" onClick={() => navigate(firstUnanswered < 0 ? 0 : firstUnanswered)}>{t('backToCards')}</button></section>}
    {details && <Details card={trip.cards.find(card => card.id === details)!} close={() => setDetails(null)} />}
  </div></main>;
}
