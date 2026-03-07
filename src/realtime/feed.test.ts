import { describe, expect, test } from 'vitest';
import { mergeRollEntriesNewestFirst, oldestTimestamp } from './feed';
import type { RollEntry } from '../types';

function buildEntry(id: string, timestamp: number): RollEntry {
  return {
    id,
    timestamp,
    playerAlias: 'Player',
    roomName: 'Room',
    roomCode: 'ABC123',
    secret: false,
    source: 'manual',
    formula: null,
    modifier: 0,
    total: 10,
    dicePools: [{ sides: 20, values: [10] }],
    spamKey: `key-${id}`
  };
}

describe('room feed merge', () => {
  test('deduplicates by id and keeps newest-first order', () => {
    const existing = [buildEntry('a', 3000), buildEntry('b', 2000)];
    const incoming = [buildEntry('b', 2000), buildEntry('c', 2500)];

    const merged = mergeRollEntriesNewestFirst(existing, incoming);

    expect(merged.map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
  });

  test('returns oldest timestamp cursor', () => {
    const entries = [buildEntry('a', 1000), buildEntry('b', 7000), buildEntry('c', 5000)];
    expect(oldestTimestamp(entries)).toBe(new Date(1000).toISOString());
  });
});
