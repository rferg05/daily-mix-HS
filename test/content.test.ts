import { describe, expect, it } from 'vitest';
import { loadJokes, loadQuotes, periodKey, Pins, readJokes, readQuotes, splitJoke, wordForDay, wordForKey } from '../src/content';
import type { Fetcher } from '../src/content';
import { readConfig } from '../src/config';

describe('jokes', () => {
  it('splits a question from its answer', () => {
    expect(splitJoke('Why did the tomato blush? Because it saw the salad dressing.'))
      .toEqual({ setup: 'Why did the tomato blush?', punchline: 'Because it saw the salad dressing.' });
  });

  it('keeps a joke whole when it has no answer after a question', () => {
    expect(splitJoke('A steak pun is a rare medium well done.')).toEqual({ setup: 'A steak pun is a rare medium well done.', punchline: null });
    expect(splitJoke('Did you hear about the cheese factory that exploded?'))
      .toEqual({ setup: 'Did you hear about the cheese factory that exploded?', punchline: null });
  });

  it('reads a search page, skipping blanks', () => {
    const got = readJokes({ total_pages: 25, results: [{ joke: 'One? Two.' }, { joke: '  ' }, {}, null] });
    expect(got.pages).toBe(25);
    expect(got.jokes).toEqual([{ setup: 'One?', punchline: 'Two.' }]);
  });

  it('asks again within the real page count when the first page is empty', async () => {
    const urls: string[] = [];
    const fetcher: Fetcher = async ({ url }) => {
      urls.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      return { status: 200, body: { total_pages: 2, results: page <= 2 ? [{ joke: `Joke ${page}` }] : [] } };
    };
    const jokes = await loadJokes(fetcher, () => 0.99);
    expect(urls).toHaveLength(2);
    expect(jokes).toEqual([{ setup: 'Joke 2', punchline: null }]);
  });

  it('fails on an error status', async () => {
    await expect(loadJokes(async () => ({ status: 503, body: '' }))).rejects.toThrow('503');
  });
});

describe('quotes', () => {
  it('reads quotes, dropping the rate-limit notice and "Unknown" authors', () => {
    expect(readQuotes([
      { q: 'Great loves  too must be endured.', a: 'Coco Chanel' },
      { q: 'Anonymous wisdom.', a: 'Unknown' },
      { q: 'Too many requests. Obtain an auth key for unlimited access.', a: 'zenquotes.io' },
    ])).toEqual([
      { text: 'Great loves too must be endured.', author: 'Coco Chanel' },
      { text: 'Anonymous wisdom.', author: '' },
    ]);
  });

  it('fails when nothing usable comes back', async () => {
    await expect(loadQuotes(async () => ({ status: 200, body: [] }))).rejects.toThrow('204');
  });
});

describe('word of the day', () => {
  it('is the same all day and changes the next', () => {
    const a = wordForDay({ y: 2026, m: 10, d: 26 });
    expect(wordForDay({ y: 2026, m: 10, d: 26 })).toBe(a);
    expect(wordForDay({ y: 2026, m: 10, d: 27 })).not.toBe(a);
  });

  it('never repeats within a year', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d));
      seen.add(wordForDay({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }).word);
    }
    expect(seen.size).toBe(365);
  });
});

describe('how long content stays', () => {
  const at = (iso: string) => Date.parse(iso) / 1000;

  it('gives each turn its own key when there is no period', () => {
    const keys = [0, 1, 2, 3, 4, 5].map((slide) => periodKey({ slide, items: 3, rotateSeconds: 20, changeMinutes: 0 }));
    expect(keys).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('keeps the key for the whole period, on the household clock', () => {
    const key = (iso: string, changeMinutes: number) =>
      periodKey({ slide: at(iso) / 20, items: 3, rotateSeconds: 20, changeMinutes, timezone: 'America/Chicago' });
    // 11:00 and 11:59 PM Chicago share an hour; midnight Chicago starts a new day.
    expect(key('2026-10-27T04:00:00Z', 60)).toBe(key('2026-10-27T04:59:40Z', 60));
    expect(key('2026-10-27T04:59:40Z', 60)).not.toBe(key('2026-10-27T05:00:00Z', 60));
    expect(key('2026-10-27T04:59:40Z', 1440)).not.toBe(key('2026-10-27T05:00:00Z', 1440));
    expect(key('2026-10-27T05:00:00Z', 1440)).toBe(key('2026-10-28T04:59:40Z', 1440));
    // Three hours run 12–3, 3–6…, local.
    expect(key('2026-10-27T05:00:00Z', 180)).toBe(key('2026-10-27T07:59:40Z', 180));
    expect(key('2026-10-27T07:59:40Z', 180)).not.toBe(key('2026-10-27T08:00:00Z', 180));
  });

  it('pins a batch item to its key, even after a new batch arrives', () => {
    const pins = new Pins<string>();
    expect(pins.get('a', ['one', 'two'])).toBe('one');
    expect(pins.get('b', ['one', 'two'])).toBe('two');
    expect(pins.get('a', ['three', 'four'])).toBe('one');
    expect(pins.get('c', ['three', 'four'])).toBe('three');
  });

  it('deals every word once before repeating', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 732; k++) seen.add(wordForKey(k).word);
    expect(seen.size).toBe(732);
  });
});

describe('config', () => {
  it('defaults everything on, every 20 seconds, new each turn', () => {
    expect(readConfig({})).toEqual({ items: ['joke', 'word', 'quote'], rotateSeconds: 20, changeMinutes: 0, headings: true });
  });

  it('reads toggles, clamps the timer and accepts only listed periods', () => {
    expect(readConfig({ word: false, rotateSeconds: '2', headings: 'false', changeEvery: '60' }))
      .toEqual({ items: ['joke', 'quote'], rotateSeconds: 5, changeMinutes: 60, headings: false });
    expect(readConfig({ changeEvery: 1440 }).changeMinutes).toBe(1440);
    expect(readConfig({ changeEvery: '7' }).changeMinutes).toBe(0);
  });
});
