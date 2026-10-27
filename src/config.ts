export type ItemId = 'joke' | 'word' | 'quote';

/** The order items are shown in. */
export const ITEM_ORDER: readonly ItemId[] = ['joke', 'word', 'quote'];

/** How long the same joke, word or quote stays, in minutes. 0 means a new
 *  one each time its turn comes round; 1440 is once a day, at midnight. */
export const CHANGE_MINUTES = [0, 5, 15, 30, 60, 180, 360, 720, 1440] as const;

export interface Config {
  items: ItemId[];
  rotateSeconds: number;
  changeMinutes: number;
  headings: boolean;
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback;

export function readConfig(raw: Record<string, unknown>): Config {
  return {
    items: ITEM_ORDER.filter((id) => bool(raw[id], true)),
    rotateSeconds: num(raw.rotateSeconds, 20, 5, 600),
    changeMinutes: (CHANGE_MINUTES as readonly number[]).includes(Number(raw.changeEvery)) ? Number(raw.changeEvery) : 0,
    headings: bool(raw.headings, true),
  };
}
