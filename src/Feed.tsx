import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type TouchEvent } from 'react';
import type { Choice, Trip, TripCard } from '../shared/types';
import { useAnswers } from './useAnswers';
import { CHOICE_LABELS, Details, Icon, Image, Notice, dateRange } from './ui';

const GESTURE = { axisThreshold: 8, axisRatio: 1.25, commitRatio: .18, minCommit: 55, maxCommit: 95, rotation: 7 };
type Drag = { startX: number; startY: number; x: number; index: number; axis: 'pending' | 'horizontal' | 'vertical' };
function isControl(target: EventTarget | null) { return target instanceof Element && Boolean(target.closest('button,a,input,video')); }
function Media({ card, active, adjacent }: { card: TripCard; active: boolean; adjacent: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [card.video?.url]);
  useEffect(() => { if (!active) video.current?.pause(); }, [active]);
  if (card.video?.kind === 'file' && adjacent && !failed) return <div className="feed-video-media"><video ref={video} className="feed-video" src={card.video.url} poster={card.video.poster ?? card.image?.url} playsInline preload={active ? 'metadata' : 'none'} aria-label={card.title} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} /><button className="feed-video-toggle" onClick={() => { if (video.current?.paused) void video.current.play().catch(() => setFailed(true)); else video.current?.pause(); }}>{playing ? '暫停影片' : '播放影片'}</button></div>;
  return <Image card={card} load={adjacent} />;
}
/** Vertical snapping changes the visible card; only explicit binary choices enter the outbox. */
export default function Feed({ trip: initialTrip, token }: { trip: Trip; token: string }) {
  const session = useAnswers(initialTrip, token);
  const trip = session.trip ?? initialTrip;
  const [index, setIndex] = useState(() => Math.min(session.position, Math.max(0, trip.cards.length - 1)));
  const indexRef = useRef(index);
  const [mode, setMode] = useState<'cards' | 'review' | 'complete'>('cards');
  const [details, setDetails] = useState<TripCard | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const preview = !token;
  const canVote = !preview && session.ready && !session.blocked && !session.conflict && !details;
  const answered = trip.cards.filter(card => session.answers[card.id]).length;
  const status = preview ? '預覽模式' : session.blocked ? '無法儲存' : session.saving ? '正在儲存…' : session.pending ? `${session.pending} 筆待傳送` : !session.ready ? '正在確認邀請…' : !session.online ? '離線，選擇會保留在此裝置' : '已儲存';
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
    if (!card || !canVote || !session.choose(card.id, choice)) return;
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
  }, [mode, details, session.conflict, session.choose, canVote, preview]);
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
  if (!trip.cards.length) return <div className="empty-page"><h1>這趟旅程還沒有旅行靈感。</h1><a href="#/">回到旅程清單</a></div>;
  return <main className="feed-page"><div className="feed-shell">
    <header className="feed-hud">
      <div className="hud-top"><a className="feed-home" href="#/" aria-label="回到所有旅程"><span className="reverse"><Icon name="arrow" size={20} /></span></a><div className="hud-trip"><strong>{trip.destination}</strong><span>{dateRange(trip)}</span></div><button className="hud-review" onClick={() => { resetDrag(); setMode(mode === 'review' ? 'cards' : 'review'); }}>{mode === 'review' ? '回到卡片' : '查看選擇'}</button></div>
      <div className="hud-meta"><span className="hud-participant">{session.participant?.name ?? (preview ? '先看看旅行靈感' : '讀取邀請中')}</span><span>{answered} / {trip.cards.length} 已回答</span><div className={`sync-status ${session.pending ? 'pending' : ''}`} role="status"><span className="status-dot" />{status}</div></div>
      <div className="feed-progress" role="progressbar" aria-label="已回答進度" aria-valuemin={0} aria-valuemax={trip.cards.length} aria-valuenow={answered}><span style={{ width: `${answered / trip.cards.length * 100}%` }} /></div>
      {preview && <div className="feed-preview">預覽，不會儲存選擇<a href={`#/manage/${encodeURIComponent(trip.id)}`}>建立邀請</a></div>}
    </header>
    <div className="feed-alerts">{session.error && <Notice kind="error">{session.error}<button className="inline-button" onClick={session.retryNow}>重新連線</button></Notice>}{session.storageError && <Notice kind="error">{session.storageError}</Notice>}{session.conflict && <Notice kind="error"><strong>另一台裝置有新選擇</strong><p>「{trip.cards.find(card => card.id === session.conflict?.cardId)?.title}」目前已儲存：{session.conflict.remote ? CHOICE_LABELS[session.conflict.remote.choice] : '未回答'}。</p><div className="conflict-actions"><button onClick={() => session.resolveConflict(false)}>採用已儲存的選擇</button><button onClick={() => session.resolveConflict(true)}>保留這台裝置的選擇</button></div></Notice>}</div>
    {mode === 'cards' ? <div className="feed-viewport" ref={viewport} onScroll={onScroll} aria-label="旅行靈感，上下滑動換卡片">
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
            {intent && <><div className={`gesture-wash ${intent}`} style={{ opacity: Math.min(.5, Math.abs(currentDrag) / width) }} /><div className={`gesture-stamp ${intent}`} style={{ opacity: Math.min(1, Math.abs(currentDrag) / GESTURE.minCommit) }}>{CHOICE_LABELS[intent]}</div></>}
            <div className="feed-copy"><div className="feed-card-meta"><span>{card.category}</span><span>{cardIndex + 1} / {trip.cards.length}</span>{session.answers[card.id] && <span className={`feed-answer ${session.answers[card.id]}`}>{CHOICE_LABELS[session.answers[card.id]]}</span>}</div><h1>{card.title}</h1><p>{card.description}</p><button className="detail-button" onClick={() => setDetails(card)}>活動詳情與來源<Icon name="info" size={18} /></button>
              <div className="answer-controls"><button className={`answer-button no ${session.answers[card.id] === 'not_interested' ? 'selected' : ''}`} disabled={!active || !canVote} onClick={() => choose('not_interested', cardIndex)}><Icon name="close" /><span>沒興趣</span></button><button className={`answer-button yes ${session.answers[card.id] === 'interested' ? 'selected' : ''}`} disabled={!active || !canVote} onClick={() => choose('interested', cardIndex)}><Icon name="check" /><span>有興趣</span></button></div>
              <nav className="card-navigation" aria-label="切換卡片"><button disabled={cardIndex === 0} onClick={() => navigate(cardIndex - 1)}><span className="reverse"><Icon name="arrow" size={15} /></span>上一張</button><span>{preview ? '上下滑動看靈感' : '上下看 / 左沒興趣 右有興趣'}</span><button disabled={cardIndex === trip.cards.length - 1} onClick={() => navigate(cardIndex + 1)}>下一張<Icon name="arrow" size={15} /></button></nav>
            </div>
          </article>
        </section>;
      })}
    </div> : mode === 'review' ? <section className="feed-panel review-panel"><h1>我的選擇</h1><p>未回答的卡片保留空白。點一下，回到那個體驗。</p><div className="review-list">{trip.cards.map((card, cardIndex) => <button key={card.id} className="review-row" onClick={() => navigate(cardIndex)}><div className="review-thumb"><Image card={card} /></div><div><small>{card.category}</small><strong>{card.title}</strong></div><span className={`review-choice ${session.answers[card.id] ?? 'unanswered'}`}>{session.answers[card.id] ? CHOICE_LABELS[session.answers[card.id]] : '未回答'}</span><Icon name="arrow" size={18} /></button>)}</div></section> : <section className="feed-panel completion-panel"><div className="completion-mark"><Icon name="check" size={40} /></div><h1>{answered === trip.cards.length ? '你的喜歡，收到。' : '已看完這些旅行靈感。'}</h1><p>{answered === trip.cards.length ? '謝謝你一起想像這趟旅行。隨時回來看看，或修改你的選擇。' : `還有 ${trip.cards.length - answered} 張未回答。回到清單，挑出你想參與的體驗。`}</p><Notice>{session.pending ? `還有 ${session.pending} 筆待傳送，請等到「已儲存」再關閉頁面。` : session.saving ? '正在儲存你的選擇…' : '你的選擇已儲存。'}</Notice><button className="primary-button" onClick={() => setMode('review')}>檢查我的選擇<Icon name="arrow" /></button><button className="text-button" onClick={() => navigate(firstUnanswered < 0 ? 0 : firstUnanswered)}>回到卡片</button></section>}
    {details && <Details card={details} close={() => setDetails(null)} />}
  </div></main>;
}
