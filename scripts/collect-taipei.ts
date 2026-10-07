import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Trip, TripCard, TripSummary } from '../shared/types.js';
import { matchesTranslation, translationPath } from '../shared/localization.js';
import { translationSchema } from '../server/content.js';

interface Plan {
  id: string; name: string; title: string; description: string; category: string;
  tags: string[]; duration: string; mobility: string; seasonalNote?: string; textOnly?: boolean;
  source?: { url: string; title: string };
}
interface Config {
  apiUrl: string; fallbackUrl: string; datasetUrl: string; outputDirectory: string;
  credit: string; trip: Omit<Trip, 'cards' | 'version'>; plans: Plan[];
}
interface Attraction {
  id: string; name: string; updatedAt: string; images: { url: string; caption: string }[];
}
const args = process.argv.slice(2);
function option(name: string): string | undefined { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const config = JSON.parse(await readFile(resolve(option('--config') ?? 'public/trips/sources/taipei-config.json'), 'utf8')) as Config;
const checkedAt = option('--checked-at') ?? new Date().toISOString().slice(0, 10);
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
const cards: TripCard[] = config.plans.map(plan => {
  const attraction = records.find(a => a.name === plan.name || a.name.replaceAll('_', '／') === plan.name.replaceAll('_', '／'));
  if (!attraction) throw new Error(`Missing official attraction: ${plan.name}; review source names before refreshing.`);
  selected.push(attraction);
  const photograph = attraction.images[0];
  if (!plan.textOnly && !photograph) throw new Error(`Missing matching image: ${plan.name}`);
  return { id: plan.id, placeId: `taipei-${createHash('sha256').update(plan.name).digest('hex').slice(0, 12)}`,
    title: plan.title, description: plan.description, category: plan.category, tags: plan.tags,
    ...(!plan.textOnly && photograph ? { image: { url: photograph.url, alt: `${plan.name}實景：${photograph.caption}`,
      credit: `${config.credit}；${photograph.caption}`, sourceUrl: config.datasetUrl } } : {}),
    source: { ...(plan.source ?? { url: config.datasetUrl, title: `${plan.name}｜交通部觀光署景點資料（臺北市來源）` }), checkedAt },
    facts: { duration: `規劃估計 ${plan.duration}`, cost: '現場／官方公告為準', mobility: plan.mobility,
      ...(plan.seasonalNote ? { seasonalNote: plan.seasonalNote } : {}) } };
});
// The version follows card meaning/content, not a fetch timestamp. Existing votes stay tied to their immutable version.
const fingerprint = cards.map(({ source, ...card }) => ({ ...card, source: { url: source.url, title: source.title } }));
const version = `sha256-${createHash('sha256').update(JSON.stringify({ trip: config.trip, cards: fingerprint })).digest('hex').slice(0, 16)}`;
const trip: Trip = { ...config.trip, version, cards };
const directory = resolve(config.outputDirectory);
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
const writeJson = async (path: string, value: unknown) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
await writeJson(join(directory, `${trip.id}.json`), trip);
let registry: { trips: TripSummary[] };
try { registry = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')); } catch { registry = { trips: [] }; }
const summary: TripSummary = { id: trip.id, title: trip.title, destination: trip.destination, startsOn: trip.startsOn,
  endsOn: trip.endsOn, cardCount: cards.length, cover: cards.find(card => card.image)?.image?.url };
registry.trips = [...registry.trips.filter(item => item.id !== trip.id), summary];
await writeJson(join(directory, 'index.json'), registry);
await writeJson(join(directory, 'sources', `${trip.id}-manifest.json`), { checkedAt, fetchedFrom, datasetUrl: config.datasetUrl,
  licenseUrl: 'https://data.gov.tw/license', sourceNote: '原文未重製；描述是規劃提案。照片保留原來源署名，食品卡的街景不是餐點照片。',
  corroboratingSources: [...new Map(config.plans.filter(plan => plan.source).map(plan => [plan.source!.url, plan.source])).values()],
  records: [...new Map(selected.map(attraction => [attraction.id, attraction])).values()] });
console.log(`Wrote ${trip.id}: ${cards.length} cards, ${version}`);
