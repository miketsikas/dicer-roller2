import type { AppData, DiceCounts } from '../types';
import { createEmptyCounts } from '../lib/dice';
import {
  cloneCharacterModifiers,
  createEmptyCharacterModifiers,
  DEFAULT_MODIFIER_SETUP_NAME,
  suggestModifierSetupName
} from '../lib/modifierSetups';
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

const DEFAULT_LAYOUT_LEFT = ['quickActions', 'history'] as const;
const DEFAULT_LAYOUT_RIGHT = ['presets', 'rollComposer'] as const;
const LEGACY_DEFAULT_WINDOW_HEIGHTS = [
  {
    quickActions: 360,
    history: 360,
    presets: 180,
    rollComposer: 540
  },
  {
    quickActions: 450,
    history: 450,
    presets: 270,
    rollComposer: 630
  }
] as const;
const DEFAULT_WINDOW_HEIGHTS = {
  quickActions: 338,
  history: 562,
  presets: 338,
  rollComposer: 562
} as const;

function defaultCharacterModifiers() {
  return createEmptyCharacterModifiers();
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
    windowHeights: { ...DEFAULT_WINDOW_HEIGHTS }
  };
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isWorkspaceWindowId(value: string): value is keyof typeof DEFAULT_WINDOW_HEIGHTS {
  return value in DEFAULT_WINDOW_HEIGHTS;
}

function isLegacyDefaultWindowHeights(heights: Record<string, number>): boolean {
  const entries = Object.entries(heights).filter(
    (entry): entry is [keyof typeof DEFAULT_WINDOW_HEIGHTS, number] => isWorkspaceWindowId(entry[0])
  );
  if (entries.length === 0) {
    return true;
  }
  const allClassic = entries.every(([, value]) => Math.round(value) === 360);
  if (allClassic) {
    return true;
  }
  return LEGACY_DEFAULT_WINDOW_HEIGHTS.some((profile) => entries.every(([key, value]) => Math.round(value) === profile[key]));
}

function normalizeCharacterModifiers(rawValue: unknown) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const rawStats =
    'stats' in raw && raw.stats && typeof raw.stats === 'object'
      ? (raw.stats as Record<string, { base?: unknown; temp?: unknown }>)
      : {};
  const rawSaves =
    'saves' in raw && raw.saves && typeof raw.saves === 'object'
      ? (raw.saves as Record<string, { base?: unknown; temp?: unknown }>)
      : {};

  return {
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
  };
}

function normalizeModifierSetups(rawValue: unknown, legacyModifiers: ReturnType<typeof normalizeCharacterModifiers>, fallbackUpdatedAt: number) {
  const normalized = Array.isArray(rawValue)
    ? rawValue.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }

        const raw = entry as {
          id?: unknown;
          name?: unknown;
          modifiers?: unknown;
          updatedAt?: unknown;
        };

        const seed = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 32) : 'Setup';
        return [
          {
            id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('setup'),
            name: seed,
            modifiers: normalizeCharacterModifiers(raw.modifiers),
            updatedAt: safeNumber(raw.updatedAt) || fallbackUpdatedAt
          }
        ];
      })
    : [];

  const deduped = normalized.map((setup, index, setups) => ({
    ...setup,
    name: suggestModifierSetupName(setups.slice(0, index), setup.name || `Setup ${index + 1}`)
  }));

  if (deduped.length > 0) {
    return deduped;
  }

  return [
    {
      id: createId('setup'),
      name: DEFAULT_MODIFIER_SETUP_NAME,
      modifiers: cloneCharacterModifiers(legacyModifiers),
      updatedAt: fallbackUpdatedAt
    }
  ];
}

