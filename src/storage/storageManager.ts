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

const DEFAULT_STATS = {
  str: { base: 0, temp: 0 },
  dex: { base: 0, temp: 0 },
  con: { base: 0, temp: 0 },
  int: { base: 0, temp: 0 },
  wis: { base: 0, temp: 0 },
  cha: { base: 0, temp: 0 }
} as const;

const DEFAULT_SAVES = {
  fort: { base: 0, temp: 0 },
  reflex: { base: 0, temp: 0 },
  will: { base: 0, temp: 0 }
} as const;

const DEFAULT_LAYOUT_LEFT = ['quickActions', 'history'] as const;
const DEFAULT_LAYOUT_RIGHT = ['presets', 'rollComposer'] as const;

function defaultCharacterModifiers() {
  return {
    stats: {
      ...DEFAULT_STATS
    },
    saves: {
      ...DEFAULT_SAVES
    }
  };
}

function defaultWorkspaceLayout() {
  return {
    locked: true,
    leftOrder: [...DEFAULT_LAYOUT_LEFT],
    rightOrder: [...DEFAULT_LAYOUT_RIGHT],
    windowsResizable: false,
    columnSplit: 45,
    sizesLocked: false,
    windowWidths: {},
    windowHeights: {}
  };
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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
      backgroundId: 'citadel',
      autoCarousel: false,
      rngMode: 'crypto',
      guidedSetupCompleted: false,
      favoritePresetIds: [],
      reduceMotion: false,
      resultFxEnabled: true,
      resultFxSound: false,
      resultFxHaptics: true,
      mobileQuickRoll: true
    },
    characterModifiers: defaultCharacterModifiers(),
    workspaceLayout: defaultWorkspaceLayout(),
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
  const rawStats = data.characterModifiers?.stats ?? ({} as Record<string, { base?: unknown; temp?: unknown }>);
  const rawSaves = data.characterModifiers?.saves ?? ({} as Record<string, { base?: unknown; temp?: unknown }>);
  const rawLayout = data.workspaceLayout;

  const normalizedLeft = Array.isArray(rawLayout?.leftOrder) ? rawLayout.leftOrder.filter((entry) => typeof entry === 'string') : [];
  const normalizedRight = Array.isArray(rawLayout?.rightOrder) ? rawLayout.rightOrder.filter((entry) => typeof entry === 'string') : [];

  const safeLayout = {
    locked: rawLayout?.locked ?? true,
    leftOrder: normalizedLeft.length > 0 ? normalizedLeft : [...DEFAULT_LAYOUT_LEFT],
    rightOrder: normalizedRight.length > 0 ? normalizedRight : [...DEFAULT_LAYOUT_RIGHT],
    windowsResizable: rawLayout?.windowsResizable ?? false,
    columnSplit:
      typeof rawLayout?.columnSplit === 'number' && Number.isFinite(rawLayout.columnSplit)
        ? Math.max(30, Math.min(70, Math.round(rawLayout.columnSplit)))
        : 45,
    sizesLocked: rawLayout?.sizesLocked ?? false,
    windowWidths:
      rawLayout?.windowWidths && typeof rawLayout.windowWidths === 'object'
        ? Object.fromEntries(
            Object.entries(rawLayout.windowWidths).filter(
              ([key, value]) => typeof key === 'string' && typeof value === 'number' && Number.isFinite(value)
            )
          )
        : {},
    windowHeights:
      rawLayout?.windowHeights && typeof rawLayout.windowHeights === 'object'
        ? Object.fromEntries(
            Object.entries(rawLayout.windowHeights).filter(
              ([key, value]) => typeof key === 'string' && typeof value === 'number' && Number.isFinite(value)
            )
          )
        : {}
  };

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
      backgroundId: data.preferences?.backgroundId ?? 'citadel',
      autoCarousel: data.preferences?.autoCarousel ?? false,
      rngMode: data.preferences?.rngMode ?? 'crypto',
      guidedSetupCompleted: data.preferences?.guidedSetupCompleted ?? true,
      favoritePresetIds: Array.isArray(data.preferences?.favoritePresetIds)
        ? data.preferences.favoritePresetIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      reduceMotion: data.preferences?.reduceMotion ?? false,
      resultFxEnabled: data.preferences?.resultFxEnabled ?? true,
      resultFxSound: data.preferences?.resultFxSound ?? false,
      resultFxHaptics: data.preferences?.resultFxHaptics ?? true,
      mobileQuickRoll: data.preferences?.mobileQuickRoll ?? true
    },
    characterModifiers: {
      stats: {
        str: {
          base: safeNumber(rawStats.str?.base),
          temp: safeNumber(rawStats.str?.temp)
        },
        dex: {
          base: safeNumber(rawStats.dex?.base),
          temp: safeNumber(rawStats.dex?.temp)
        },
        con: {
          base: safeNumber(rawStats.con?.base),
          temp: safeNumber(rawStats.con?.temp)
        },
        int: {
          base: safeNumber(rawStats.int?.base),
          temp: safeNumber(rawStats.int?.temp)
        },
        wis: {
          base: safeNumber(rawStats.wis?.base),
          temp: safeNumber(rawStats.wis?.temp)
        },
        cha: {
          base: safeNumber(rawStats.cha?.base),
          temp: safeNumber(rawStats.cha?.temp)
        }
      },
      saves: {
        fort: {
          base: safeNumber(rawSaves.fort?.base),
          temp: safeNumber(rawSaves.fort?.temp)
        },
        reflex: {
          base: safeNumber(rawSaves.reflex?.base),
          temp: safeNumber(rawSaves.reflex?.temp)
        },
        will: {
          base: safeNumber(rawSaves.will?.base),
          temp: safeNumber(rawSaves.will?.temp)
        }
      }
    },
    workspaceLayout: safeLayout
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
