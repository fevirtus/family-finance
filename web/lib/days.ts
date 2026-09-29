import { toVnLocalInput } from "./time";

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function vnDateKey(iso: string): string {
  return toVnLocalInput(iso).slice(0, 10);
}

export type DayGroup<T> = { key: string; items: T[]; total: number };

export function groupByVnDay<
  T extends { occurred_at: string; amount: number; is_internal_transfer: boolean },
>(items: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = vnDateKey(item.occurred_at);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, items: [], total: 0 };
      groups.push(group);
    }
    group.items.push(item);
    if (!item.is_internal_transfer) group.total += item.amount;
  }
  return groups;
}

export function vnDayLabel(key: string, now: Date = new Date()): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const short = `${weekday} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
  const today = vnDateKey(now.toISOString());
  const yesterday = vnDateKey(new Date(now.getTime() - DAY_MS).toISOString());
  if (key === today) return `Hôm nay · ${short}`;
  if (key === yesterday) return `Hôm qua · ${short}`;
  return short;
}
