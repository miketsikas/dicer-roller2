import { describe, expect, test } from 'vitest';
import type { AppData } from '../types';
import type { ClientStorageBackend } from './backend';
import { NINETY_DAYS_MS } from './cleanup';
import { createDefaultData, StorageManager } from './storageManager';

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

describe('storage manager', () => {
  test('expire-on-read removes stale file and recreates client file', async () => {
    const now = Date.now();
    const backend = new MemoryBackend();
    const staleData = createDefaultData('old-client', now - NINETY_DAYS_MS - 50);
    staleData.updatedAt = now - NINETY_DAYS_MS - 50;
    backend.files.set('client-old-client.json', staleData);

    const manager = new StorageManager(backend);
    const loaded = await manager.loadOrCreate(now);

    expect(backend.files.has('client-old-client.json')).toBe(false);
    expect(loaded.fileName).not.toBe('client-old-client.json');
    expect(loaded.data.createdAt).toBe(now);
  });
});
