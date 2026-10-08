import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { imageIdentityUrl } from '../shared/mediaIdentity.js';
import type { CardImage, Trip, TripCard, TripSummary } from '../shared/types.js';
import { matchesTranslation, translationPath } from '../shared/localization.js';
import { translationSchema, tripSchema } from '../server/content.js';

interface Plan {
  id: string; placeId?: string; name: string; catalogRequired?: boolean; title: string; description: string; category: string;
  tags: string[]; duration: string; cost: string; mobility: string; seasonalNote?: string; textOnly?: boolean;
  textOnlyReason?: string;
  source: TripCard['source'];
  image?: CardImage; video?: TripCard['video']; mediaIdentity?: string; mediaReview: string;
  supportingSources?: { url: string; title: string; checkedAt: string; creator?: string; publishedOn?: string }[];
}
interface Config {
  apiUrl: string; fallbackUrl: string; datasetUrl: string; outputDirectory: string;
  credit: string; timeZone: string; trip: Omit<Trip, 'cards' | 'version'>; plans: Plan[];
}
interface Attraction {
  id: string; name: string; updatedAt: string; images: { url: string; caption: string }[];
}
const args = process.argv.slice(2);
function option(name: string): string | undefined { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const config = JSON.parse(await readFile(resolve(option('--config') ?? 'public/trips/sources/taipei-config.json'), 'utf8')) as Config;
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const datePart = (type: string) => dateParts.find(part => part.type === type)?.value;
// This is the catalog fetch/inspection date, not a new review of every external article, menu or venue page.
const datasetCheckedAt = option('--checked-at') ?? `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
const decode = (body: string): any => JSON.parse(body.replace(/^\uFEFF/, ''));

/** Keep only identity and image provenance; do not republish the source's full prose. */
function normalizeBulk(body: string): Attraction[] {
  return decode(body).Attractions.filter((a: any) => a.PostalAddress?.City === config.trip.destination)
    .map((a: any) => ({ id: a.AttractionID, name: a.AttractionName, updatedAt: a.UpdateTime,
      images: a.Images.map((i: any) => ({ url: i.URL, caption: [i.Name, i.Description].filter(Boolean).join('；') })) }));
}
async function request(url: string, accept = 'application/json'): Promise<Response> {
  const response = await fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}
async function collect(): Promise<{ records: Attraction[]; fetchedFrom: string }> {
  const input = option('--input');
  if (input) return { records: normalizeBulk(await readFile(resolve(input), 'utf8')), fetchedFrom: config.fallbackUrl };
  try {
    const first = decode(await (await request(`${config.apiUrl}?page=1`)).text());
    if (!Array.isArray(first.data) || !Number.isFinite(first.total)) throw new Error('Expected Taipei API JSON');
    const records = [...first.data];
    if (records.length === 0 && first.total > 0) throw new Error('Empty API page');
    const pageCount = records.length ? Math.ceil(first.total / records.length) : 1;
    for (let page = 2; page <= pageCount; page++) records.push(...decode(await (await request(`${config.apiUrl}?page=${page}`)).text()).data);
    return { fetchedFrom: config.apiUrl, records: records.map((a: any) => ({ id: `taipei-api-${a.id}`, name: a.name,
      updatedAt: a.modified, images: a.images.map((i: any) => ({ url: i.src, caption: i.subject ?? '' })) })) };
  } catch (error) {
    console.warn(`Taipei API unavailable; using the configured official daily dataset: ${String(error)}`);
    const directory = await mkdtemp(join(tmpdir(), 'trip-research-'));
    try {
      const archive = join(directory, 'attractions.zip');
      // The archive host negotiates on Accept; a JSON header can yield an HTML response with status 200.
      const bytes = new Uint8Array(await (await request(config.fallbackUrl, '*/*')).arrayBuffer());
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Official archive endpoint did not return a ZIP; preserve the current pack and verify the source.');
      await writeFile(archive, bytes);
      const body = execFileSync('unzip', ['-p', archive, 'AttractionList.json'], { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
      return { records: normalizeBulk(body), fetchedFrom: config.fallbackUrl };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
const { records, fetchedFrom } = await collect();
const selected: Attraction[] = [];
const mediaIdentities = new Set<string>();
const mediaUrls = new Set<string>();
const cards: TripCard[] = config.plans.map(plan => {
  const attraction = records.find(a => a.name === plan.name || a.name.replaceAll('_', '／') === plan.name.replaceAll('_', '／'));
  if (!attraction && plan.catalogRequired !== false) throw new Error(`Missing official attraction: ${plan.name}; review source names before refreshing.`);
  if (attraction) selected.push(attraction);
  // Official venue/shop sources may establish a concrete experience without being listed in a tourism catalog.
  if (plan.catalogRequired === false && !plan.placeId) throw new Error(`Independent source needs a stable place ID: ${plan.id}`);
  // Selection is editorial and per experience. A refreshed catalog must never restore an unrelated first venue photo.
  if (!plan.source || !plan.cost || !plan.mediaReview) throw new Error(`Missing reviewed source, cost or media decision: ${plan.id}`);
  if (Boolean(plan.textOnly) === Boolean(plan.image || plan.video)) throw new Error(`Choose reviewed visual media OR purposeful text-only: ${plan.id}`);
  if (plan.video && (!plan.video.credit || !plan.video.sourceUrl || !plan.mediaIdentity)) throw new Error(`Video needs reviewed source, credit and media identity: ${plan.id}`);
  // Text is an editorial format, never an automatic missing-photo fallback. The rationale is audited,
  // rather than shown to travelers; a reviewer still judges whether the proposal is decision-worthy.
  if (plan.textOnly && !plan.textOnlyReason?.trim()) throw new Error(`Missing positive text-only editorial reason: ${plan.id}`);
  if (plan.image) {
    if (!plan.mediaIdentity) throw new Error(`Missing underlying photo identity: ${plan.id}`);
    const normalizedUrl = imageIdentityUrl(plan.image.url);
    if (mediaIdentities.has(plan.mediaIdentity) || mediaUrls.has(normalizedUrl)) console.warn(`Repeated underlying photograph: ${plan.id}. Retained as an independent response opportunity; review: ${plan.mediaReview}`);
    mediaIdentities.add(plan.mediaIdentity); mediaUrls.add(normalizedUrl);
  }
  return { id: plan.id, placeId: plan.placeId ?? `taipei-${createHash('sha256').update(plan.name).digest('hex').slice(0, 12)}`,
    title: plan.title, description: plan.description, category: plan.category, tags: plan.tags,
    ...(plan.image ? { image: { ...plan.image } } : {}),
    ...(plan.video ? { video: { ...plan.video } } : {}),
    source: { ...plan.source },
    facts: { duration: `規劃估計 ${plan.duration}`, cost: plan.cost, mobility: plan.mobility,
      ...(plan.seasonalNote ? { seasonalNote: plan.seasonalNote } : {}) } };
});
// The version follows card meaning/content, not a fetch timestamp. Existing votes stay tied to their immutable version.
const fingerprint = cards.map(({ source, ...card }) => ({ ...card, source: { url: source.url, title: source.title } }));
const version = `sha256-${createHash('sha256').update(JSON.stringify({ trip: config.trip, cards: fingerprint })).digest('hex').slice(0, 16)}`;
// Reject absent or invalid manual source dates before writing either drafts or published content.
const trip: Trip = tripSchema.parse({ ...config.trip, version, cards });
const directory = resolve(config.outputDirectory);
const writeJson = async (path: string, value: unknown) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const draft = option('--draft');
if (draft) {
  await writeJson(resolve(draft), trip);
  console.log(`Drafted ${trip.id}: ${cards.length} cards, ${cards.filter(card => card.image).length} images, ${version}; published files preserved.`);
  process.exit(0);
}
/** A source refresh must not publish a version whose English presentation is missing or stale. */
async function englishReady(): Promise<boolean> {
  const filename = join(directory, translationPath(trip, 'en').replace(/^trips\//, ''));
  try {
    const translation = translationSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
    if (!matchesTranslation(trip, translation, 'en')) throw new Error('Identity or card coverage does not match the generated version');
    return true;
  } catch (error) {
    console.error(`Collected ${trip.id}/${version}, but did not publish. Create or repair the reviewed English pack at ${filename}. ${String(error)}`);
    console.error('The current canonical pack, registry, source manifest and all translations were preserved. Translate the same meaning and unresolved facts, then rerun the collector.');
    return false;
  }
}
if (!await englishReady()) process.exit(1);
await mkdir(join(directory, 'sources'), { recursive: true });
try {
  const previous = JSON.parse(await readFile(join(directory, `${trip.id}.json`), 'utf8')) as Trip;
  if (previous.version !== trip.version) await writeJson(join(directory, 'sources', 'archives', previous.id, `${previous.version}.json`), previous);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await writeJson(join(directory, `${trip.id}.json`), trip);
let registry: { trips: TripSummary[] };
try { registry = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')); } catch { registry = { trips: [] }; }
const summary: TripSummary = { id: trip.id, title: trip.title, destination: trip.destination, startsOn: trip.startsOn,
  endsOn: trip.endsOn, cardCount: cards.length, cover: cards.find(card => card.image)?.image?.url };
registry.trips = [...registry.trips.filter(item => item.id !== trip.id), summary];
await writeJson(join(directory, 'index.json'), registry);
await writeJson(join(directory, 'sources', `${trip.id}-manifest.json`), { checkedAt: datasetCheckedAt, fetchedFrom, datasetUrl: config.datasetUrl,
  licenseUrl: 'https://data.gov.tw/license', sourceNote: '逐卡明確選擇圖片或原始影片與目視核對；全文字須有可直接判斷興趣的正面編輯理由，不因素材不足補位。外部原圖URL附出處，不裁剪或冒用授權；原文未重製。',
  mediaDecisions: config.plans.map(plan => ({ cardId: plan.id, mode: plan.video ? 'video' : plan.image ? 'image' : 'text', mediaIdentity: plan.mediaIdentity,
    review: plan.mediaReview, textOnlyReason: plan.textOnlyReason, imageUrl: plan.image?.url, video: plan.video, catalogRequired: plan.catalogRequired, sourceUrl: plan.video?.sourceUrl ?? plan.image?.sourceUrl ?? plan.source.url })),
  corroboratingSources: [...new Map(config.plans.flatMap(plan => [plan.source, ...(plan.supportingSources ?? [])]).map(source => [source.url, source])).values()],
  records: [...new Map(selected.map(attraction => [attraction.id, attraction])).values()] });
console.log(`Wrote ${trip.id}: ${cards.length} cards, ${version}`);
