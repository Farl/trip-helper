import { useEffect, useState } from 'react';
import type { Trip, TripSummary, TripStats, InviteResponse } from '../shared/types';
import { ApiError, assetUrl, createInvite, exportTrip, getSession, getStats, revokeInvite } from './api';
import { readCachedTrip } from './useAnswers';
import { Brand, Icon, Image, Notice, dateRange, tripHref, invitationUrl } from './ui';
import Feed from './Feed';

function Home({ trips, error }: { trips: TripSummary[]; error: string }) {
  return <div className="home-page"><header className="site-header"><Brand /><span className="header-note">家人與朋友的旅行提案</span></header><main><div className="home-intro"><div><p className="kicker">把每個人的喜歡，放進旅程。</p><h1>下一站，<br />一起去。</h1></div><p>散步、吃點好吃的，或一起看一場夜景。<br />先看看旅行靈感，讓我們知道你想參與什麼。</p></div>{error && <Notice kind="error">{error}</Notice>}<div className="trip-grid">{trips.map(trip => <a className="trip-tile" key={trip.id} href={tripHref(trip.id)}><div className="trip-cover"><Image cover={trip.cover} /><span className="destination-label">{trip.destination}</span></div><div className="trip-tile-info"><div><p>{dateRange(trip)}</p><h2>{trip.title}</h2><span>{trip.cardCount} 個旅行靈感</span></div><span className="round-arrow"><Icon name="arrow" /></span></div></a>)}</div>{!trips.length && !error && <p className="loading">正在載入旅程…</p>}</main><footer>每個選擇都是參考，最後行程一起討論。</footer></div>;
}
function Manage({ trip }: { trip: Trip }) {
  const storageKey = `trip-helper:admin:${trip.id}`;
  const [key, setKey] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  const [stats, setStats] = useState<TripStats | null>(null);
  const [name, setName] = useState('');
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  async function refresh() { setBusy(true); setError(''); try { const result = await getStats(trip.id, key); sessionStorage.setItem(storageKey, key); setStats(result); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function makeInvite(event: React.FormEvent) { event.preventDefault(); if (!name.trim()) return; setBusy(true); setError(''); try { setInvite(await createInvite(trip.id, key, name.trim())); setName(''); setCopied(false); setStats(await getStats(trip.id, key)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function copyLink() { if (!invite) return; try { await navigator.clipboard.writeText(invitationUrl(trip.id, invite.token)); setCopied(true); } catch { setError('無法自動複製，請選取下方連結後手動複製。'); } }
  async function revoke(participantId: string, participantName: string) { if (!window.confirm(`停用「${participantName}」的邀請？既有答案會保留。`)) return; setBusy(true); try { await revokeInvite(trip.id, key, participantId); setStats(await getStats(trip.id, key)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  return <div className="manage-page"><header className="site-header"><Brand /><a className="text-link" href={tripHref(trip.id)}>預覽旅程</a></header><main><p className="trip-destination">旅程管理</p><h1>{trip.title}</h1><p className="manage-intro">邀請每位家人或朋友，收集他們對每個體驗的興趣。</p><form className="admin-form" onSubmit={event => { event.preventDefault(); void refresh(); }}><label htmlFor="admin-key">管理金鑰</label><div className="input-action"><input id="admin-key" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder="輸入伺服器提供的管理金鑰" autoComplete="off" required /><button className="primary-button" disabled={busy}>載入管理資料</button></div><p className="quiet">金鑰只保留在目前的瀏覽器工作階段。請勿分享給參與者。</p></form>{error && <Notice kind="error">{error}</Notice>}{stats && <><section className="management-section"><h2>建立個人邀請</h2><form className="input-action" onSubmit={makeInvite}><input aria-label="參與者姓名" placeholder="家人或朋友的名字" value={name} onChange={event => setName(event.target.value)} required maxLength={80} /><button className="primary-button" disabled={busy}>建立邀請</button></form>{invite && <div className="invite-result"><strong>{invite.participant.name} 的專屬邀請</strong><p className="quiet">這份連結可以修改這位參與者的答案，請只傳給本人。</p><input readOnly aria-label="邀請連結" value={invitationUrl(trip.id, invite.token)} onFocus={event => event.target.select()} /><div className="invite-actions"><button className="secondary-button" onClick={copyLink}><Icon name="copy" size={18} />{copied ? '已複製連結' : '複製邀請連結'}</button>{typeof navigator.share === 'function' && <button className="secondary-button" onClick={() => { void navigator.share({ title: trip.title, text: `${invite.participant.name}，一起選出你感興趣的旅行體驗`, url: invitationUrl(trip.id, invite.token) }).catch(() => {}); }}>分享邀請</button>}<a className="text-link" href={tripHref(trip.id, invite.token)}>開啟邀請</a></div></div>}</section><section className="management-section"><div className="section-heading"><h2>參與者進度</h2><button className="text-button" onClick={refresh} disabled={busy}>重新整理</button></div>{!stats.participants.length ? <p className="quiet">還沒有參與者。先建立一份邀請。</p> : <div className="participant-list">{stats.participants.map(participant => <div className="participant-row" key={participant.id}><div><strong>{participant.name}</strong><small>{participant.revoked ? '邀請已停用' : `${participant.answered} / ${participant.total} 已回答`}</small></div><div className="progress-track"><span style={{ width: `${participant.total ? participant.answered / participant.total * 100 : 0}%` }} /></div><button className="text-button" disabled={busy || participant.revoked} onClick={() => revoke(participant.id, participant.name)}>停用邀請</button></div>)}</div>}</section><section className="management-section"><div className="section-heading"><h2>每個體驗的興趣</h2><button className="secondary-button" disabled={busy} onClick={() => { void exportTrip(trip.id, key).catch(reason => setError(reason.message)); }}>匯出 JSON</button></div><div className="stats-table-wrap"><table><thead><tr><th>旅行體驗</th><th>有興趣</th><th>沒興趣</th><th>未回答</th></tr></thead><tbody>{trip.cards.map(card => { const counts = stats.cards.find(item => item.cardId === card.id); return <tr key={card.id}><th>{card.title}<small>{card.category}</small></th><td className="interested-count">{counts?.interested ?? 0}</td><td>{counts?.notInterested ?? 0}</td><td>{counts?.unanswered ?? 0}</td></tr>; })}</tbody></table></div></section></>}</main></div>;
}
function parseRoute() { const [path, query = ''] = window.location.hash.slice(1).split('?'); const parts = path.split('/').filter(Boolean); return { page: parts[0] ?? '', id: parts[1] ? decodeURIComponent(parts[1]) : '', token: new URLSearchParams(query).get('invite') ?? '' }; }
export default function App() {
  const [route, setRoute] = useState(parseRoute); const [trips, setTrips] = useState<TripSummary[]>([]); const [trip, setTrip] = useState<Trip | null>(null); const [error, setError] = useState(''); const [catalogError, setCatalogError] = useState('');
  useEffect(() => { const change = () => { setRoute(parseRoute()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => { let alive = true; fetch(assetUrl('trips/index.json')).then(response => { if (!response.ok) throw new Error('無法載入旅程清單'); return response.json(); }).then(data => { if (alive) setTrips(data.trips); }).catch(reason => { if (alive) setCatalogError(reason.message); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    setTrip(null); setError(''); if (!route.id) return; let alive = true;
    const loadStatic = async (): Promise<Trip> => {
      const response = await fetch(assetUrl(`trips/${encodeURIComponent(route.id)}.json`));
      if (!response.ok) throw new Error('找不到這趟旅程，請確認連結是否完整。');
      return response.json();
    };
    const loadTrip = async (): Promise<Trip> => {
      if (route.page !== 'trip' || !route.token) return loadStatic();
      try {
        const session = await getSession(route.token);
        if (session.participant.tripId !== route.id || (session.trip && session.trip.id !== route.id)) throw new Error('這份邀請屬於其他旅程，請使用原本的邀請連結。');
        if (session.participant.revoked) throw new Error('這份邀請已停用，請向旅程管理者索取新連結。');
        // Invitation packs outlive the public catalog. Only older sessions without a snapshot need static JSON.
        return session.trip ?? await loadStatic();
      } catch (reason) {
        if (reason instanceof TypeError || (reason instanceof ApiError && reason.status >= 500)) {
          const cached = readCachedTrip(route.id, route.token); if (cached) return cached;
        }
        throw reason;
      }
    };
    loadTrip().then(data => { if (alive) setTrip(data); }).catch(reason => { if (alive) setError(reason.message || '無法載入旅程，請確認網路連線。'); });
    return () => { alive = false; };
  }, [route.id, route.token, route.page]);
  if (!route.id) return <Home trips={trips} error={catalogError} />;
  if (error || !trip) return <div className="empty-page"><Brand /><h1>{error || '正在準備旅行靈感…'}</h1>{error && <a className="text-link" href="#/">回到旅程清單</a>}</div>;
  if (route.page === 'manage') return <Manage key={trip.id} trip={trip} />;
  return <Feed key={`${trip.id}:${route.token}`} trip={trip} token={route.token} />;
}
