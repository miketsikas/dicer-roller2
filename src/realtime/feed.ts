import type { RollEntry } from '../types';

export function mergeRollEntriesNewestFirst(existing: RollEntry[], incoming: RollEntry[]): RollEntry[] {
  const byId = new Map<string, RollEntry>();

  for (const entry of [...existing, ...incoming]) {
    const previous = byId.get(entry.id);
    if (!previous || entry.timestamp > previous.timestamp) {
      byId.set(entry.id, entry);
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (b.timestamp !== a.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return b.id.localeCompare(a.id);
  });
}

export function oldestTimestamp(entries: RollEntry[]): string | null {
  if (entries.length === 0) {
    return null;
  }

  let minimum = entries[0].timestamp;
  for (const entry of entries) {
    if (entry.timestamp < minimum) {
      minimum = entry.timestamp;
    }
  }

  return new Date(minimum).toISOString();
}
