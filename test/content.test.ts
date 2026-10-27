import { describe, expect, it } from 'vitest';
import { loadJokes, loadQuotes, readJokes, readQuotes, splitJoke, wordForDay } from '../src/content';
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

describe('config', () => {
  it('defaults everything on, every 20 seconds', () => {
    expect(readConfig({})).toEqual({ items: ['joke', 'word', 'quote'], rotateSeconds: 20, headings: true });
  });

  it('reads toggles and clamps the timer', () => {
    expect(readConfig({ word: false, rotateSeconds: '2', headings: 'false' }))
      .toEqual({ items: ['joke', 'quote'], rotateSeconds: 5, headings: false });
  });
});
