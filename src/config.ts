export type ItemId = 'joke' | 'word' | 'quote';

/** The order items are shown in. */
export const ITEM_ORDER: readonly ItemId[] = ['joke', 'word', 'quote'];

export interface Config {
  items: ItemId[];
  rotateSeconds: number;
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
    headings: bool(raw.headings, true),
  };
}
