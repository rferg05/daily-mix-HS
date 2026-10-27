import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle } from './host-style';
import { readConfig } from './config';
import type { Config, ItemId } from './config';
import { useFitFontSize } from './fit';
import { hostFetcher, loadJokes, loadQuotes, localDay, periodKey, Pins, PLUGIN_ID, SourceError, wordForDay, wordForKey } from './content';
import type { Fetcher, Joke, Quote } from './content';

/** Fetch a fresh batch of jokes and quotes this often. */
const REFRESH_MS = 60 * 60_000;
/** After a failed load, try again this soon. */
const RETRY_MS = 2 * 60_000;
/** How often to check for a due refresh and a new day. */
const CHECK_MS = 60_000;
const FADE_MS = 800;

/** Each item's color, lifted to read on a dark, translucent module. */
const ACCENT: Record<ItemId, string> = {
  joke: '#ffc96b',
  word: '#8fd3ff',
  quote: '#7ee0ad',
};

const LABEL: Record<ItemId, string> = {
  joke: 'Dad joke',
  word: 'Word of the day',
  quote: 'Quote of the day',
};

const KEYFRAMES = `@keyframes dm-fade { from { opacity: 0; } to { opacity: 1; } }`;

function log(level: 'info' | 'warn' | 'error', message: string) {
  try {
    window.__HS_SDK__?.emit?.({ type: 'log', level, message: `[${PLUGIN_ID}] ${message}` });
  } catch { /* logging is best effort */ }
}

// ── Jokes and quotes ────────────────────────────────────────────────────────
// Kept outside React so a module that unmounts when its screen rotates away
// shows its batch at once when it comes back, without a new request.

interface Source<T> {
  name: string;
  load: (fetcher: Fetcher) => Promise<T[]>;
  items: T[];
  pins: Pins<T>;
  failure: string | null;
  loadedAt: number;
  loading: Promise<void> | null;
}

const source = <T,>(name: string, load: (fetcher: Fetcher) => Promise<T[]>): Source<T> =>
  ({ name, load, items: [], pins: new Pins<T>(), failure: null, loadedAt: 0, loading: null });

const jokes = source<Joke>('icanhazdadjoke', (f) => loadJokes(f));
const quotes = source<Quote>('ZenQuotes', loadQuotes);

function refresh<T>(s: Source<T>, fetcher: Fetcher): Promise<void> | null {
  const sinceLoad = Date.now() - s.loadedAt;
  const due = s.loadedAt === 0 || sinceLoad >= (s.failure ? RETRY_MS : REFRESH_MS);
  if (!due || s.loading) return s.loading;
  s.loading = (async () => {
    try {
      s.items = await s.load(fetcher);
      if (s.failure) log('info', `${s.name} is answering again`);
      s.failure = null;
    } catch (e) {
      const failure = e instanceof SourceError ? `${s.name} answered with an error (${e.status})` : `Can't reach ${s.name}`;
      if (s.failure !== failure) log('warn', failure);
      s.failure = failure;
    } finally {
      s.loadedAt = Date.now();
      s.loading = null;
    }
  })();
  return s.loading;
}

/** Keeps the enabled sources loaded, and re-renders when one changes or the
 *  day turns over. */
function useContent(fetcher: Fetcher, cfg: Config, timezone: string | undefined) {
  const [, setTick] = useState(0);
  const wantJokes = cfg.items.includes('joke');
  const wantQuotes = cfg.items.includes('quote');

  useEffect(() => {
    let alive = true;
    const check = () => {
      const pending = [wantJokes && refresh(jokes, fetcher), wantQuotes && refresh(quotes, fetcher)]
        .filter((p): p is Promise<void> => !!p);
      for (const p of pending) p.then(() => { if (alive) setTick((t) => t + 1); });
      // Also re-renders at midnight, so the word changes.
      setTick((t) => t + 1);
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [fetcher, wantJokes, wantQuotes]);

  return { jokes, quotes };
}

// ── Timer ───────────────────────────────────────────────────────────────────

/** A counter that goes up every `seconds`, counted from the wall clock so
 *  it carries on where it was when a screen rotates back, and two modules
 *  with the same timer change together. */
function useStep(seconds: number): number {
  const ms = seconds * 1000;
  const [step, setStep] = useState(() => Math.floor(Date.now() / ms));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = Date.now();
      setStep(Math.floor(now / ms));
      timer = setTimeout(arm, ms - (now % ms) + 20);
    };
    arm();
    return () => clearTimeout(timer);
  }, [ms]);
  return step;
}

