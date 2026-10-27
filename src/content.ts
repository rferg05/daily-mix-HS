import { EN_US_WORDS } from './words';
import type { WordEntry } from './words-types';

export type { WordEntry };

export const PLUGIN_ID = 'daily-mix';

// ── Fetching ────────────────────────────────────────────────────────────────

export interface FetchRequest {
  url: string;
  headers?: Record<string, string>;
  cacheTtlMs?: number;
}
export type Fetcher = (req: FetchRequest) => Promise<{ status: number; body: unknown }>;

export function hostFetcher(): Fetcher {
  return async (req) => {
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) throw new Error('Host SDK unavailable');
    const res = await sdk.pluginFetch(PLUGIN_ID, req);
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, body };
  };
}

export class SourceError extends Error {
  constructor(readonly source: string, readonly status: number) {
    super(`${source} answered ${status}`);
  }
}

// ── Dad jokes ───────────────────────────────────────────────────────────────

export const JOKES_URL = 'https://icanhazdadjoke.com/search';
/** The most the search endpoint hands out per page. */
const JOKES_PER_PAGE = 30;
/** Pages there were last time we asked; the first request picks from these. */
let jokePages = 24;

export interface Joke {
  /** The whole joke, or its question when it splits into one and an answer. */
  setup: string;
  punchline: string | null;
}

/** "Why did…? Because…" reads best as a question, then its answer on a line
 *  of its own. Jokes with no question mark, or one only at the end, stay whole. */
export function splitJoke(text: string): Joke {
  const clean = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  const m = /^([^\n]*?\?)\s+(\S[\s\S]*)$/.exec(clean);
  return m ? { setup: m[1].trim(), punchline: m[2].trim() } : { setup: clean, punchline: null };
}

export function readJokes(body: unknown): { jokes: Joke[]; pages: number } {
  const b = (body ?? {}) as { results?: unknown; total_pages?: unknown };
  const results = Array.isArray(b.results) ? b.results : [];
  const jokes = results
    .map((r) => (r && typeof r === 'object' ? (r as { joke?: unknown }).joke : null))
    .filter((j): j is string => typeof j === 'string' && j.trim() !== '')
    .map(splitJoke);
  const pages = typeof b.total_pages === 'number' && b.total_pages > 0 ? b.total_pages : 0;
  return { jokes, pages };
}

