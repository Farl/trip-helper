import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '../shared/localization';
import type { ErrorCode } from '../shared/errors';
import type { Choice } from '../shared/types';
const LOCALE_KEY = 'trip-helper:locale';
const en = {
  tripOptions: 'Trip options', closeOptions: 'Close options', language: 'Language',
  languageSwitchLabel: '切換為正體中文', languageSwitchShort: '正體',
  appTitle: 'Together | Travel interests', brand: 'Together', brandTagline: 'Your interests shape the trip', brandHome: 'Together, back to home',
  familyPlans: 'Travel ideas for family and friends', homeKicker: 'Make room for everyone’s interests.', homeTitleFirst: 'Next stop,', homeTitleSecond: 'together.',
  homeIntro: 'A walk, something delicious, or a view after dark. Explore the ideas and tell us what you would enjoy.',
  ideasCount: '{count} travel ideas', loadingTrips: 'Loading trips…', homeFooter: 'Every choice helps. We’ll plan the final itinerary together.',
  loadingTrip: 'Preparing travel ideas…', backToTrips: 'Back to trips', tripNotFound: 'This trip could not be found. Please check the complete link.', catalogError: 'Could not load the trip list. Please try again.',
  wrongTrip: 'This invitation belongs to another trip. Please use the original invitation link.', inviteRevoked: 'This invitation has been disabled. Ask the organizer for a new link.',
  tripUnavailable: 'Could not load the trip. Please check your connection.', unknownError: 'Could not complete this request. Please try again.', networkError: 'Could not connect. Please check your connection and try again.',
  storageWarning: 'This browser cannot keep your data. Make sure every choice is saved before closing the page.', offlineQueue: 'Unable to connect. Your choices will stay on this device and send when the connection returns.', sendFailed: 'Unable to send right now. Your choices stay on this device and will retry automatically.',
  interested: 'Interested', notInterested: 'Not interested', unanswered: 'Unanswered', saved: 'Saved', saving: 'Saving…', pending: '{count} pending', previewMode: 'Preview', cannotSave: 'Unable to save', confirmingInvite: 'Checking invitation…', offlineStatus: 'Offline; choices stay on this device',
  reviewChoices: 'Review choices', backToCards: 'Back to cards', readingInvite: 'Loading invitation', previewWelcome: 'Explore the ideas', answeredCount: '{answered} / {total} answered', progressLabel: 'Answered progress', previewNotice: 'Preview; choices are not saved', createInvite: 'Create invitation',
  reconnect: 'Reconnect', conflictTitle: 'A newer choice exists on another device', conflictCurrent: '“{title}” is currently saved as: {choice}.', useSaved: 'Use the saved choice', keepLocal: 'Keep this device’s choice', feedLabel: 'Travel ideas; swipe vertically to browse',
  details: 'Details and sources', previous: 'Previous', next: 'Next', previewGesture: 'Swipe up to explore', gestureHint: 'Up: browse / Left: no / Right: yes',
  myChoices: 'My choices', reviewIntro: 'Unanswered cards remain blank. Select an idea to return to it.', allDone: 'Your interests are in.', seenAll: 'You’ve seen all the ideas.', doneIntro: 'Thanks for imagining this trip together. Return anytime to review or change your choices.', incompleteIntro: '{count} cards are unanswered. Return to the list and choose what you would enjoy.', pendingClose: '{count} choices are pending. Wait for “Saved” before closing the page.', choicesSaved: 'Your choices are saved.', checkChoices: 'Check my choices', emptyTrip: 'This trip has no travel ideas yet.',
  playVideo: 'Play video', pauseVideo: 'Pause video', scenery: 'Trip scenery', cityIllustration: 'Taipei city illustration', imageFallback: 'Leave a little room for imagination',
  learnMore: 'A closer look', closeDetails: 'Close details', duration: 'Time needed', cost: 'Estimated cost', mobility: 'Walking and access', seasonal: 'This season', relatedVideo: 'Watch a related video', source: 'Source: {title}', checkedAt: 'Checked: {date}', photoCredit: 'Photo: {credit}', photoSource: 'View image source',
  previewTrip: 'Preview trip', manageTitle: 'Trip organizer', manageIntro: 'Invite each family member or friend to share their interest in every experience.', adminKey: 'Organizer key', adminPlaceholder: 'Enter the organizer key provided by the server', loadAdmin: 'Load organizer data', adminPrivacy: 'The key stays in this browser session. Do not share it with participants.',
  createPersonal: 'Create a personal invitation', participantName: 'Participant name', namePlaceholder: 'Name of a family member or friend', personalInvite: 'Personal invitation for {name}', invitePrivacy: 'This link can change this person’s answers. Share it only with them.', inviteLink: 'Invitation link', copiedLink: 'Link copied', copyInvite: 'Copy invitation link', shareInvite: 'Share invitation', openInvite: 'Open invitation', shareText: '{name}, let’s choose the travel experiences you would enjoy.', copyFailed: 'Could not copy automatically. Select the link below and copy it manually.',
  participantProgress: 'Participant progress', refresh: 'Refresh', noParticipants: 'No participants yet. Create an invitation to get started.', inviteDisabled: 'Invitation disabled', revokeInvite: 'Disable invitation', revokeConfirm: 'Disable the invitation for “{name}”? Existing answers will remain.', experienceInterest: 'Interest in each experience', exportJson: 'Export JSON', experience: 'Travel experience',
  loadingTranslation: 'Loading English content…', translationFallback: 'English is unavailable for this trip version. Showing the original Traditional Chinese content.', genericTrip: 'Travel ideas',
} as const;
export type MessageKey = keyof typeof en;
type Dictionary = Record<MessageKey, string>;
const zh: Dictionary = {
  tripOptions:'旅程選項',closeOptions:'關閉選項',language:'語言',
  languageSwitchLabel:'Switch to English',languageSwitchShort:'EN',
  appTitle:'一起去 | 旅行興趣收集',brand:'一起去',brandTagline:'旅程，從你的喜歡開始',brandHome:'一起去，回首頁',
  familyPlans:'家人與朋友的旅行提案',homeKicker:'把每個人的喜歡，放進旅程。',homeTitleFirst:'下一站，',homeTitleSecond:'一起去。',homeIntro:'散步、吃點好吃的，或一起看一場夜景。先看看旅行靈感，讓我們知道你想參與什麼。',ideasCount:'{count} 個旅行靈感',loadingTrips:'正在載入旅程…',homeFooter:'每個選擇都是參考，最後行程一起討論。',loadingTrip:'正在準備旅行靈感…',backToTrips:'回到旅程清單',tripNotFound:'找不到這趟旅程，請確認連結是否完整。',catalogError:'無法載入旅程清單，請稍後再試。',wrongTrip:'這份邀請屬於其他旅程，請使用原本的邀請連結。',inviteRevoked:'這份邀請已停用，請向旅程管理者索取新連結。',tripUnavailable:'無法載入旅程，請確認網路連線。',unknownError:'無法完成這項操作，請稍後再試。',networkError:'無法連線，請確認網路後再試。',
  storageWarning:'瀏覽器無法保留資料。關閉頁面前，請確認全部已儲存。',offlineQueue:'暫時無法連線。你的選擇會保留在這台裝置，連線後再傳送。',sendFailed:'目前無法傳送。選擇已保留在這台裝置，稍後自動重試。',
  interested:'有興趣',notInterested:'沒興趣',unanswered:'未回答',saved:'已儲存',saving:'正在儲存…',pending:'{count} 筆待傳送',previewMode:'預覽模式',cannotSave:'無法儲存',confirmingInvite:'正在確認邀請…',offlineStatus:'離線，選擇會保留在此裝置',reviewChoices:'查看選擇',backToCards:'回到卡片',readingInvite:'讀取邀請中',previewWelcome:'先看看旅行靈感',answeredCount:'{answered} / {total} 已回答',progressLabel:'已回答進度',previewNotice:'預覽，不會儲存選擇',createInvite:'建立邀請',reconnect:'重新連線',conflictTitle:'另一台裝置有新選擇',conflictCurrent:'「{title}」目前已儲存：{choice}。',useSaved:'採用已儲存的選擇',keepLocal:'保留這台裝置的選擇',feedLabel:'旅行靈感，上下滑動換卡片',details:'活動詳情與來源',previous:'上一張',next:'下一張',previewGesture:'上下滑動看靈感',gestureHint:'上下看 / 左沒興趣 右有興趣',
  myChoices:'我的選擇',reviewIntro:'未回答的卡片保留空白。點一下，回到那個體驗。',allDone:'你的喜歡，收到。',seenAll:'已看完這些旅行靈感。',doneIntro:'謝謝你一起想像這趟旅行。隨時回來看看，或修改你的選擇。',incompleteIntro:'還有 {count} 張未回答。回到清單，挑出你想參與的體驗。',pendingClose:'還有 {count} 筆待傳送，請等到「已儲存」再關閉頁面。',choicesSaved:'你的選擇已儲存。',checkChoices:'檢查我的選擇',emptyTrip:'這趟旅程還沒有旅行靈感。',playVideo:'播放影片',pauseVideo:'暫停影片',scenery:'旅程風景',cityIllustration:'台北城市插畫',imageFallback:'留一點想像，給這趟旅行',
  learnMore:'多了解一點',closeDetails:'關閉詳情',duration:'預計時間',cost:'費用參考',mobility:'步行與移動',seasonal:'這個季節',relatedVideo:'觀看相關影片',source:'資料來源：{title}',checkedAt:'資料查核：{date}',photoCredit:'圖片：{credit}',photoSource:'查看圖片來源',
  previewTrip:'預覽旅程',manageTitle:'旅程管理',manageIntro:'邀請每位家人或朋友，收集他們對每個體驗的興趣。',adminKey:'管理金鑰',adminPlaceholder:'輸入伺服器提供的管理金鑰',loadAdmin:'載入管理資料',adminPrivacy:'金鑰只保留在目前的瀏覽器工作階段。請勿分享給參與者。',createPersonal:'建立個人邀請',participantName:'參與者姓名',namePlaceholder:'家人或朋友的名字',personalInvite:'{name} 的專屬邀請',invitePrivacy:'這份連結可以修改這位參與者的答案，請只傳給本人。',inviteLink:'邀請連結',copiedLink:'已複製連結',copyInvite:'複製邀請連結',shareInvite:'分享邀請',openInvite:'開啟邀請',shareText:'{name}，一起選出你感興趣的旅行體驗',copyFailed:'無法自動複製，請選取下方連結後手動複製。',participantProgress:'參與者進度',refresh:'重新整理',noParticipants:'還沒有參與者。先建立一份邀請。',inviteDisabled:'邀請已停用',revokeInvite:'停用邀請',revokeConfirm:'停用「{name}」的邀請？既有答案會保留。',experienceInterest:'每個體驗的興趣',exportJson:'匯出 JSON',experience:'旅行體驗',loadingTranslation:'正在載入英文內容…',translationFallback:'這個旅程版本尚無英文翻譯，暫時顯示原本的正體中文內容。',genericTrip:'旅行靈感',
};
const errorEn: Record<ErrorCode,string> = {
 AUTH_REQUIRED:'Authorization is required.',INVITE_INVALID:'This invitation is invalid. Ask the organizer for a valid link.',INVITE_REVOKED:'This invitation has been disabled. Ask the organizer for a new link.',TRIP_VERSION_CHANGED:'This invitation belongs to a different trip version.',OPERATION_REUSED:'This operation was already used for a different answer.',REVISION_CONFLICT:'A newer answer exists. Choose which answer to keep.',PACK_CHANGED:'This trip pack has changed. Reload your invitation.',CARD_NOT_FOUND:'This experience is not in the invitation pack.',PARTICIPANT_NOT_FOUND:'This participant could not be found.',TRIP_FORBIDDEN:'You do not have access to this trip.',TRIP_NOT_FOUND:'This trip could not be found.',PACK_TOO_LARGE:'This trip pack is too large. Please split it into smaller packs.',PACK_INVALID:'The trip pack is invalid.',ROUTE_INVALID:'This link is invalid.',ADMIN_INVALID:'The organizer key is invalid.',PACK_UNAVAILABLE:'This invitation pack is currently unavailable.',NAME_INVALID:'Enter a valid name (maximum {max} characters).',ANSWER_INVALID:'This answer is invalid. Reload the invitation and try again.',ORIGIN_FORBIDDEN:'This website is not allowed to connect to the server.',RATE_LIMITED:'Too many requests. Please wait and try again.',NOT_FOUND:'The requested item could not be found.',BODY_TOO_LARGE:'The request is too large.',BODY_INVALID:'The request format is invalid.',INTERNAL_ERROR:'The server is temporarily unavailable. Please try again.',
};
const errorZh: Record<ErrorCode,string> = {
 AUTH_REQUIRED:'請提供有效的授權資訊。',INVITE_INVALID:'邀請無法使用，請向旅程管理者索取有效連結。',INVITE_REVOKED:'這份邀請已停用，請向旅程管理者索取新連結。',TRIP_VERSION_CHANGED:'這份邀請屬於不同的旅程版本。',OPERATION_REUSED:'這筆操作已用於另一個選擇。',REVISION_CONFLICT:'另一台裝置有新選擇，請選擇要保留的答案。',PACK_CHANGED:'旅程內容已變更，請重新載入邀請。',CARD_NOT_FOUND:'這個體驗不在邀請的旅程內容中。',PARTICIPANT_NOT_FOUND:'找不到這位參與者。',TRIP_FORBIDDEN:'你無法存取這趟旅程。',TRIP_NOT_FOUND:'找不到這趟旅程。',PACK_TOO_LARGE:'旅程資料過大，請拆成較小的內容組。',PACK_INVALID:'旅程內容格式有誤。',ROUTE_INVALID:'這份連結格式有誤。',ADMIN_INVALID:'管理金鑰無效。',PACK_UNAVAILABLE:'目前無法取得這份邀請的旅程內容。',NAME_INVALID:'請輸入有效姓名，最多 {max} 個字。',ANSWER_INVALID:'選擇格式有誤，請重新載入邀請後再試。',ORIGIN_FORBIDDEN:'這個網站無法連線到伺服器。',RATE_LIMITED:'操作次數過多，請稍後再試。',NOT_FOUND:'找不到要求的資料。',BODY_TOO_LARGE:'傳送的資料過大。',BODY_INVALID:'傳送的資料格式有誤。',INTERNAL_ERROR:'伺服器暫時無法使用，請稍後再試。',
};
type Params = Record<string,string|number>;
export class UiError extends Error { constructor(public key: MessageKey, public params?: Params) { super(key); } }
function interpolate(message:string, params?:Params) { return message.replace(/\{(\w+)\}/g, (_,key:string) => String(params?.[key] ?? '')); }
function initialLocale(): Locale { try { const saved = localStorage.getItem(LOCALE_KEY); if (saved === 'en' || saved === 'zh-Hant') return saved; } catch { /* Language switching still works when persistence is unavailable. */ } return navigator.language.toLowerCase().startsWith('zh') ? 'zh-Hant' : 'en'; }
interface I18nValue { locale:Locale; setLocale:(locale:Locale)=>void; t:(key:MessageKey,params?:Params)=>string; errorMessage:(reason:unknown)=>string; choiceLabel:(choice:Choice)=>string }
const I18nContext = createContext<I18nValue | null>(null);
export function LocaleProvider({ children }: { children:ReactNode }) {
 const [locale,setCurrent] = useState<Locale>(initialLocale);
 const setLocale = useCallback((value:Locale) => { setCurrent(value); try { localStorage.setItem(LOCALE_KEY,value); } catch { /* Retain the preference for the current page. */ } },[]);
 const t = useCallback((key:MessageKey,params?:Params) => interpolate((locale === 'en' ? en : zh)[key],params),[locale]);
 const errorMessage = useCallback((reason:unknown) => {
  if (reason instanceof UiError) return t(reason.key,reason.params);
  if (reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string') {
   const messages = locale === 'en' ? errorEn : errorZh;
   if (reason.code in messages) return interpolate(messages[reason.code as ErrorCode], 'params' in reason ? reason.params as Params : undefined);
  }
  return t(reason instanceof TypeError ? 'networkError' : 'unknownError');
 },[locale,t]);
 useEffect(() => { document.documentElement.lang = locale; document.title = t('appTitle'); },[locale,t]);
 useEffect(() => { const changed = (event:StorageEvent) => { if (event.key === LOCALE_KEY && (event.newValue === 'en' || event.newValue === 'zh-Hant')) setCurrent(event.newValue); }; window.addEventListener('storage',changed); return () => window.removeEventListener('storage',changed); },[]);
 const value = useMemo(() => ({ locale,setLocale,t,errorMessage,choiceLabel:(choice:Choice) => t(choice === 'interested' ? 'interested' : 'notInterested') }),[locale,setLocale,t,errorMessage]);
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() { const value = useContext(I18nContext); if (!value) throw new Error('LocaleProvider is required'); return value; }
export function LanguageToggle() { const {locale,setLocale,t} = useI18n(); return <button className="language-toggle" aria-label={t('languageSwitchLabel')} onClick={() => setLocale(locale === 'zh-Hant' ? 'en' : 'zh-Hant')}>{t('languageSwitchShort')}</button>; }
