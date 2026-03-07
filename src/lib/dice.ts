import { DICE_SIDES, type DiceCounts, type DicePoolResult, type FeedItem, type RollEntry } from '../types';
import type { RandomEngine } from './rng';

export function createEmptyCounts(): DiceCounts {
  return {
    4: 0,
    6: 0,
    8: 0,
    10: 0,
    12: 0,
    20: 0,
    100: 0
  };
}

export interface DiceRollSummary {
  total: number;
  dicePools: DicePoolResult[];
}

export function rollCounts(counts: DiceCounts, rng: RandomEngine): DiceRollSummary {
  let total = 0;
  const dicePools: DicePoolResult[] = [];

  for (const sides of DICE_SIDES) {
    const count = counts[sides];
    if (!count || count < 1) {
      continue;
    }

    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const value = rng.intInclusive(1, sides);
      values.push(value);
      total += value;
    }

    dicePools.push({ sides, values });
  }

  return { total, dicePools };
}

export function buildCountsLabel(counts: DiceCounts): string {
  return DICE_SIDES.map((sides) => {
    const count = counts[sides] ?? 0;
    return count > 0 ? `${count}d${sides}` : null;
  })
    .filter(Boolean)
    .join('+');
}

export function buildSpamKey(args: {
  playerAlias: string;
  roomName: string;
  roomCode?: string;
  secret: boolean;
  formula: string | null;
  countsLabel: string;
}): string {
  return [
    args.playerAlias.trim().toLowerCase(),
    args.roomName.trim().toLowerCase(),
    args.roomCode?.trim().toLowerCase() ?? '',
    args.secret ? 'secret' : 'public',
    args.formula ? `f:${args.formula.toLowerCase()}` : `c:${args.countsLabel}`
  ].join('|');
}

export function rollRandomBatchTemplate(rng: RandomEngine): DiceCounts {
  const counts = createEmptyCounts();
  let hasAny = false;

  for (const sides of DICE_SIDES) {
    const count = rng.intInclusive(0, 3);
    counts[sides] = count;
    if (count > 0) {
      hasAny = true;
    }
  }

  if (!hasAny) {
    counts[DICE_SIDES[rng.intInclusive(0, DICE_SIDES.length - 1)]] = 1;
  }

  return counts;
}

export function groupFeedEntries(entries: RollEntry[], spamWindowMs: number): FeedItem[] {
  const items: FeedItem[] = [];

  for (const entry of entries) {
    const previous = items[items.length - 1];
    if (
      previous &&
      previous.primary.spamKey === entry.spamKey &&
      previous.primary.timestamp - entry.timestamp <= spamWindowMs
    ) {
      previous.duplicates.push(entry);
      continue;
    }

    items.push({
      primary: entry,
      duplicates: []
    });
  }

  return items;
}

export function poolsToReadableLabel(pools: DicePoolResult[]): string {
  return pools
    .map((pool) => {
      const base = `${pool.values.length}d${pool.sides}`;
      if (pool.keptValues && pool.droppedValues) {
        return `${base}(kept:${pool.keptValues.join(',')};dropped:${pool.droppedValues.join(',')})`;
      }
      return `${base}(${pool.values.join(',')})`;
    })
    .join(' | ');
}