/** A random page of jokes, so each load brings a fresh batch. */
export async function loadJokes(fetcher: Fetcher, random = Math.random): Promise<Joke[]> {
  const get = async (page: number) => {
    const { status, body } = await fetcher({
      url: `${JOKES_URL}?limit=${JOKES_PER_PAGE}&page=${page}`,
      headers: {
        Accept: 'application/json',
        // icanhazdadjoke asks API clients to identify themselves.
        'User-Agent': 'HomeScreens-daily-mix-plugin (https://github.com/home-screens/home-screens)',
      },
      cacheTtlMs: 10 * 60_000,
    });
    if (status < 200 || status >= 300) throw new SourceError('icanhazdadjoke', status);
    return readJokes(body);
  };
  let got = await get(1 + Math.floor(random() * jokePages));
  if (got.pages) jokePages = got.pages;
  // The site has fewer pages than we last saw: ask again within its count.
  if (got.jokes.length === 0 && got.pages) got = await get(1 + Math.floor(random() * got.pages));
  if (got.jokes.length === 0) throw new SourceError('icanhazdadjoke', 204);
  return shuffle(got.jokes, random);
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export const QUOTES_URL = 'https://zenquotes.io/api/quotes';

export interface Quote {
  text: string;
  author: string;
}

export function readQuotes(body: unknown): Quote[] {
  if (!Array.isArray(body)) return [];
  return body
    .map((item) => {
      const q = (item ?? {}) as { q?: unknown; a?: unknown };
      const text = typeof q.q === 'string' ? q.q.replace(/\s+/g, ' ').trim() : '';
      const author = typeof q.a === 'string' ? q.a.trim() : '';
      return { text, author: author === 'Unknown' ? '' : author };
    })
    // ZenQuotes answers a rate-limited request with a single "too many
    // requests" quote; it names zenquotes.io, which no real quote does.
    .filter((q) => q.text && !/zenquotes/i.test(q.text) && !/zenquotes/i.test(q.author));
}

/** Fifty random quotes in one request (ZenQuotes allows few per minute). */
export async function loadQuotes(fetcher: Fetcher): Promise<Quote[]> {
  // The URL never changes, so the proxy cache must expire before our next
  // hourly look or every look would get the same fifty.
  const { status, body } = await fetcher({ url: QUOTES_URL, cacheTtlMs: 30 * 60_000 });
  if (status < 200 || status >= 300) throw new SourceError('ZenQuotes', status);
  const quotes = readQuotes(body);
  if (quotes.length === 0) throw new SourceError('ZenQuotes', 204);
  return quotes;
}

// ── Word of the day ─────────────────────────────────────────────────────────
// The same pick as the host's built-in module (word-of-day-data.ts), so both
// show the same word on the same day.

export interface Day {
  y: number;
  m: number;
  d: number;
}

/** Today's date in the household's time zone. */
export function localDay(timezone?: string, now = new Date()): Day {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined, year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const day = { y: get('year'), m: get('month'), d: get('day') };
    if (day.y && day.m && day.d) return day;
  } catch { /* unknown time zone: use the device's */ }
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/** Days reserved per year of the cycle (leap-year safe). */
const SLOTS_PER_YEAR = 366;

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPermutation(length: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const dayOfYear = ({ y, m, d }: Day) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;

export function wordForDay(day: Day, words: WordEntry[] = EN_US_WORDS): WordEntry {
  const cycleYears = Math.max(1, Math.ceil(words.length / SLOTS_PER_YEAR));
  const cycle = Math.floor(day.y / cycleYears);
  const order = seededPermutation(words.length, cycle);
  const slot = ((day.y % cycleYears) * SLOTS_PER_YEAR + (dayOfYear(day) - 1)) % words.length;
  return words[order[slot]];
}

/** A word for any period key, each word once per pass through the list. */
export function wordForKey(key: number, words: WordEntry[] = EN_US_WORDS): WordEntry {
  const len = words.length;
  const order = seededPermutation(len, Math.floor(key / len) ^ 0x5eed);
  return words[order[((key % len) + len) % len]];
}

// ── How long content stays ──────────────────────────────────────────────────

const clocks = new Map<string, Intl.DateTimeFormat>();

/** Minutes since 1970 on the household's wall clock, so periods line up with
 *  its hours and its midnight rather than UTC's. */
export function localMinutes(timezone: string | undefined, ms: number): number {
  try {
    const tz = timezone || '';
    let clock = clocks.get(tz);
    if (!clock) {
      clock = new Intl.DateTimeFormat('en-US', {
        timeZone: tz || undefined, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
      });
      clocks.set(tz, clock);
    }
    const parts = clock.formatToParts(ms);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const minutes = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) / 60_000;
    if (Number.isFinite(minutes)) return minutes;
  } catch { /* unknown time zone: use the device's */ }
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 60_000);
}

/** Which content a slide shows: slides with the same key show the same joke,
 *  word or quote. With no period it's the round, so each turn is new;
 *  otherwise it's the period the slide starts in. */
export function periodKey(opts: {
  slide: number; items: number; rotateSeconds: number; changeMinutes: number; timezone?: string;
}): number {
  const { slide, items, rotateSeconds, changeMinutes, timezone } = opts;
  if (changeMinutes <= 0) return Math.floor(slide / items);
  return Math.floor(localMinutes(timezone, slide * rotateSeconds * 1000) / changeMinutes);
}

/** Remembers which joke or quote went with each key, so a fresh batch
 *  arriving mid-period doesn't swap the one on screen. */
export class Pins<T> {
  private readonly map = new Map<string, T>();
  private cursor = 0;

  get(key: string, batch: T[]): T {
    let v = this.map.get(key);
    if (v === undefined) {
      v = batch[this.cursor++ % batch.length];
      this.map.set(key, v);
      // Only the shown, leaving and next slides need theirs.
      if (this.map.size > 8) this.map.delete(this.map.keys().next().value!);
    }
    return v;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(list: T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
