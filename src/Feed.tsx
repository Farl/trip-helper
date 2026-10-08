import { useEffect, useLayoutEffect, useRef, useState, useMemo, type PointerEvent, type TouchEvent } from 'react';
import type { Choice, Trip, TripCard } from '../shared/types';
import { orderedCards } from '../shared/presentation';
import { useFeedActivity } from './useFeedActivity';
import { useAnswers } from './useAnswers';
import { VideoMedia } from './VideoMedia';
import { LanguageToggle, useI18n } from './i18n';
import { useLocalizedTrip } from './localizedTrip';
import { Details, Dialog, Icon, Image, Notice, dateRange } from './ui';

const FEED_TIMING = { settleMs: 200 };
const GESTURE = { axisThreshold: 8, axisRatio: 1.25, commitRatio: .18, minCommit: 55, maxCommit: 95, rotation: 7 };
const CHOICE_ACTIONS = [
  { choice:'not_interested', className:'no', icon:'close', label:'notInterested' },
  { choice:'interested', className:'yes', icon:'heart', label:'interested' },
] as const;
function ChoiceButtons({ selected, disabled, choose }: { selected?:Choice; disabled:boolean; choose:(choice:Choice)=>void }) {
  const {t}=useI18n();
  return <div className="answer-controls options-answers">{CHOICE_ACTIONS.map(action=><button key={action.choice} className={`answer-button ${action.className} ${selected===action.choice ? 'selected' : ''}`} aria-pressed={selected===action.choice} disabled={disabled} onClick={()=>choose(action.choice)}><span className="answer-disc"><Icon name={action.icon} size={30}/></span><span>{t(action.label)}</span></button>)}</div>;
}
type Drag = { startX: number; startY: number; x: number; index: number; axis: 'pending' | 'horizontal' | 'vertical' };
function isControl(target: EventTarget | null) { return target instanceof Element && Boolean(target.closest('button,a,input')); }
function Media({card,active,adjacent}:{card:TripCard;active:boolean;adjacent:boolean}) {
  return card.video ? <VideoMedia card={card} active={active} adjacent={adjacent}/> : card.image ? <Image card={card} load={adjacent}/> : null;
}
/** Vertical snapping changes the visible card; only explicit binary choices enter the outbox. */
export default function Feed({ trip: initialTrip, token }: { trip: Trip; token: string }) {
  const {locale,t,choiceLabel} = useI18n();
  const session = useAnswers(initialTrip, token);
  const canonical = session.trip ?? initialTrip;
  const localized = useLocalizedTrip(canonical,session.translations);
  const display = localized.trip ?? canonical;
  const trip = useMemo(() => ({...display,cards:orderedCards(display,session.participant?.presentation)}),[display,session.participant?.presentation]);
  const orderKey = trip.cards.map(card=>card.id).join('\0');
  const activity = useFeedActivity(canonical,token,session.participant,session.ready,session.progress,session.online,session.rememberProgress);
  const [restored,setRestored] = useState(!token);
  const didRestore = useRef(!token);
  const [visible,setVisible] = useState(!document.hidden);
  const pending = session.pending + activity.pending;
  const [settling,setSettling] = useState(false);
  const saving = session.saving || activity.saving || settling;
  const blocked = session.blocked || activity.blocked;
  const [index, setIndex] = useState(() => Math.min(session.position, Math.max(0, trip.cards.length - 1)));
  const indexRef = useRef(index);
  const activeCardId = trip.cards[index]?.id;
  const [mode, setMode] = useState<'cards' | 'review' | 'complete'>('cards');
  const [details, setDetails] = useState<string | null>(null);
  const [options, setOptions] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const preview = !token;
  const canChoose = session.ready && restored && !blocked && !session.conflict && !details;
  const canVote = canChoose && !options;
  const answered = trip.cards.filter(card => session.answers[card.id]).length;
  const status = preview ? t('previewMode') : blocked ? t('cannotSave') : saving ? t('saving') : pending ? t('pending',{count:pending}) : !session.ready ? t('confirmingInvite') : !session.online ? t('offlineStatus') : t('saved');
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
    if (!card || !canChoose) return;
    // An explicit choice establishes exposure even before the scroll settles.
    activity.recordVisit(card.id,localized.displayLocale);
    if (!session.choose(card.id, choice, localized.displayLocale)) return;
    setOptions(false);
    if (cardIndex < trip.cards.length - 1) navigate(cardIndex + 1); else { resetDrag(); setMode('complete'); }
  }
  useLayoutEffect(() => {
    if(didRestore.current || !activity.resume.ready)return;
    didRestore.current=true;
    const position=trip.cards.findIndex(card=>card.id===activity.resume.cardId);
    const resumePosition=position>=0 ? position : session.position;
    const nextUnanswered=trip.cards.findIndex((card,cardIndex)=>cardIndex>=resumePosition && !session.answers[card.id]);
    navigate(session.answers[trip.cards[resumePosition]?.id] && nextUnanswered>=0 ? nextUnanswered : resumePosition);
    if(answered===trip.cards.length)setMode('complete');
    setRestored(true);
  },[activity.resume.ready,activity.resume.cardId,trip.cards]);
  useEffect(() => {
    const eligible=restored && visible && mode==='cards' && !details && !options && !localized.loading && Boolean(activeCardId);
    setSettling(Boolean(token && eligible));
    if(!eligible)return;
    const timer=window.setTimeout(()=>{activity.recordVisit(activeCardId,localized.displayLocale);setSettling(false);},FEED_TIMING.settleMs);
    return()=>clearTimeout(timer);
  },[token,restored,visible,mode,details,options,activeCardId,localized.loading,localized.displayLocale,activity.recordVisit]);
  useEffect(() => {const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
  useLayoutEffect(() => {
    if (mode !== 'cards') return;
    const feed = viewport.current; if (feed) feed.scrollTop = indexRef.current * feed.clientHeight;
  }, [mode, orderKey, restored]);
  useEffect(() => {
    const resize = () => { const feed = viewport.current; if (feed) feed.scrollTop = indexRef.current * feed.clientHeight; };
    window.addEventListener('resize', resize); return () => { window.removeEventListener('resize', resize); if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (mode !== 'cards' || details || options || session.conflict || isControl(event.target) && event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); navigate(indexRef.current + (event.key === 'ArrowDown' ? 1 : -1)); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); choose(event.key === 'ArrowRight' ? 'interested' : 'not_interested'); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [mode, details, options, session.conflict, session.choose, canVote, preview, localized.displayLocale]);
  function onScroll() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const feed = viewport.current; if (restored && feed && feed.clientHeight) activate(Math.round(feed.scrollTop / feed.clientHeight));
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
  return <main className="feed-page" aria-busy={!session.ready || !restored}><div className="feed-shell">
    <header className="feed-hud">
      <div className="hud-top"><div className="hud-progress-summary"><span aria-hidden="true">{preview ? t('previewMode') : `${answered} / ${trip.cards.length}`}</span><div className={`sync-status ${pending || saving || !session.online ? 'pending' : ''}`} role="status" title={status}><span className="status-dot" aria-hidden="true" /><span className="sr-only">{status}</span></div></div><div className="hud-actions">{mode==='cards' && <button className="detail-button" aria-label={t('details')} onClick={()=>{resetDrag();setDetails(trip.cards[index].id);}}><Icon name="info" size={20}/></button>}<button className="feed-options-button" aria-label={t('tripOptions')} onClick={() => { resetDrag(); setOptions(true); }}><Icon name="more" /></button></div></div>
      <div className="feed-progress" role="progressbar" aria-label={t('progressLabel')} aria-valuemin={0} aria-valuemax={trip.cards.length} aria-valuenow={answered}><span style={{ width: `${answered / trip.cards.length * 100}%` }} /></div>
    </header>
    <div className="feed-alerts">{localized.loading && <Notice>{t('loadingTranslation')}</Notice>}{localized.fallback && <Notice>{t('translationFallback')}</Notice>}{session.error && <Notice kind="error">{session.error}<button className="inline-button" onClick={()=>{session.retryNow();activity.retryNow();}}>{t('reconnect')}</button></Notice>}{activity.error && <Notice kind="error">{activity.error}<button className="inline-button" onClick={activity.retryNow}>{t('reconnect')}</button></Notice>}{activity.storageError && <Notice kind="error">{activity.storageError}</Notice>}{session.storageError && <Notice kind="error">{session.storageError}</Notice>}{session.conflict && <Notice kind="error"><strong>{t('conflictTitle')}</strong><p>{t('conflictCurrent',{title:trip.cards.find(card => card.id === session.conflict?.cardId)?.title ?? '',choice:session.conflict.remote ? choiceLabel(session.conflict.remote.choice) : t('unanswered')})}</p><div className="conflict-actions"><button onClick={() => session.resolveConflict(false,localized.displayLocale)}>{t('useSaved')}</button><button onClick={() => session.resolveConflict(true,localized.displayLocale)}>{t('keepLocal')}</button></div></Notice>}</div>
    {mode === 'cards' ? <div className="feed-viewport" ref={viewport} onScroll={onScroll} aria-label={t('feedLabel')}>
      {trip.cards.map((card, cardIndex) => {
        const active = cardIndex === index;
        const textOnly = !card.image && !card.video;
        const currentDrag = drag?.index === cardIndex && drag.axis === 'horizontal' ? drag.x : 0;
        const intent = currentDrag > 0 ? 'interested' : currentDrag < 0 ? 'not_interested' : '';
        const width = viewport.current?.clientWidth ?? window.innerWidth;
        return <section className="feed-pane" key={card.id} aria-hidden={!active} inert={!active}>
          <article className={`experience-card ${textOnly ? 'text-only' : ''} ${currentDrag ? 'is-dragging' : ''}`} data-active={active} data-card-id={card.id} data-drag-intent={intent || undefined} style={{ transform: currentDrag ? `translateX(${currentDrag * .8}px) rotate(${currentDrag / width * GESTURE.rotation}deg)` : undefined }}
            onPointerDown={event => pointerStart(event, cardIndex)} onPointerMove={event => { if (event.pointerType !== 'touch') move(event.clientX, event.clientY); }} onPointerUp={event => { if (event.pointerType !== 'touch') finish(event.clientX, event.clientY); }} onPointerCancel={resetDrag}
            onTouchStart={event => touchStart(event, cardIndex)} onTouchMove={event => { const point = event.changedTouches[0]; if (point) move(point.clientX, point.clientY); }} onTouchEnd={event => { const point = event.changedTouches[0]; if (point) finish(point.clientX, point.clientY); }} onTouchCancel={resetDrag}>
            <Media card={card} active={active && restored && session.ready && !details && !options} adjacent={Math.abs(cardIndex - index) <= 1} />{!textOnly && card.video?.kind!=='embed' && <div className="feed-scrim" />}
            {intent && <>{card.video?.kind!=='embed' && <div className={`gesture-wash ${intent}`} style={{ opacity: Math.min(.5, Math.abs(currentDrag) / width) }} />}<div className={`gesture-stamp ${intent}`} style={{ opacity: Math.min(1, Math.abs(currentDrag) / GESTURE.minCommit) }}>{choiceLabel(intent)}</div></>}
            <div className="feed-copy"><h1>{card.title}</h1>{textOnly && <p className="text-description">{card.description}</p>}</div>
          </article>
        </section>;
      })}
    </div> : mode === 'review' ? <section className="feed-panel review-panel"><h1>{t('myChoices')}</h1><p>{t('reviewIntro')}</p><div className="review-list">{trip.cards.map((card, cardIndex) => <button key={card.id} className="review-row" onClick={() => navigate(cardIndex)}><div className="review-thumb"><Image card={card} /></div><div><small>{card.category}</small><strong>{card.title}</strong></div><span className={`review-choice ${session.answers[card.id] ?? 'unanswered'}`}>{session.answers[card.id] ? choiceLabel(session.answers[card.id]) : t('unanswered')}</span><Icon name="arrow" size={18} /></button>)}</div></section> : <section className="feed-panel completion-panel"><div className="completion-mark"><Icon name="check" size={40} /></div><h1>{t(!preview && answered === trip.cards.length ? 'allDone' : 'seenAll')}</h1><p>{answered === trip.cards.length ? t('doneIntro') : t('incompleteIntro',{count:trip.cards.length - answered})}</p><Notice>{preview ? t('previewNotice') : pending ? t('pendingClose',{count:pending}) : t(saving ? 'saving' : 'choicesSaved')}</Notice><button className="primary-button" onClick={() => setMode('review')}>{t('checkChoices')}<Icon name="arrow" /></button><button className="text-button" onClick={() => navigate(firstUnanswered < 0 ? 0 : firstUnanswered)}>{t('backToCards')}</button></section>}
    {details && <Details card={trip.cards.find(card => card.id === details)!} close={() => setDetails(null)} />}
    {options && <Dialog className="options-dialog" label={t('tripOptions')} close={() => setOptions(false)}>
      <div className="dialog-header"><span>{t('tripOptions')}</span><button className="icon-button" aria-label={t('closeOptions')} onClick={() => setOptions(false)}><Icon name="close" /></button></div>
      {mode==='cards' && <ChoiceButtons selected={session.answers[trip.cards[index].id]} disabled={!canChoose} choose={choice=>choose(choice)}/>}
      <h2>{trip.title}</h2><p className="options-trip-date">{dateRange(trip,locale)}</p>
      <div className="options-summary"><span>{session.participant?.name ?? t(preview ? 'previewWelcome' : 'readingInvite')}</span><span>{t('answeredCount',{answered,total:trip.cards.length})}</span><small>{status}</small></div>
      <div className="options-language"><span>{t('language')}</span><LanguageToggle /></div>
      <button className="options-action" onClick={() => { setOptions(false); setMode(mode === 'review' ? 'cards' : 'review'); }}>{t(mode === 'review' ? 'backToCards' : 'reviewChoices')}<Icon name="arrow" size={18}/></button>
      {mode === 'cards' && <div className="options-navigation"><button disabled={index === 0} onClick={() => { setOptions(false); navigate(index - 1); }}><span className="reverse"><Icon name="arrow" size={18}/></span>{t('previous')}</button><button disabled={index === trip.cards.length - 1} onClick={() => { setOptions(false); navigate(index + 1); }}>{t('next')}<Icon name="arrow" size={18}/></button></div>}
      <p className="options-hint">{t('gestureHint')}</p>
      {preview && <p className="quiet">{t('previewNotice')} <a className="text-link" href={`#/manage/${encodeURIComponent(trip.id)}`}>{t('createInvite')}</a></p>}
      <a className="options-home" href="#/">{t('backToTrips')}</a>
    </Dialog>}
  </div></main>;
}