export function createDefaultData(clientId: string, now = Date.now()): AppData {
  const modifierSetupId = createId('setup');
  const modifiers = defaultCharacterModifiers();

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
    characterModifiers: modifiers,
    modifierSetups: [
      {
        id: modifierSetupId,
        name: DEFAULT_MODIFIER_SETUP_NAME,
        modifiers: cloneCharacterModifiers(modifiers),
        updatedAt: now
      }
    ],
    activeModifierSetupId: modifierSetupId,
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
  const rawData = data as AppData & {
    modifierSetups?: unknown;
    activeModifierSetupId?: unknown;
  };
  const legacyModifiers = normalizeCharacterModifiers(data.characterModifiers);
  const rawLayout = data.workspaceLayout;
  const normalizedModifierSetups = normalizeModifierSetups(rawData.modifierSetups, legacyModifiers, safeNumber(data.updatedAt));
  const activeModifierSetup =
    normalizedModifierSetups.find((setup) => setup.id === rawData.activeModifierSetupId) ?? normalizedModifierSetups[0];

  const normalizedLeft = Array.isArray(rawLayout?.leftOrder) ? rawLayout.leftOrder.filter((entry) => typeof entry === 'string') : [];
  const normalizedRight = Array.isArray(rawLayout?.rightOrder) ? rawLayout.rightOrder.filter((entry) => typeof entry === 'string') : [];
  const safeLeftOrder = normalizedLeft.length > 0 ? normalizedLeft : [...DEFAULT_LAYOUT_LEFT];
  const safeRightOrder = normalizedRight.length > 0 ? normalizedRight : [...DEFAULT_LAYOUT_RIGHT];
  const safeColumnSplit =
    typeof rawLayout?.columnSplit === 'number' && Number.isFinite(rawLayout.columnSplit)
      ? Math.max(30, Math.min(70, Math.round(rawLayout.columnSplit)))
      : 45;
  const safeWindowWidths =
    rawLayout?.windowWidths && typeof rawLayout.windowWidths === 'object'
      ? Object.fromEntries(
          Object.entries(rawLayout.windowWidths).filter(
            ([key, value]) => typeof key === 'string' && isWorkspaceWindowId(key) && typeof value === 'number' && Number.isFinite(value)
          )
        )
      : {};
  const safeWindowHeightsRaw =
    rawLayout?.windowHeights && typeof rawLayout.windowHeights === 'object'
      ? Object.fromEntries(
          Object.entries(rawLayout.windowHeights).filter(
            ([key, value]) => typeof key === 'string' && isWorkspaceWindowId(key) && typeof value === 'number' && Number.isFinite(value)
          )
        )
      : {};
  const isDefaultOrder =
    safeLeftOrder.length === DEFAULT_LAYOUT_LEFT.length &&
    safeLeftOrder.every((entry, index) => entry === DEFAULT_LAYOUT_LEFT[index]) &&
    safeRightOrder.length === DEFAULT_LAYOUT_RIGHT.length &&
    safeRightOrder.every((entry, index) => entry === DEFAULT_LAYOUT_RIGHT[index]);
  const shouldApplyDefaultHeights =
    isDefaultOrder && safeColumnSplit === 45 && Object.keys(safeWindowWidths).length === 0 && isLegacyDefaultWindowHeights(safeWindowHeightsRaw);

  const safeLayout = {
    locked: rawLayout?.locked ?? true,
    leftOrder: safeLeftOrder,
    rightOrder: safeRightOrder,
    windowsResizable: rawLayout?.windowsResizable ?? false,
    columnSplit: safeColumnSplit,
    sizesLocked: rawLayout?.sizesLocked ?? false,
    windowWidths: safeWindowWidths,
    windowHeights:
      shouldApplyDefaultHeights
        ? { ...DEFAULT_WINDOW_HEIGHTS }
        : {
            ...DEFAULT_WINDOW_HEIGHTS,
            ...safeWindowHeightsRaw
          }
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
    characterModifiers: cloneCharacterModifiers(activeModifierSetup.modifiers),
    modifierSetups: normalizedModifierSetups,
    activeModifierSetupId: activeModifierSetup.id,
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
