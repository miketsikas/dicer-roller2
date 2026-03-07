import { describe, expect, test } from 'vitest';
import type { AppData } from '../types';
import type { ClientStorageBackend } from './backend';
import { cleanupStaleClientFiles, NINETY_DAYS_MS } from './cleanup';

class MemoryBackend implements ClientStorageBackend {
  kind: 'idb' = 'idb';

  public files = new Map<string, AppData>();

  async init(): Promise<void> {}

  async listFileNames(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async readFile(fileName: string): Promise<AppData | null> {
    return this.files.get(fileName) ?? null;
  }

  async writeFile(fileName: string, data: AppData): Promise<void> {
    this.files.set(fileName, data);
  }

  async deleteFile(fileName: string): Promise<void> {
    this.files.delete(fileName);
  }
}

function mockData(updatedAt: number): AppData {
  return {
    clientId: 'client-a',
    createdAt: updatedAt,
    updatedAt,
    lastCleanupAt: updatedAt,
    preferences: {
      playerAlias: 'Player',
      roomName: 'Room',
      roomCode: 'ROOM-1',
      defaultSecret: false,
      backgroundId: 'forge',
      autoCarousel: true,
      rngMode: 'crypto'
    },
    rollHistory: [],
    presets: [],
    moderation: {
      ownerMode: false,
      roomLocked: false,
      mutedAliases: [],
      hiddenAliases: [],
      spamWindowMs: 7000
    },
    sessionReplays: []
  };
}

describe('90-day cleanup', () => {
  test('deletes stale client files', async () => {
    const now = Date.now();
    const backend = new MemoryBackend();

    backend.files.set('client-old.json', mockData(now - NINETY_DAYS_MS - 1));
    backend.files.set('client-fresh.json', mockData(now - 1_000));

    const removed = await cleanupStaleClientFiles(backend, { now });

    expect(removed).toEqual(['client-old.json']);
    expect(backend.files.has('client-old.json')).toBe(false);
    expect(backend.files.has('client-fresh.json')).toBe(true);
  });

  test('keeps active file if keepFileName is provided', async () => {
    const now = Date.now();
    const backend = new MemoryBackend();

    backend.files.set('client-current.json', mockData(now - NINETY_DAYS_MS - 1));

    const removed = await cleanupStaleClientFiles(backend, {
      now,
      keepFileName: 'client-current.json'
    });

    expect(removed).toEqual([]);
    expect(backend.files.has('client-current.json')).toBe(true);
  });
});