// ── Box size ────────────────────────────────────────────────────────────────

function useBoxSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Layout size, not on-screen size: the editor scales the canvas down
      // with a transform, and the layout must match the module's real shape.
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// ── Slides ──────────────────────────────────────────────────────────────────

type Content =
  | { item: 'joke'; joke: Joke }
  | { item: 'word'; word: ReturnType<typeof wordForDay> }
  | { item: 'quote'; quote: Quote };

/** Padding inside the module: a share of its short side, in pixels. */
const panelPad = (w: number, h: number) => Math.round(Math.max(10, Math.min(40, Math.min(w, h) * 0.06)));

function Heading({ item, fontSize }: { item: ItemId; fontSize: number }) {
  return (
    <div
      style={{
        flex: 'none',
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: ACCENT[item],
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1.2,
      }}
    >
      {LABEL[item]}
    </div>
  );
}

function JokeBody({ joke }: { joke: Joke }) {
  return (
    <div style={{ textAlign: 'center', lineHeight: 1.25, whiteSpace: 'pre-line' }}>
      <div style={{ fontWeight: 600 }}>{joke.setup}</div>
      {joke.punchline && (
        <div style={{ fontWeight: 800, color: ACCENT.joke, marginTop: '0.45em' }}>{joke.punchline}</div>
      )}
    </div>
  );
}

function WordBody({ word }: { word: ReturnType<typeof wordForDay> }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.2em', fontWeight: 800, lineHeight: 1.05, color: ACCENT.word }}>{word.word}</div>
      <div style={{ fontSize: '0.7em', fontStyle: 'italic', fontWeight: 600, opacity: 0.75, margin: '0.25em 0 0.35em' }}>{word.pos}</div>
      <div style={{ fontWeight: 600, lineHeight: 1.25 }}>{word.definition}</div>
    </div>
  );
}

function QuoteBody({ quote }: { quote: Quote }) {
  return (
    <div style={{ borderLeft: `0.12em solid ${ACCENT.quote}`, paddingLeft: '0.6em' }}>
      <div style={{ fontWeight: 600, lineHeight: 1.25 }}>
        <span style={{ color: ACCENT.quote, fontWeight: 800 }}>{'“'}</span>
        {quote.text}
        <span style={{ color: ACCENT.quote, fontWeight: 800 }}>{'”'}</span>
      </div>
      {quote.author && (
        <div style={{ fontSize: '0.7em', fontWeight: 700, color: ACCENT.quote, marginTop: '0.45em' }}>{'—'} {quote.author}</div>
      )}
    </div>
  );
}

const contentKey = (c: Content) =>
  c.item === 'joke' ? `j|${c.joke.setup}` : c.item === 'word' ? `w|${c.word.word}` : `q|${c.quote.text}`;

/** One item, its text as large as the module allows. The upper bound is
 *  generous on purpose: the fit shrinks it to the largest size that fits, so
 *  a short joke reads from across the room and a long quote still fits. */
function Slide({ content, headings, baseFont }: { content: Content; headings: boolean; baseFont: number }) {
  const [ref, box] = useBoxSize();
  const { w, h } = box;
  const pad = panelPad(w, h);
  const headingFont = Math.max(baseFont, Math.min(baseFont * 2.4, Math.min(w, h) * 0.065));
  const desired = Math.max(baseFont, Math.min(w, h) / 2.5);
  const { boxRef, fontSize } = useFitFontSize(desired, `${contentKey(content)}|${headings ? 1 : 0}|${w}x${h}`);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        gap: Math.round(pad * 0.4),
        overflow: 'hidden',
      }}
    >
      {w > 0 && headings && <Heading item={content.item} fontSize={headingFont} />}
      {w > 0 && (
        <div
          ref={boxRef}
          style={{ flex: '1 1 0', minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontSize }}
        >
          {/* Auto margins center the text, and unlike justify-content they let
              an overlong one overflow downward, where the fit can measure it. */}
          <div style={{ margin: 'auto 0', width: '100%' }}>
            {content.item === 'joke' && <JokeBody joke={content.joke} />}
            {content.item === 'word' && <WordBody word={content.word} />}
            {content.item === 'quote' && <QuoteBody quote={content.quote} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** One item at a time, crossfading on the timer. The next slide is mounted
 *  ahead, invisible, so its text has settled at its size before it fades in. */
function InTurn({ contentAt, step, headings, baseFont }: { contentAt: (s: number) => Content; step: number; headings: boolean; baseFont: number }) {
  const [leaving, setLeaving] = useState<number | null>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    setLeaving(shown.current);
    shown.current = step;
    const t = setTimeout(() => setLeaving(null), FADE_MS + 100);
    return () => clearTimeout(t);
  }, [step]);

  const slides = [leaving, step, step + 1].filter((s): s is number => s !== null);

  return (
    <>
      {slides.map((s) => {
        const role = s === step ? 'current' : s === leaving ? 'leaving' : 'next';
        const style: CSSProperties = {
          position: 'absolute',
          inset: 0,
          opacity: role === 'next' ? 0 : 1,
          zIndex: role === 'current' ? 2 : role === 'leaving' ? 1 : 0,
          transition: role === 'current' ? `opacity ${FADE_MS}ms ease-in-out` : undefined,
          pointerEvents: role === 'current' ? undefined : 'none',
        };
        return (
          <div key={s} style={style}>
            <Slide content={contentAt(s)} headings={headings} baseFont={baseFont} />
          </div>
        );
      })}
    </>
  );
}

// ── Notices ─────────────────────────────────────────────────────────────────

function Notice({ title, detail, delayed }: { title: string; detail?: string; delayed?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '1em',
        gap: '0.4em',
        // Only shown if the wait is noticeable, so a quick load doesn't flash it.
        animation: delayed ? 'dm-fade 400ms ease-out 2s both' : undefined,
      }}
    >
      <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{title}</div>
      {detail && <div style={{ fontSize: '1em', opacity: 0.8, maxWidth: '32em' }}>{detail}</div>}
    </div>
  );
}

