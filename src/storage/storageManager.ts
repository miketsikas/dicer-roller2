import type { AppData, DiceCounts } from '../types';
import { createEmptyCounts } from '../lib/dice';
import { createId } from '../lib/uuid';
import type { ClientStorageBackend } from './backend';
import { cleanupStaleClientFiles, isStale, shouldRunDailyCleanup } from './cleanup';
import { IndexedDbBackend } from './indexedDbBackend';
import { isOpfsSupported, OpfsBackend } from './opfsBackend';

export interface LoadedStorage {
  backendKind: 'opfs' | 'idb';
  fileName: string;
  data: AppData;
}

function defaultCounts(): DiceCounts {
  return createEmptyCounts();
}

export function createDefaultData(clientId: string, now = Date.now()): AppData {
  return {
    clientId,
    createdAt: now,
    updatedAt: now,
    lastCleanupAt: now,
    preferences: {
      playerAlias: 'Player',
      roomName: 'Local Workspace',
      roomCode: '',
      defaultSecret: false,
      backgroundId: 'forge',
      autoCarousel: true,
      rngMode: 'crypto'
    },
    rollHistory: [],
    presets: [
      {
        id: createId('preset'),
        name: 'Attack +5',
        counts: defaultCounts(),
        formula: '1d20+5',
        secret: false,
        updatedAt: now
      },
      {
        id: createId('preset'),
        name: 'Classic 4d6 Drop Lowest',
        counts: defaultCounts(),
        formula: '4d6kh3',
        secret: false,
        updatedAt: now
      }
    ],
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

function normalizeLoadedData(data: AppData): AppData {
  return {
    ...data,
    rollHistory: (data.rollHistory ?? []).map((entry) => ({
      ...entry,
      roomCode: entry.roomCode ?? ''
    })),
    preferences: {
      playerAlias: data.preferences?.playerAlias ?? 'Player',
      roomName: data.preferences?.roomName ?? 'Local Workspace',
      roomCode: data.preferences?.roomCode ?? '',
      defaultSecret: data.preferences?.defaultSecret ?? false,
      backgroundId: data.preferences?.backgroundId ?? 'forge',
      autoCarousel: data.preferences?.autoCarousel ?? true,
      rngMode: data.preferences?.rngMode ?? 'crypto'
    }
  };
}

export class StorageManager {
  private readonly backend: ClientStorageBackend;

  private activeFileName: string | null = null;

  constructor(backend?: ClientStorageBackend) {
    if (backend) {
      this.backend = backend;
    } else {
      this.backend = isOpfsSupported() ? new OpfsBackend() : new IndexedDbBackend();
    }
  }

  async loadOrCreate(now = Date.now()): Promise<LoadedStorage> {
    await this.backend.init();

    await cleanupStaleClientFiles(this.backend, { now });

    const fileNames = (await this.backend.listFileNames()).filter(
      (name) => name.startsWith('client-') && name.endsWith('.json')
    );

    let selected: { name: string; data: AppData } | null = null;

    for (const name of fileNames) {
      const data = await this.backend.readFile(name);
      if (!data) {
        continue;
      }
      const normalized = normalizeLoadedData(data);
      if (isStale(normalized, now)) {
        await this.backend.deleteFile(name);
        continue;
      }
      if (!selected || normalized.updatedAt > selected.data.updatedAt) {
        selected = { name, data: normalized };
      }
    }

    if (!selected) {
      const clientId = createId('client');
      const fileName = `client-${clientId}.json`;
      const data = createDefaultData(clientId, now);
      await this.backend.writeFile(fileName, data);
      this.activeFileName = fileName;
      return {
        backendKind: this.backend.kind,
        fileName,
        data
      };
    }

    this.activeFileName = selected.name;
    if (isStale(selected.data, now)) {
      await this.backend.deleteFile(selected.name);
      const clientId = createId('client');
      const fileName = `client-${clientId}.json`;
      const data = createDefaultData(clientId, now);
      await this.backend.writeFile(fileName, data);
      this.activeFileName = fileName;
      return {
        backendKind: this.backend.kind,
        fileName,
        data
      };
    }

    if (shouldRunDailyCleanup(selected.data.lastCleanupAt, now)) {
      await cleanupStaleClientFiles(this.backend, { now, keepFileName: this.activeFileName });
      selected.data.lastCleanupAt = now;
      selected.data.updatedAt = now;
      await this.backend.writeFile(selected.name, selected.data);
    }

    return {
      backendKind: this.backend.kind,
      fileName: selected.name,
      data: selected.data
    };
  }

  async save(data: AppData): Promise<void> {
    if (!this.activeFileName) {
      throw new Error('StorageManager has no active file loaded.');
    }
    await this.backend.writeFile(this.activeFileName, data);
  }

  async runDailyCleanup(data: AppData, now = Date.now()): Promise<AppData> {
    if (!this.activeFileName) {
      return data;
    }
    if (!shouldRunDailyCleanup(data.lastCleanupAt, now)) {
      return data;
    }

    await cleanupStaleClientFiles(this.backend, { now, keepFileName: this.activeFileName });
    const next: AppData = {
      ...data,
      lastCleanupAt: now,
      updatedAt: now
    };
    await this.save(next);
    return next;
  }

  getBackendKind(): 'opfs' | 'idb' {
    return this.backend.kind;
  }
}
