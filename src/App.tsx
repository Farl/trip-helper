import { useEffect, useState } from 'react';
import type { Trip, TripSummary, TripStats, InviteResponse } from '../shared/types';
import { ApiError, assetUrl, createInvite, exportTrip, getSession, getStats, revokeInvite } from './api';
import { readCachedTrip } from './useAnswers';
import { Brand, Icon, Image, Notice, dateRange, tripHref, manageHref, invitationUrl } from './ui';
import { LanguageToggle, UiError, useI18n } from './i18n';
import { useLocalizedTrip } from './localizedTrip';
import Feed from './Feed';

function TripTile({ summary,management=false }: { summary:TripSummary;management?:boolean }) {
  const {locale,t}=useI18n(); const [canonical,setCanonical]=useState<Trip|null>(null);
  useEffect(() => { let alive=true; fetch(assetUrl(`trips/${encodeURIComponent(summary.id)}.json`)).then(response => response.ok ? response.json() : null).then(value => {if(alive)setCanonical(value);}).catch(() => {}); return () => {alive=false;}; },[summary.id]);
  const localized=useLocalizedTrip(canonical);
  const translated=locale === 'zh-Hant' || localized.displayLocale === 'en';
  const title=translated ? localized.trip?.title ?? summary.title : t('genericTrip');
  const destination=translated ? localized.trip?.destination ?? summary.destination : t('genericTrip');
  return <a className="trip-tile" href={management ? manageHref(summary.id) : tripHref(summary.id)}><div className="trip-cover"><Image cover={summary.cover}/><span className="destination-label">{destination}</span></div><div className="trip-tile-info"><div><p>{dateRange(summary,locale)}</p><h2>{title}</h2><span>{management ? t('manageTrip') : t('ideasCount',{count:summary.cardCount})}</span></div><span className="round-arrow"><Icon name="arrow"/></span></div>{localized.loading && <p className="quiet">{t('loadingTranslation')}</p>}{localized.fallback && <Notice>{t('translationFallback')}</Notice>}</a>;
}
function Home({ trips,error,management=false }: { trips:TripSummary[];error:unknown;management?:boolean }) {
  const {t,errorMessage}=useI18n();
  return <div className="home-page"><header className="site-header"><Brand/><span className="header-note">{t('familyPlans')}</span><div className="header-actions"><a className="text-link" href={management ? "#/" : manageHref()}>{t(management ? 'backToTrips' : 'manageTitle')}</a><LanguageToggle/></div></header><main><div className="home-intro"><div><p className="kicker">{t(management ? 'manageHomeKicker' : 'homeKicker')}</p><h1>{management ? t('manageTitle') : <>{t('homeTitleFirst')}<br/>{t('homeTitleSecond')}</>}</h1></div><p>{t(management ? 'manageHomeIntro' : 'homeIntro')}</p></div>{Boolean(error) && <Notice kind="error">{errorMessage(error)}</Notice>}<div className="trip-grid">{trips.map(trip => <TripTile key={trip.id} summary={trip} management={management}/>)}</div>{!trips.length && !error && <p className="loading">{t('loadingTrips')}</p>}</main><footer>{t(management ? 'manageHomeFooter' : 'homeFooter')}</footer></div>;
}
function Manage({ trip:canonical }: { trip:Trip }) {
  const {t,errorMessage}=useI18n(); const localized=useLocalizedTrip(canonical); const trip=localized.trip ?? canonical;
  const storageKey=`trip-helper:admin:${trip.id}`;
  const [key,setKey]=useState(() => sessionStorage.getItem(storageKey) ?? '');
  const [stats,setStats]=useState<TripStats|null>(null); const [name,setName]=useState(''); const [invite,setInvite]=useState<InviteResponse|null>(null);
  const [error,setError]=useState<unknown>(null); const [busy,setBusy]=useState(false); const [copied,setCopied]=useState(false);
  async function refresh() { setBusy(true);setError(null);try{const result=await getStats(trip.id,key);sessionStorage.setItem(storageKey,key);setStats(result);}catch(reason){setError(reason);}finally{setBusy(false);} }
  async function makeInvite(event:React.FormEvent) { event.preventDefault();if(!name.trim())return;setBusy(true);setError(null);try{setInvite(await createInvite(trip.id,key,name.trim()));setName('');setCopied(false);setStats(await getStats(trip.id,key));}catch(reason){setError(reason);}finally{setBusy(false);} }
  async function copyLink() { if(!invite)return;try{await navigator.clipboard.writeText(invitationUrl(trip.id,invite.token));setCopied(true);}catch{setError(new UiError('copyFailed'));} }
  async function revoke(id:string,participantName:string) { if(!window.confirm(t('revokeConfirm',{name:participantName})))return;setBusy(true);try{await revokeInvite(trip.id,key,id);setStats(await getStats(trip.id,key));}catch(reason){setError(reason);}finally{setBusy(false);} }
  return <div className="manage-page"><header className="site-header"><Brand/><div className="header-actions"><a className="text-link" href={tripHref(trip.id)}>{t('previewTrip')}</a><LanguageToggle/></div></header><main><a className="text-link manage-back" href={manageHref()}>{t('backToManage')}</a><p className="trip-destination">{t('manageTitle')}</p><h1>{trip.title}</h1><p className="manage-intro">{t('manageIntro')}</p>{localized.loading && <Notice>{t('loadingTranslation')}</Notice>}{localized.fallback && <Notice>{t('translationFallback')}</Notice>}
    <form className="admin-form" onSubmit={event => {event.preventDefault();void refresh();}}><label htmlFor="admin-key">{t('adminKey')}</label><div className="input-action"><input id="admin-key" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder={t('adminPlaceholder')} autoComplete="off" required/><button className="primary-button" disabled={busy}>{t('loadAdmin')}</button></div><p className="quiet">{t('adminPrivacy')}</p></form>
    {Boolean(error) && <Notice kind="error">{errorMessage(error)}</Notice>}{stats && <><section className="management-section"><h2>{t('createPersonal')}</h2><form className="input-action" onSubmit={makeInvite}><input aria-label={t('participantName')} placeholder={t('namePlaceholder')} value={name} onChange={event => setName(event.target.value)} required maxLength={80}/><button className="primary-button" disabled={busy}>{t('createInvite')}</button></form>
      {invite && <div className="invite-result"><strong>{t('personalInvite',{name:invite.participant.name})}</strong><p className="quiet">{t('invitePrivacy')}</p><input readOnly aria-label={t('inviteLink')} value={invitationUrl(trip.id,invite.token)} onFocus={event => event.target.select()}/><div className="invite-actions"><button className="secondary-button" onClick={copyLink}><Icon name="copy" size={18}/>{t(copied ? 'copiedLink' : 'copyInvite')}</button>{typeof navigator.share === 'function' && <button className="secondary-button" onClick={() => {void navigator.share({title:trip.title,text:t('shareText',{name:invite.participant.name}),url:invitationUrl(trip.id,invite.token)}).catch(() => {});}}>{t('shareInvite')}</button>}<a className="text-link" href={tripHref(trip.id,invite.token)}>{t('openInvite')}</a></div></div>}
    </section><section className="management-section"><div className="section-heading"><h2>{t('participantProgress')}</h2><button className="text-button" onClick={refresh} disabled={busy}>{t('refresh')}</button></div>{!stats.participants.length ? <p className="quiet">{t('noParticipants')}</p> : <div className="participant-list">{stats.participants.map(participant => <div className="participant-row" key={participant.id}><div><strong>{participant.name}</strong><small>{participant.revoked ? t('inviteDisabled') : t('answeredCount',{answered:participant.answered,total:participant.total})}</small></div><div className="progress-track"><span style={{width:`${participant.total ? participant.answered / participant.total * 100 : 0}%`}}/></div><button className="text-button" disabled={busy || participant.revoked} onClick={() => revoke(participant.id,participant.name)}>{t('revokeInvite')}</button></div>)}</div>}</section>
    <section className="management-section"><div className="section-heading"><h2>{t('experienceInterest')}</h2><button className="secondary-button" disabled={busy} onClick={() => {void exportTrip(trip.id,key).catch(setError);}}>{t('exportJson')}</button></div><div className="stats-table-wrap"><table><thead><tr><th>{t('experience')}</th><th>{t('interested')}</th><th>{t('notInterested')}</th><th>{t('unanswered')}</th></tr></thead><tbody>{trip.cards.map(card => {const counts=stats.cards.find(item => item.cardId === card.id);return <tr key={card.id}><th>{card.title}<small>{card.category}</small></th><td className="interested-count">{counts?.interested ?? 0}</td><td>{counts?.notInterested ?? 0}</td><td>{counts?.unanswered ?? 0}</td></tr>;})}</tbody></table></div></section></>}
  </main></div>;
}
function parseRoute() { const [path,query='']=window.location.hash.slice(1).split('?');const parts=path.split('/').filter(Boolean);return {page:parts[0] ?? '',id:parts[1] ? decodeURIComponent(parts[1]) : '',token:new URLSearchParams(query).get('invite') ?? ''}; }
export default function App() {
  const {t,errorMessage}=useI18n(); const [route,setRoute]=useState(parseRoute);const [trips,setTrips]=useState<TripSummary[]>([]);const [trip,setTrip]=useState<Trip|null>(null);const [error,setError]=useState<unknown>(null);const [catalogError,setCatalogError]=useState<unknown>(null);
  useEffect(() => {const change=() => {setRoute(parseRoute());window.scrollTo(0,0);};window.addEventListener('hashchange',change);return () => window.removeEventListener('hashchange',change);},[]);
  useEffect(() => {let alive=true;fetch(assetUrl('trips/index.json')).then(response => {if(!response.ok)throw new UiError('catalogError');return response.json();}).then(data => {if(alive)setTrips(data.trips);}).catch(reason => {if(alive)setCatalogError(reason);});return () => {alive=false;};},[]);
  useEffect(() => {
    setTrip(null);setError(null);if(!route.id)return;let alive=true;
    const loadStatic=async():Promise<Trip> => {const response=await fetch(assetUrl(`trips/${encodeURIComponent(route.id)}.json`));if(!response.ok)throw new UiError('tripNotFound');return response.json();};
    const loadTrip=async():Promise<Trip> => {
      if(route.page !== 'trip' || !route.token)return loadStatic();
      try{
        const session=await getSession(route.token);
        if(session.participant.tripId !== route.id || (session.trip && session.trip.id !== route.id))throw new UiError('wrongTrip');
        if(session.participant.revoked)throw new UiError('inviteRevoked');
        // Invitation snapshots remain independent of the public catalog and display locale.
        return session.trip ?? await loadStatic();
      }catch(reason){if(reason instanceof TypeError || (reason instanceof ApiError && reason.status >= 500)){const cached=readCachedTrip(route.id,route.token);if(cached)return cached;}throw reason;}
    };
    loadTrip().then(data => {if(alive)setTrip(data);}).catch(reason => {if(alive)setError(reason);});return () => {alive=false;};
  },[route.id,route.token,route.page]);
  if(!route.id)return <Home trips={trips} error={catalogError} management={route.page === 'manage'}/>;
  if(error || !trip)return <div className="empty-page"><div className="header-actions"><Brand/><LanguageToggle/></div><h1>{error ? errorMessage(error) : t('loadingTrip')}</h1>{Boolean(error) && <a className="text-link" href="#/">{t('backToTrips')}</a>}</div>;
  if(route.page === 'manage')return <Manage key={trip.id} trip={trip}/>;
  return <Feed key={`${trip.id}:${route.token}`} trip={trip} token={route.token}/>;
}