// ── Module ──────────────────────────────────────────────────────────────────

export default function DailyMix(props: PluginComponentProps & { fetcher?: Fetcher }) {
  const { style } = props;
  const cfg = useMemo(() => readConfig(props.config ?? {}), [props.config]);
  const fetcher = useMemo(() => props.fetcher ?? hostFetcher(), [props.fetcher]);
  const timezone = props.timezone ?? window.__HS_SDK__?.getHostSettings?.().timezone;
  const data = useContent(fetcher, cfg, timezone);
  const step = useStep(cfg.rotateSeconds);
  const baseFont = Number.isFinite(style.fontSize) && style.fontSize > 0 ? style.fontSize : 18;

  // Only what has loaded takes a turn, so a source that's down is skipped
  // rather than leaving a gap.
  const items = cfg.items.filter((id) =>
    id === 'word' || (id === 'joke' ? data.jokes.items.length > 0 : data.quotes.items.length > 0));
  const n = items.length;

  /** Slide `s` shows item `s mod n`, with the content for its period: the
   *  same joke, word or quote until the period changes. */
  const contentAt = (s: number): Content => {
    const item = items[((s % n) + n) % n];
    const key = periodKey({ slide: s, items: n, rotateSeconds: cfg.rotateSeconds, changeMinutes: cfg.changeMinutes, timezone });
    const pin = `${cfg.changeMinutes}|${key}`;
    if (item === 'joke') return { item, joke: data.jokes.pins.get(pin, data.jokes.items) };
    if (item === 'quote') return { item, quote: data.quotes.pins.get(pin, data.quotes.items) };
    // A whole day: the built-in module's word for the date the slide shows on.
    const word = cfg.changeMinutes === 1440
      ? wordForDay(localDay(timezone, new Date(s * cfg.rotateSeconds * 1000)))
      : wordForKey(key);
    return { item, word };
  };

  const pending = cfg.items.filter((id) => id !== 'word')
    .map((id) => (id === 'joke' ? data.jokes : data.quotes))
    .filter((s) => s.items.length === 0);
  let notice: { title: string; detail?: string; delayed?: boolean } | null = null;
  if (cfg.items.length === 0) notice = { title: 'Nothing chosen', detail: "Turn on a dad joke, word of the day or quote in this module's settings." };
  else if (n === 0 && pending.every((s) => s.failure)) notice = { title: pending[0].failure!, detail: 'Trying again shortly.' };
  else if (n === 0) notice = { title: 'Loading…', delayed: true };

  const radius = Math.max(0, (Number(style.borderRadius) || 0) - (Number(style.padding) || 0));

  return (
    <div style={{ ...hostFrameStyle(style, { baseFontSize: 18 }), textShadow: '0 1px 3px rgba(0, 0, 0, 0.55)' }}>
      <style>{KEYFRAMES}</style>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: radius }}>
        {!notice && <InTurn contentAt={contentAt} step={step} headings={cfg.headings} baseFont={baseFont} />}
        {notice && <Notice {...notice} />}
      </div>
    </div>
  );
}
