import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Trip, TripSummary, TripCard } from '../shared/types';
import { preferredPhotoUrl } from './media';
import type { Locale } from '../shared/localization';
import { useI18n } from './i18n';

export function dateRange(trip: Trip | TripSummary, locale: Locale = 'zh-Hant') {
  const start = new Date(`${trip.startsOn}T12:00:00`), end = new Date(`${trip.endsOn}T12:00:00`);
  if (locale === 'en') {
    const monthDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
    const ending = trip.startsOn.slice(0,7) === trip.endsOn.slice(0,7) ? String(end.getDate()) : monthDay.format(end);
    return `${monthDay.format(start)}–${ending}, ${end.getFullYear()}`;
  }
  const format = new Intl.DateTimeFormat('zh-TW', {month:'numeric',day:'numeric'});
  return `${trip.startsOn.slice(0,4)} / ${format.format(start)} — ${format.format(end)}`;
}
export function manageHref(id?: string) { return `#/manage${id ? `/${encodeURIComponent(id)}` : ''}`; }
export function tripHref(id: string, token?: string) { return `#/trip/${encodeURIComponent(id)}${token ? `?invite=${encodeURIComponent(token)}` : ''}`; }
export function invitationUrl(id: string, token: string) { const url = new URL(window.location.href); url.hash = tripHref(id, token).slice(1); return url.href; }
export function Icon({ name, size = 24 }: { name: 'arrow' | 'check' | 'close' | 'heart' | 'more' | 'leaf' | 'copy' | 'info' | 'play' | 'pause' | 'volume' | 'muted'; size?: number }) {
  const paths = { arrow: 'M5 12h14M13 6l6 6-6 6', check: 'M5 12l4 4L19 6', close: 'M6 6l12 12M6 18L18 6', heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', more: 'M5 12h.01M12 12h.01M19 12h.01', leaf: 'M20 4C9 3 3 8 5 15c2 6 14 5 15-11ZM5 20l9-10', copy: 'M9 9h11v11H9zM15 9V4H4v11h5', info: 'M12 11v6M12 7h.01', play:'M8 5l11 7-11 7Z', pause:'M8 5v14M16 5v14', volume:'M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14', muted:'M11 5 6 9H3v6h3l5 4ZM16 9l5 6M21 9l-5 6' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'info' && <circle cx="12" cy="12" r="9" />}<path d={paths[name]} /></svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) { const {t} = useI18n(); return <a className="brand" href="#/" aria-label={t('brandHome')}><span className="brand-mark"><Icon name="leaf" /></span><span>{t('brand')}{!compact && <small>{t('brandTagline')}</small>}</span></a>; }
export function Image({ card, cover, load = true }: { card?: TripCard; cover?: string; load?: boolean }) {
  const {t} = useI18n();
  const [failures, setFailures] = useState(0); const source = card?.image?.url ?? cover ?? card?.video?.poster;
  const preferred = source ? preferredPhotoUrl(source) : undefined;
  const url = failures ? source : preferred;
  const exhausted = failures >= (preferred === source ? 1 : 2);
  useEffect(() => setFailures(0), [source]);
  if (!load || !url) return <div className="media-placeholder" aria-hidden="true" />;
  return url && !exhausted ? <img draggable={false} loading="lazy" decoding="async" className="experience-image" src={url} alt={card?.image?.alt ?? t('scenery')} onError={() => setFailures(value => value + 1)} /> : <div className="image-fallback" role="img" aria-label={t('imageUnavailable')}><span>{t('imageUnavailable')}</span></div>;
}
export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' }) { return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>; }
/** Native dialogs trap focus, support Escape, and return focus to the opener. */
export function Dialog({ children, className, label, close }: { children:ReactNode; className:string; label:string; close:()=>void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={dialogRef} className={className} aria-label={label} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>{children}</dialog>;
}
export function Details({ card, close }: { card: TripCard; close: () => void }) {
  const {t} = useI18n();
  return <Dialog className="details-dialog" label={t('details')} close={close}><div className="dialog-header"><span>{t('learnMore')}</span><button className="icon-button" onClick={close} aria-label={t('closeDetails')}><Icon name="close" /></button></div><h2>{card.title}</h2><p>{card.description}</p><dl className="facts"><div><dt>{t('duration')}</dt><dd>{card.facts.duration}</dd></div><div><dt>{t('cost')}</dt><dd>{card.facts.cost}</dd></div><div><dt>{t('mobility')}</dt><dd>{card.facts.mobility}</dd></div>{card.facts.seasonalNote && <div><dt>{t('seasonal')}</dt><dd>{card.facts.seasonalNote}</dd></div>}</dl>{card.video && (card.video.kind === 'file' ? <video className="detail-video" src={card.video.url} poster={card.video.poster} controls playsInline /> : <a className="text-link" href={card.video.sourceUrl??card.video.url} target="_blank" rel="noreferrer">{t('relatedVideo')}</a>)}<div className="sources">{card.video?.credit && <><span>{t('videoCredit',{credit:card.video.credit})}</span><a href={card.video.sourceUrl??card.video.url} target="_blank" rel="noreferrer">{t('videoSource')}</a></>}<a href={card.source.url} target="_blank" rel="noreferrer">{t('source',{title:card.source.title})}<Icon name="arrow" size={16} /></a><span>{t('checkedAt',{date:card.source.checkedAt})}</span>{card.image && <><span>{t('photoCredit',{credit:card.image.credit})}</span><a href={card.image.sourceUrl} target="_blank" rel="noreferrer">{t('photoSource')}</a></>}</div></Dialog>;
}
