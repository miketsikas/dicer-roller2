import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { BackgroundWidget } from './components/BackgroundWidget';
import { HistoryFeed } from './components/HistoryFeed';
import { Modal } from './components/Modal';
import { ModifierToolkitPanel } from './components/ModifierToolkitPanel';
import { PlayerRoomPanel } from './components/PlayerRoomPanel';
import { PresetsPanel } from './components/PresetsPanel';
import { QuickActions } from './components/QuickActions';
import { RollComposer } from './components/RollComposer';
import { BACKGROUNDS } from './constants/backgrounds';
import { useAppData } from './hooks/useAppData';
import { buildCountsLabel, buildSpamKey, createEmptyCounts, groupFeedEntries, rollCounts, rollRandomBatchTemplate } from './lib/dice';
import { evaluateFormula } from './lib/formula';
import { applyPreset, createPreset, deletePreset, renamePreset, updatePresetFromDraft } from './lib/presets';
import { createRng } from './lib/rng';
import { parseShareParams } from './lib/share';
import { createId } from './lib/uuid';
import { normalizeAlias, normalizeRoomCode, sanitizePositiveInt, sanitizeSignedInt, validateAlias, validateRoomCode } from './lib/validation';
import { mergeRollEntriesNewestFirst, oldestTimestamp } from './realtime/feed';
import {
  ensureAnonymousUser,
  fetchAvailableRooms,
  fetchRoomRollPage,
  insertRoomRoll,
  removeRoomMembership,
  subscribeRoom,
  unsubscribeRoom,
  upsertRoomMembership,
  type AvailableRoom,
  type RoomPresenceMember
} from './realtime/roomService';
import { getSupabaseClient, isRealtimeConfigured } from './realtime/supabaseClient';
import type { CharacterModifiers, DiceCounts, RollEntry, SaveKey, StatKey, WorkspaceLayout } from './types';

const PAGE_SIZE = 100;
const ROOM_SYNC_INTERVAL_MS = 8_000;

const WINDOW_IDS = ['presets', 'quickActions', 'rollComposer', 'history'] as const;
const WINDOW_LABELS: Record<(typeof WINDOW_IDS)[number], string> = {
  presets: 'Saved Dice Combinations',
  quickActions: 'Quick Actions',
  rollComposer: 'Dice Roller',
  history: 'Roll History'
};

type WorkspaceWindowId = (typeof WINDOW_IDS)[number];
type WorkspaceColumn = 'left' | 'right';
type WindowDensity = 'regular' | 'compact' | 'tiny';

const DEFAULT_LAYOUT: WorkspaceLayout = {
  locked: true,
  leftOrder: ['quickActions', 'history'],
  rightOrder: ['presets', 'rollComposer'],
  windowsResizable: false,
  columnSplit: 45,
  sizesLocked: false,
  windowWidths: {},
  windowHeights: {}
};

type ModifierRefKey = StatKey | SaveKey;

const MODIFIER_KEY_TO_LABEL: Record<ModifierRefKey, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
  fort: 'FORT',
  reflex: 'REFLEX',
  will: 'WILL'
};

const MODIFIER_LABEL_TO_KEY: Record<string, ModifierRefKey> = {
  STR: 'str',
  DEX: 'dex',
  CON: 'con',
  INT: 'int',
  WIS: 'wis',
  CHA: 'cha',
  FORT: 'fort',
  REFLEX: 'reflex',
  WILL: 'will'
};

const MODIFIER_TOKEN_REGEX = /\{(STR|DEX|CON|INT|WIS|CHA|FORT|REFLEX|WILL):[+-]?\d+\}/g;

function updateRoomParam(roomCode: string | null): void {
  const url = new URL(window.location.href);
  if (roomCode) {
    url.searchParams.set('room', roomCode);
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

function isWorkspaceWindowId(value: string): value is WorkspaceWindowId {
  return (WINDOW_IDS as readonly string[]).includes(value);
}

function normalizeWorkspaceLayout(layout: WorkspaceLayout | undefined): WorkspaceLayout {
  if (!layout) {
    return {
      locked: DEFAULT_LAYOUT.locked,
      leftOrder: [...DEFAULT_LAYOUT.leftOrder],
      rightOrder: [...DEFAULT_LAYOUT.rightOrder],
      windowsResizable: DEFAULT_LAYOUT.windowsResizable,
      columnSplit: DEFAULT_LAYOUT.columnSplit,
      sizesLocked: DEFAULT_LAYOUT.sizesLocked,
      windowWidths: { ...(DEFAULT_LAYOUT.windowWidths ?? {}) },
      windowHeights: { ...(DEFAULT_LAYOUT.windowHeights ?? {}) }
    };
  }

  const dedupe = (items: string[]): WorkspaceWindowId[] => {
    const result: WorkspaceWindowId[] = [];
    for (const item of items) {
      if (!isWorkspaceWindowId(item)) {
        continue;
      }
      if (!result.includes(item)) {
        result.push(item);
      }
    }
    return result;
  };

  const left = dedupe(Array.isArray(layout.leftOrder) ? layout.leftOrder : []);
  const right = dedupe(Array.isArray(layout.rightOrder) ? layout.rightOrder : []).filter((id) => !left.includes(id));
  const fallbackLeft = DEFAULT_LAYOUT.leftOrder.filter((id): id is WorkspaceWindowId => isWorkspaceWindowId(id) && !right.includes(id));
  const resolvedLeft: WorkspaceWindowId[] = left.length > 0 ? left : fallbackLeft;
  const merged = new Set<WorkspaceWindowId>([...resolvedLeft, ...right]);
  const missing = WINDOW_IDS.filter((id) => !merged.has(id));
  const rawSplit = typeof layout.columnSplit === 'number' && Number.isFinite(layout.columnSplit) ? layout.columnSplit : DEFAULT_LAYOUT.columnSplit ?? 45;
  const safeSplit = Math.max(30, Math.min(70, Math.round(rawSplit)));
  const rawWidths = layout.windowWidths && typeof layout.windowWidths === 'object' ? layout.windowWidths : {};
  const rawHeights = layout.windowHeights && typeof layout.windowHeights === 'object' ? layout.windowHeights : {};
  const safeWidths = Object.fromEntries(
    Object.entries(rawWidths).filter(
      ([key, value]) =>
        isWorkspaceWindowId(key) && typeof value === 'number' && Number.isFinite(value) && value >= 35 && value <= 100
    )
  );
  const safeHeights = Object.fromEntries(
    Object.entries(rawHeights).filter(
      ([key, value]) =>
        isWorkspaceWindowId(key) && typeof value === 'number' && Number.isFinite(value) && value >= 180 && value <= 900
    )
  );

  return {
    locked: layout.locked ?? true,
    leftOrder: resolvedLeft,
    rightOrder: [...right, ...missing],
    windowsResizable: layout.windowsResizable ?? DEFAULT_LAYOUT.windowsResizable ?? false,
    columnSplit: safeSplit,
    sizesLocked: layout.sizesLocked ?? DEFAULT_LAYOUT.sizesLocked ?? false,
    windowWidths: safeWidths,
    windowHeights: safeHeights
  };
}

function moveWindow(layout: WorkspaceLayout, windowId: WorkspaceWindowId, targetColumn: WorkspaceColumn, targetIndex: number): WorkspaceLayout {
  const sourceColumn: WorkspaceColumn = layout.leftOrder.includes(windowId) ? 'left' : 'right';
  const sourceOrder = sourceColumn === 'left' ? layout.leftOrder : layout.rightOrder;
  const sourceIndex = sourceOrder.indexOf(windowId);

  const leftOrder = layout.leftOrder.filter((id) => id !== windowId);
  const rightOrder = layout.rightOrder.filter((id) => id !== windowId);

  const target = targetColumn === 'left' ? leftOrder : rightOrder;
  let safeIndex = Math.max(0, Math.min(targetIndex, target.length));

  if (sourceColumn === targetColumn && sourceIndex > -1 && sourceIndex < safeIndex) {
    safeIndex -= 1;
  }

  target.splice(safeIndex, 0, windowId);

  return {
    ...layout,
    leftOrder,
    rightOrder
  };
}

function columnForWindow(layout: WorkspaceLayout, windowId: WorkspaceWindowId): WorkspaceColumn {
  return layout.leftOrder.includes(windowId) ? 'left' : 'right';
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function clampWindowWidth(value: number): number {
  return Math.max(35, Math.min(100, Math.round(value)));
}

function clampWindowHeight(value: number): number {
  return Math.max(180, Math.min(900, Math.round(value)));
}

function resolveDensity(width: number): WindowDensity {
  if (width <= 360) {
    return 'tiny';
  }
  if (width <= 520) {
    return 'compact';
  }
  return 'regular';
}

function computeDropIndexFromPointer(columnEl: HTMLDivElement, clientX: number, clientY: number): number {
  const cells = Array.from(columnEl.querySelectorAll<HTMLElement>(':scope > .workspace-cell'));
  if (cells.length === 0) {
    return 0;
  }

  for (let index = 0; index < cells.length; index += 1) {
    const rect = cells[index].getBoundingClientRect();
    if (clientY < rect.top) {
      return index;
    }

    if (clientY <= rect.bottom) {
      if (clientX < rect.left + rect.width / 2) {
        return index;
      }
      if (clientX <= rect.right) {
        return index + 1;
      }
    }
  }

  return cells.length;
}

function getModifierTotal(modifiers: CharacterModifiers, key: ModifierRefKey): number {
  if (key === 'fort' || key === 'reflex' || key === 'will') {
    return modifiers.saves[key].base + modifiers.saves[key].temp;
  }
  return modifiers.stats[key].base + modifiers.stats[key].temp;
}

function buildModifierToken(key: ModifierRefKey, modifiers: CharacterModifiers): string {
  const label = MODIFIER_KEY_TO_LABEL[key];
  return `{${label}:${formatSigned(getModifierTotal(modifiers, key))}}`;
}

function refreshModifierTokens(formula: string, modifiers: CharacterModifiers): string {
  return formula.replace(MODIFIER_TOKEN_REGEX, (_token, label: string) => {
    const key = MODIFIER_LABEL_TO_KEY[label];
    if (!key) {
      return _token;
    }
    return buildModifierToken(key, modifiers);
  });
}

function resolveModifierTokens(formula: string, modifiers: CharacterModifiers): string {
  return formula.replace(MODIFIER_TOKEN_REGEX, (_token, label: string) => {
    const key = MODIFIER_LABEL_TO_KEY[label];
    if (!key) {
      return _token;
    }
    return `(${getModifierTotal(modifiers, key)})`;
  });
}

function appendModifierToken(formula: string, key: ModifierRefKey, modifiers: CharacterModifiers): string {
  const trimmed = formula.trim();
  const token = buildModifierToken(key, modifiers);

  if (!trimmed) {
    return token;
  }

  if (/[+\-*/(]\s*$/.test(trimmed)) {
    return `${trimmed}${token}`;
  }

  return `${trimmed}+${token}`;
}

export default function App(): JSX.Element {
  const { data, loading, error, storageKind, commit } = useAppData();
  const realtimeReady = isRealtimeConfigured();

  const [counts, setCounts] = useState<DiceCounts>(createEmptyCounts());
  const [formula, setFormula] = useState('');
  const [secretRoll, setSecretRoll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [presetOptionsId, setPresetOptionsId] = useState<string | null>(null);
  const [presetDraftName, setPresetDraftName] = useState('');
  const [presetDraftFormula, setPresetDraftFormula] = useState('');
  const [presetOptionsError, setPresetOptionsError] = useState<string | null>(null);

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [pendingAutoJoinCode, setPendingAutoJoinCode] = useState<string | null>(null);
  const [roomConnecting, setRoomConnecting] = useState(false);
  const [connectedRoomCode, setConnectedRoomCode] = useState<string | null>(null);
  const [roomEntries, setRoomEntries] = useState<RollEntry[]>([]);
  const [hasMoreRoomHistory, setHasMoreRoomHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [presenceMembers, setPresenceMembers] = useState<RoomPresenceMember[]>([]);

  const [draggingWindowId, setDraggingWindowId] = useState<WorkspaceWindowId | null>(null);
  const [dragTarget, setDragTarget] = useState<{ column: WorkspaceColumn; index: number } | null>(null);
  const [selectedWindowId, setSelectedWindowId] = useState<WorkspaceWindowId | null>(null);
  const [resizingWindowId, setResizingWindowId] = useState<WorkspaceWindowId | null>(null);
  const [windowDensities, setWindowDensities] = useState<Record<WorkspaceWindowId, WindowDensity>>({
    quickActions: 'regular',
    history: 'regular',
    presets: 'regular',
    rollComposer: 'regular'
  });

  const initializedRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const resizeSessionRef = useRef<{
    windowId: WorkspaceWindowId;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    columnWidth: number;
  } | null>(null);
  const windowCellRefs = useRef<Record<WorkspaceWindowId, HTMLDivElement | null>>({
    quickActions: null,
    history: null,
    presets: null,
    rollComposer: null
  });
  const columnRefs = useRef<Record<WorkspaceColumn, HTMLDivElement | null>>({
    left: null,
    right: null
  });

  const clearMessages = useCallback((): void => {
    setLocalError(null);
    setStatusMessage(null);
  }, []);

  const refreshAvailableRooms = useCallback(
    async (silent = false): Promise<void> => {
      if (!realtimeReady) {
        setAvailableRooms([]);
        return;
      }

      setLoadingRooms(true);
      try {
        const rooms = await fetchAvailableRooms(75);
        setAvailableRooms(rooms);
        if (!silent) {
          setStatusMessage('Room list refreshed.');
        }
      } catch (roomError) {
        if (!silent) {
          setLocalError((roomError as Error).message);
        }
      } finally {
        setLoadingRooms(false);
      }
    },
    [realtimeReady]
  );

  const leaveConnectedRoom = useCallback(
    async (silent = false): Promise<void> => {
      if (!connectedRoomCode && !channelRef.current) {
        return;
      }

      try {
        const previousCode = connectedRoomCode;
        if (channelRef.current) {
          await unsubscribeRoom(channelRef.current);
          channelRef.current = null;
        }

        if (previousCode) {
          await removeRoomMembership(previousCode);
        }

        setConnectedRoomCode(null);
        setRoomEntries([]);
        setPresenceMembers([]);
        setHasMoreRoomHistory(false);
        updateRoomParam(null);
        void refreshAvailableRooms(true);
        if (!silent) {
          setStatusMessage('Left shared room.');
        }
      } catch (leaveError) {
        setLocalError((leaveError as Error).message);
      }
    },
    [connectedRoomCode, refreshAvailableRooms]
  );

  const connectToRoom = useCallback(
    async (explicitCode?: string, silent = false): Promise<void> => {
      if (!data) {
        return;
      }
      if (!realtimeReady) {
        setLocalError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
        return;
      }

      clearMessages();

      const normalizedCode = normalizeRoomCode(explicitCode ?? data.preferences.roomCode);
      const roomCodeError = validateRoomCode(normalizedCode);
      if (roomCodeError) {
        setLocalError(roomCodeError);
        return;
      }

      const alias = normalizeAlias(data.preferences.playerAlias);
      const aliasError = validateAlias(alias);
      if (aliasError) {
        setLocalError(aliasError);
        return;
      }

      setRoomConnecting(true);

      try {
        const user = await ensureAnonymousUser();
        setAuthUserId(user.id);

        if (channelRef.current) {
          await unsubscribeRoom(channelRef.current);
          channelRef.current = null;
        }

        if (connectedRoomCode) {
          await removeRoomMembership(connectedRoomCode);
        }

        await upsertRoomMembership(normalizedCode, alias);

        const channel = await subscribeRoom({
          roomCode: normalizedCode,
          userId: user.id,
          alias,
          handlers: {
            onRoll: (entry) => {
              setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, [entry]));
            },
            onPresenceSync: (members) => {
              setPresenceMembers(members);
            },
            onPresenceEvent: () => {
              // Presence join/leave activity is intentionally hidden.
            }
          }
        });

        channelRef.current = channel;
        setConnectedRoomCode(normalizedCode);
        setPendingAutoJoinCode(null);

        const page = await fetchRoomRollPage({ roomCode: normalizedCode, limit: PAGE_SIZE });
        setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, page));
        setHasMoreRoomHistory(page.length === PAGE_SIZE);

        commit((previous) => ({
          ...previous,
          preferences: {
            ...previous.preferences,
            roomCode: normalizedCode
          }
        }));

        updateRoomParam(normalizedCode);
        void refreshAvailableRooms(true);

        if (!silent) {
          setStatusMessage(`Joined room ${normalizedCode}.`);
        }
      } catch (connectError) {
        setLocalError((connectError as Error).message);
      } finally {
        setRoomConnecting(false);
      }
    },
    [clearMessages, commit, connectedRoomCode, data, realtimeReady, refreshAvailableRooms]
  );

  const loadMoreRoomHistory = useCallback(async (): Promise<void> => {
    if (!connectedRoomCode || loadingMoreHistory || !hasMoreRoomHistory) {
      return;
    }

    setLoadingMoreHistory(true);
    try {
      const beforeCreatedAt = oldestTimestamp(roomEntries);
      const page = await fetchRoomRollPage({
        roomCode: connectedRoomCode,
        beforeCreatedAt,
        limit: PAGE_SIZE
      });

      setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, page));
      setHasMoreRoomHistory(page.length === PAGE_SIZE);
    } catch (pageError) {
      setLocalError((pageError as Error).message);
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [connectedRoomCode, hasMoreRoomHistory, loadingMoreHistory, roomEntries]);

  const syncLatestRoomEntries = useCallback(async (): Promise<void> => {
    if (!connectedRoomCode) {
      return;
    }

    try {
      const latestPage = await fetchRoomRollPage({
        roomCode: connectedRoomCode,
        limit: PAGE_SIZE
      });
      setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, latestPage));
    } catch {
      // Ignore: best-effort fallback when realtime events are missed.
    }
  }, [connectedRoomCode]);

  useEffect(() => {
    if (!data || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    setSecretRoll(data.preferences.defaultSecret);

    const share = parseShareParams(window.location.search);
    const sharedRoomCode = share.roomCode ? normalizeRoomCode(share.roomCode) : '';

    if (share.player || sharedRoomCode) {
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          playerAlias: share.player ?? previous.preferences.playerAlias,
          roomCode: sharedRoomCode || previous.preferences.roomCode
        }
      }));

      if (sharedRoomCode) {
        setPendingAutoJoinCode(sharedRoomCode);
      }

      setStatusMessage('Share context loaded from URL.');
      return;
    }

    if (data.preferences.roomCode) {
      setPendingAutoJoinCode(normalizeRoomCode(data.preferences.roomCode));
    }
  }, [commit, data]);

  useEffect(() => {
    if (!realtimeReady) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const user = await ensureAnonymousUser();
        if (!cancelled) {
          setAuthUserId(user.id);
        }
      } catch (authError) {
        if (!cancelled) {
          setLocalError((authError as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [realtimeReady]);

  useEffect(() => {
    if (!realtimeReady) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void client.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [realtimeReady]);

  useEffect(() => {
    if (!authUserId || !realtimeReady) {
      return;
    }
    void refreshAvailableRooms(true);
  }, [authUserId, connectedRoomCode, realtimeReady, refreshAvailableRooms]);

  useEffect(() => {
    if (!connectedRoomCode) {
      return;
    }

    const interval = window.setInterval(() => {
      void syncLatestRoomEntries();
    }, ROOM_SYNC_INTERVAL_MS);

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void syncLatestRoomEntries();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [connectedRoomCode, syncLatestRoomEntries]);

  useEffect(() => {
    if (!pendingAutoJoinCode || !authUserId || connectedRoomCode || roomConnecting) {
      return;
    }
    const nextCode = pendingAutoJoinCode;
    setPendingAutoJoinCode(null);
    void connectToRoom(nextCode, true);
  }, [authUserId, connectToRoom, connectedRoomCode, pendingAutoJoinCode, roomConnecting]);

  useEffect(
    () => () => {
      if (channelRef.current) {
        void unsubscribeRoom(channelRef.current);
        channelRef.current = null;
      }
      if (connectedRoomCode) {
        void removeRoomMembership(connectedRoomCode);
      }
    },
    [connectedRoomCode]
  );

  const currentBackground = useMemo(() => {
    const selected = BACKGROUNDS.find((background) => background.id === data?.preferences.backgroundId);
    if (selected) {
      return selected;
    }
    return BACKGROUNDS.find((background) => background.id === 'citadel') ?? BACKGROUNDS[0];
  }, [data?.preferences.backgroundId]);

  const visibleEntries = useMemo(() => (connectedRoomCode ? roomEntries : data?.rollHistory ?? []), [connectedRoomCode, data?.rollHistory, roomEntries]);

  const feedItems = useMemo(() => {
    if (!data) {
      return [];
    }
    return groupFeedEntries(visibleEntries, data.moderation.spamWindowMs);
  }, [data, visibleEntries]);

  const joinableRooms = useMemo(() => availableRooms.filter((room) => room.roomCode !== connectedRoomCode), [availableRooms, connectedRoomCode]);

  const workspaceLayout = useMemo(() => normalizeWorkspaceLayout(data?.workspaceLayout), [data?.workspaceLayout]);
  const workspaceGridStyle = useMemo(
    () =>
      ({
        '--workspace-left': `${workspaceLayout.columnSplit ?? 45}%`,
        '--workspace-right': `${100 - (workspaceLayout.columnSplit ?? 45)}%`
      }) as CSSProperties,
    [workspaceLayout.columnSplit]
  );
  const selectedWindowColumn = useMemo(() => {
    if (!selectedWindowId) {
      return null;
    }
    return columnForWindow(workspaceLayout, selectedWindowId);
  }, [selectedWindowId, workspaceLayout]);
  const selectedWindowWidth = useMemo(() => {
    if (!selectedWindowId) {
      return 100;
    }
    return clampWindowWidth(workspaceLayout.windowWidths?.[selectedWindowId] ?? 100);
  }, [selectedWindowId, workspaceLayout.windowWidths]);
  const selectedWindowHeight = useMemo(() => {
    if (!selectedWindowId) {
      return 360;
    }
    return clampWindowHeight(workspaceLayout.windowHeights?.[selectedWindowId] ?? 360);
  }, [selectedWindowId, workspaceLayout.windowHeights]);

  useEffect(() => {
    if (!workspaceLayout.locked) {
      return;
    }
    setResizingWindowId(null);
  }, [workspaceLayout.locked]);

  const activePresetOption = useMemo(() => {
    if (!data || !presetOptionsId) {
      return null;
    }
    return data.presets.find((preset) => preset.id === presetOptionsId) ?? null;
  }, [data, presetOptionsId]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setFormula((previous) => {
      const refreshed = refreshModifierTokens(previous, data.characterModifiers);
      return refreshed === previous ? previous : refreshed;
    });
  }, [data?.characterModifiers]);

  useEffect(() => {
    if (!presetOptionsId || !data) {
      return;
    }
    if (!data.presets.some((preset) => preset.id === presetOptionsId)) {
      setPresetOptionsId(null);
      setPresetOptionsError(null);
    }
  }, [data, presetOptionsId]);

  const runRoll = (options: {
    source: RollEntry['source'];
    useFormula?: boolean;
    forcedFormula?: string;
    forcedCounts?: DiceCounts;
    forcedSecret?: boolean;
    note?: string;
  }): void => {
    if (!data) {
      return;
    }

    clearMessages();

    const aliasError = validateAlias(data.preferences.playerAlias);
    if (aliasError) {
      setLocalError(aliasError);
      return;
    }

    const shouldUseFormula = options.useFormula ?? Boolean(options.forcedFormula);
    const finalFormula = shouldUseFormula ? options.forcedFormula ?? formula.trim() : '';
    const resolvedFormula = finalFormula ? resolveModifierTokens(finalFormula, data.characterModifiers) : '';
    const finalCounts = options.forcedCounts ?? counts;
    const finalSecret = options.forcedSecret ?? secretRoll;

    const rng = createRng(data.preferences.rngMode);

    let total = 0;
    let dicePools: RollEntry['dicePools'] = [];
    let modifier = 0;
    let normalizedFormula: string | null = null;

    try {
      if (shouldUseFormula) {
        if (!finalFormula) {
          setLocalError('Open Formula mode and enter a formula first.');
          return;
        }
        const result = evaluateFormula(resolvedFormula, rng);
        total = result.total;
        dicePools = result.dicePools;
        modifier = result.modifierTotal;
        normalizedFormula = result.parsed.normalized;
      } else {
        const countsLabel = buildCountsLabel(finalCounts);
        if (!countsLabel) {
          setLocalError('Choose at least one die quantity or enter a formula.');
          return;
        }
        const result = rollCounts(finalCounts, rng);
        total = result.total;
        dicePools = result.dicePools;
      }
    } catch (rollError) {
      setLocalError((rollError as Error).message);
      return;
    }

    const countsLabel = buildCountsLabel(finalCounts);
    const roomCode = connectedRoomCode ?? (normalizeRoomCode(data.preferences.roomCode) || 'LOCAL');
    const resolvedRoomName = connectedRoomCode ? `Room ${connectedRoomCode}` : 'Local Workspace';

    const entry: RollEntry = {
      id: createId('roll'),
      timestamp: Date.now(),
      playerAlias: normalizeAlias(data.preferences.playerAlias),
      roomName: resolvedRoomName,
      roomCode,
      secret: finalSecret,
      source: options.source,
      formula: normalizedFormula,
      modifier,
      total,
      dicePools,
      spamKey: buildSpamKey({
        playerAlias: data.preferences.playerAlias,
        roomName: resolvedRoomName,
        roomCode,
        secret: finalSecret,
        formula: normalizedFormula,
        countsLabel
      }),
      note: options.note
    };

    commit((previous) => ({
      ...previous,
      rollHistory: [entry, ...previous.rollHistory]
    }));

    if (connectedRoomCode) {
      void (async () => {
        try {
          const inserted = await insertRoomRoll({
            roomCode: connectedRoomCode,
            roomName: resolvedRoomName,
            playerAlias: normalizeAlias(data.preferences.playerAlias),
            secret: finalSecret,
            source: options.source,
            formula: normalizedFormula,
            modifier,
            total,
            dicePools,
            note: options.note
          });

          setRoomEntries((previous) => mergeRollEntriesNewestFirst(previous, [inserted]));
        } catch (publishError) {
          setLocalError(`Roll stored locally but publish failed: ${(publishError as Error).message}`);
        }
      })();
    }

    setStatusMessage(connectedRoomCode ? 'Roll published to shared room.' : 'Roll recorded locally.');
  };

  const insertFormulaModifier = useCallback((key: ModifierRefKey, label: string): void => {
    if (!data) {
      return;
    }
    const total = getModifierTotal(data.characterModifiers, key);

    setFormula((previous) => {
      const refreshed = refreshModifierTokens(previous, data.characterModifiers);
      return appendModifierToken(refreshed, key, data.characterModifiers);
    });
    setStatusMessage(`${label} ${formatSigned(total)} inserted into formula.`);
    setLocalError(null);
  }, [data]);

  const setLayoutLocked = useCallback(
    (locked: boolean): void => {
      commit((previous) => ({
        ...previous,
        workspaceLayout: {
          ...normalizeWorkspaceLayout(previous.workspaceLayout),
          locked
        }
      }));
    },
    [commit]
  );

  const setWindowsResizable = useCallback(
    (enabled: boolean): void => {
      commit((previous) => ({
        ...previous,
        workspaceLayout: {
          ...normalizeWorkspaceLayout(previous.workspaceLayout),
          windowsResizable: enabled
        }
      }));
    },
    [commit]
  );

  const setSizesLocked = useCallback(
    (locked: boolean): void => {
      commit((previous) => ({
        ...previous,
        workspaceLayout: {
          ...normalizeWorkspaceLayout(previous.workspaceLayout),
          sizesLocked: locked
        }
      }));
    },
    [commit]
  );

  const setColumnSplit = useCallback(
    (nextValue: number): void => {
      commit((previous) => ({
        ...previous,
        workspaceLayout: {
          ...normalizeWorkspaceLayout(previous.workspaceLayout),
          columnSplit: Math.max(30, Math.min(70, Math.round(nextValue)))
        }
      }));
    },
    [commit]
  );

  const setColumnSplitPreset = useCallback(
    (leftPercent: number): void => {
      setColumnSplit(leftPercent);
    },
    [setColumnSplit]
  );

  const resetWorkspaceLayout = useCallback((): void => {
    commit((previous) => ({
      ...previous,
      workspaceLayout: {
        locked: DEFAULT_LAYOUT.locked,
        leftOrder: [...DEFAULT_LAYOUT.leftOrder],
        rightOrder: [...DEFAULT_LAYOUT.rightOrder],
        windowsResizable: DEFAULT_LAYOUT.windowsResizable,
        columnSplit: DEFAULT_LAYOUT.columnSplit,
        sizesLocked: DEFAULT_LAYOUT.sizesLocked,
        windowWidths: { ...(DEFAULT_LAYOUT.windowWidths ?? {}) },
        windowHeights: { ...(DEFAULT_LAYOUT.windowHeights ?? {}) }
      }
    }));
    setStatusMessage('Window layout reset to defaults.');
    setLocalError(null);
  }, [commit]);

  const autoBalanceBlocks = useCallback((): void => {
    commit((previous) => {
      const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
      const widths = { ...(normalized.windowWidths ?? {}) };

      const assignForColumn = (ids: WorkspaceWindowId[]): void => {
        if (ids.length === 0) {
          return;
        }
        if (ids.length === 1) {
          widths[ids[0]] = 100;
          return;
        }
        if (ids.length === 2) {
          widths[ids[0]] = 50;
          widths[ids[1]] = 50;
          return;
        }

        ids.forEach((id, index) => {
          widths[id] = index % 3 === 2 ? 100 : 50;
        });
      };

      assignForColumn(normalized.leftOrder.filter(isWorkspaceWindowId));
      assignForColumn(normalized.rightOrder.filter(isWorkspaceWindowId));

      return {
        ...previous,
        workspaceLayout: {
          ...normalized,
          windowWidths: widths
        }
      };
    });
    setStatusMessage('Blocks auto-balanced.');
    setLocalError(null);
  }, [commit]);

  const moveWindowInLayout = useCallback(
    (windowId: WorkspaceWindowId, targetColumn: WorkspaceColumn, targetIndex: number): void => {
      commit((previous) => {
        const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
        const moved = moveWindow(normalized, windowId, targetColumn, targetIndex);
        const widths = { ...(normalized.windowWidths ?? {}) };
        const targetOrder = targetColumn === 'left' ? moved.leftOrder : moved.rightOrder;
        const siblingCount = targetOrder.length;
        const currentWidth = typeof widths[windowId] === 'number' ? widths[windowId] : 100;

        // If users place multiple windows in the same column flow, shrink the moved one to fit side-by-side.
        widths[windowId] = siblingCount >= 2 ? clampWindowWidth(Math.min(currentWidth, 48)) : 100;

        return {
          ...previous,
          workspaceLayout: {
            ...moved,
            windowWidths: widths
          }
        };
      });
    },
    [commit]
  );

  const rowPeerWindowIds = useCallback(
    (windowId: WorkspaceWindowId): WorkspaceWindowId[] => {
      const target = windowCellRefs.current[windowId];
      if (!target) {
        return [];
      }

      const column = columnForWindow(workspaceLayout, windowId);
      const orderedIds = (column === 'left' ? workspaceLayout.leftOrder : workspaceLayout.rightOrder).filter(isWorkspaceWindowId);
      const targetRect = target.getBoundingClientRect();

      return orderedIds.filter((candidateId) => {
        if (candidateId === windowId) {
          return false;
        }
        const candidate = windowCellRefs.current[candidateId];
        if (!candidate) {
          return false;
        }
        const candidateRect = candidate.getBoundingClientRect();
        return Math.abs(candidateRect.top - targetRect.top) <= 14;
      });
    },
    [workspaceLayout]
  );

  const updateWindowWidth = useCallback(
    (windowId: WorkspaceWindowId, width: number): void => {
      const peers = rowPeerWindowIds(windowId);
      commit((previous) => {
        const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
        const activePeers = peers.filter((peer) => {
          const peerColumn = columnForWindow(normalized, peer);
          const sourceColumn = columnForWindow(normalized, windowId);
          return peerColumn === sourceColumn;
        });
        const peerCount = activePeers.length;
        return {
          ...previous,
          workspaceLayout: {
            ...normalized,
            windowWidths: (() => {
              const widths = {
                ...(normalized.windowWidths ?? {})
              };

              if (peerCount > 0) {
                const maxTarget = 100 - peerCount * 35;
                if (maxTarget >= 35) {
                  const targetWidth = Math.max(35, Math.min(maxTarget, clampWindowWidth(width)));
                  widths[windowId] = targetWidth;

                  if (peerCount === 1) {
                    widths[activePeers[0]] = 100 - targetWidth;
                  } else {
                    const remaining = 100 - targetWidth;
                    const ratioSource = activePeers.map((peerId) => clampWindowWidth(widths[peerId] ?? Math.floor(remaining / peerCount)));
                    const ratioSum = ratioSource.reduce((sum, value) => sum + value, 0) || peerCount;
                    let distributed = 0;

                    activePeers.forEach((peerId, index) => {
                      if (index === activePeers.length - 1) {
                        widths[peerId] = Math.max(35, remaining - distributed);
                        return;
                      }
                      const rawShare = Math.round((ratioSource[index] / ratioSum) * remaining);
                      const nextShare = Math.max(35, rawShare);
                      widths[peerId] = nextShare;
                      distributed += nextShare;
                    });
                  }
                  return widths;
                }
              }

              widths[windowId] = clampWindowWidth(width);
              return widths;
            })()
          }
        };
      });
    },
    [commit, rowPeerWindowIds]
  );

  const adjustWindowWidth = useCallback(
    (windowId: WorkspaceWindowId, delta: number): void => {
      const currentWidth = clampWindowWidth(workspaceLayout.windowWidths?.[windowId] ?? 100);
      updateWindowWidth(windowId, clampWindowWidth(currentWidth + delta));
    },
    [updateWindowWidth, workspaceLayout.windowWidths]
  );

  const updateWindowHeight = useCallback(
    (windowId: WorkspaceWindowId, height: number): void => {
      commit((previous) => {
        const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
        return {
          ...previous,
          workspaceLayout: {
            ...normalized,
            windowHeights: {
              ...(normalized.windowHeights ?? {}),
              [windowId]: clampWindowHeight(height)
            }
          }
        };
      });
    },
    [commit]
  );

  const adjustWindowHeight = useCallback(
    (windowId: WorkspaceWindowId, delta: number): void => {
      const currentHeight = clampWindowHeight(workspaceLayout.windowHeights?.[windowId] ?? 360);
      updateWindowHeight(windowId, clampWindowHeight(currentHeight + delta));
    },
    [updateWindowHeight, workspaceLayout.windowHeights]
  );

  const onCornerResizeStart =
    (windowId: WorkspaceWindowId) =>
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (workspaceLayout.locked || !workspaceLayout.windowsResizable || workspaceLayout.sizesLocked || !event.isPrimary) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedWindowId(windowId);

      const cell = windowCellRefs.current[windowId];
      const columnEl = cell?.parentElement as HTMLDivElement | null;
      const columnWidth = columnEl?.getBoundingClientRect().width ?? cell?.getBoundingClientRect().width ?? 1;

      resizeSessionRef.current = {
        windowId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: clampWindowWidth(workspaceLayout.windowWidths?.[windowId] ?? 100),
        startHeight: clampWindowHeight(workspaceLayout.windowHeights?.[windowId] ?? 360),
        columnWidth
      };

      setResizingWindowId(windowId);
    };

  const nudgeWindow = useCallback(
    (column: WorkspaceColumn, windowId: WorkspaceWindowId, direction: 'backward' | 'forward'): void => {
      commit((previous) => {
        const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
        const order = column === 'left' ? [...normalized.leftOrder] : [...normalized.rightOrder];
        const index = order.indexOf(windowId);
        if (index < 0) {
          return previous;
        }

        const targetIndex = direction === 'backward' ? Math.max(0, index - 1) : Math.min(order.length - 1, index + 1);
        if (targetIndex === index) {
          return previous;
        }

        order.splice(index, 1);
        order.splice(targetIndex, 0, windowId);

        return {
          ...previous,
          workspaceLayout: {
            ...normalized,
            leftOrder: column === 'left' ? order : normalized.leftOrder,
            rightOrder: column === 'right' ? order : normalized.rightOrder
          }
        };
      });
    },
    [commit]
  );

  const moveWindowToOtherColumn = useCallback(
    (column: WorkspaceColumn, windowId: WorkspaceWindowId): void => {
      const targetColumn: WorkspaceColumn = column === 'left' ? 'right' : 'left';
      const targetOrder = targetColumn === 'left' ? workspaceLayout.leftOrder : workspaceLayout.rightOrder;
      moveWindowInLayout(windowId, targetColumn, targetOrder.length);
    },
    [moveWindowInLayout, workspaceLayout.leftOrder, workspaceLayout.rightOrder]
  );

  const onWindowDragStart =
    (windowId: WorkspaceWindowId) =>
    (event: DragEvent<HTMLDivElement>): void => {
      if (workspaceLayout.locked) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, select, textarea, a, label, summary, [role="button"]')) {
        event.preventDefault();
        return;
      }

      setSelectedWindowId(windowId);
      setDraggingWindowId(windowId);
      setDragTarget(null);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', windowId);
    };

  const onWindowDragEnd = (): void => {
    setDraggingWindowId(null);
    setDragTarget(null);
  };

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observers: ResizeObserver[] = [];
    const updateDensity = (windowId: WorkspaceWindowId, width: number): void => {
      const next = resolveDensity(width);
      setWindowDensities((previous) => (previous[windowId] === next ? previous : { ...previous, [windowId]: next }));
    };

    for (const windowId of WINDOW_IDS) {
      const element = windowCellRefs.current[windowId];
      if (!element) {
        continue;
      }
      updateDensity(windowId, element.getBoundingClientRect().width);

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        updateDensity(windowId, entry.contentRect.width);
      });
      observer.observe(element);
      observers.push(observer);
    }

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [workspaceLayout]);

  useEffect(() => {
    if (!resizingWindowId || workspaceLayout.locked || !workspaceLayout.windowsResizable || workspaceLayout.sizesLocked) {
      return;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }

      const deltaX = event.clientX - session.startX;
      const deltaY = event.clientY - session.startY;
      const widthDeltaPercent = (deltaX / Math.max(session.columnWidth, 1)) * 100;

      updateWindowWidth(session.windowId, clampWindowWidth(session.startWidth + widthDeltaPercent));
      updateWindowHeight(session.windowId, clampWindowHeight(session.startHeight + deltaY));
    };

    const endResize = (): void => {
      setResizingWindowId(null);
      resizeSessionRef.current = null;
      document.body.classList.remove('layout-pointer-resizing');
    };

    const handlePointerUp = (): void => {
      endResize();
    };

    const handlePointerCancel = (): void => {
      endResize();
    };

    document.body.classList.add('layout-pointer-resizing');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      document.body.classList.remove('layout-pointer-resizing');
    };
  }, [
    resizingWindowId,
    updateWindowHeight,
    updateWindowWidth,
    workspaceLayout.locked,
    workspaceLayout.sizesLocked,
    workspaceLayout.windowsResizable
  ]);

  const onWindowKeyDown =
    (column: WorkspaceColumn, windowId: WorkspaceWindowId) =>
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (workspaceLayout.locked || !event.altKey) {
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        nudgeWindow(column, windowId, 'backward');
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        nudgeWindow(column, windowId, 'forward');
        return;
      }

      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        moveWindowToOtherColumn(column, windowId);
      }
    };

  const onColumnDragOver =
    (column: WorkspaceColumn) =>
    (event: DragEvent<HTMLDivElement>): void => {
      if (workspaceLayout.locked) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const dropIndex = computeDropIndexFromPointer(event.currentTarget, event.clientX, event.clientY);
      setDragTarget((previous) => {
        if (previous && previous.column === column && previous.index === dropIndex) {
          return previous;
        }
        return {
          column,
          index: dropIndex
        };
      });
    };

  const onColumnDrop =
    (column: WorkspaceColumn) =>
    (event: DragEvent<HTMLDivElement>): void => {
      if (workspaceLayout.locked) {
        return;
      }
      event.preventDefault();

      const transfer = event.dataTransfer.getData('text/plain');
      const dragged = isWorkspaceWindowId(transfer) ? transfer : draggingWindowId;
      if (!dragged) {
        setDragTarget(null);
        return;
      }

      const fallbackIndex = computeDropIndexFromPointer(event.currentTarget, event.clientX, event.clientY);
      const resolvedIndex =
        dragTarget && dragTarget.column === column
          ? dragTarget.index
          : fallbackIndex;
      moveWindowInLayout(dragged, column, resolvedIndex);
      setDraggingWindowId(null);
      setDragTarget(null);
    };

  const onColumnDragLeave =
    (column: WorkspaceColumn) =>
    (event: DragEvent<HTMLDivElement>): void => {
      const related = event.relatedTarget as Node | null;
      if (related && event.currentTarget.contains(related)) {
        return;
      }
      setDragTarget((previous) => (previous && previous.column === column ? null : previous));
    };

  useEffect(() => {
    if (workspaceLayout.locked || !selectedWindowId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }

      const column = columnForWindow(workspaceLayout, selectedWindowId);

      if (event.altKey && event.shiftKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          adjustWindowWidth(selectedWindowId, -5);
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          adjustWindowWidth(selectedWindowId, 5);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          adjustWindowHeight(selectedWindowId, -20);
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          adjustWindowHeight(selectedWindowId, 20);
          return;
        }
      }

      if (event.altKey && event.key === '[') {
        event.preventDefault();
        nudgeWindow(column, selectedWindowId, 'backward');
        return;
      }

      if (event.altKey && event.key === ']') {
        event.preventDefault();
        nudgeWindow(column, selectedWindowId, 'forward');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    adjustWindowHeight,
    adjustWindowWidth,
    nudgeWindow,
    selectedWindowId,
    workspaceLayout,
    workspaceLayout.locked
  ]);

  useEffect(() => {
    if (loading || !data) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }

      if (event.repeat) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runRoll({ source: formula.trim() ? 'formula' : 'manual', useFormula: Boolean(formula.trim()) });
        return;
      }

      if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (event.key === '1') {
        event.preventDefault();
        runRoll({ source: 'quick', useFormula: true, forcedFormula: '1d20', forcedSecret: false, note: 'Quick 1d20' });
        return;
      }

      if (event.key === '2') {
        event.preventDefault();
        runRoll({ source: 'quick', useFormula: true, forcedFormula: '1d20', forcedSecret: true, note: 'Quick secret 1d20' });
        return;
      }

      if (event.key === '3') {
        event.preventDefault();
        const template = rollRandomBatchTemplate(createRng(data.preferences.rngMode));
        runRoll({ source: 'quick', forcedCounts: template, forcedFormula: '', note: 'Random batch' });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data, formula, loading, runRoll]);

  if (loading || !data) {
    return <main className="app-shell">Loading workspace...</main>;
  }

  const canPaginateRoomHistory = !!connectedRoomCode;

  const openPresetOptions = (presetId: string): void => {
    const selected = data.presets.find((preset) => preset.id === presetId);
    if (!selected) {
      return;
    }
    setPresetOptionsError(null);
    setPresetOptionsId(selected.id);
    setPresetDraftName(selected.name);
    setPresetDraftFormula(selected.formula);
  };

  const switchPresetOptions = (presetId: string): void => {
    const selected = data.presets.find((preset) => preset.id === presetId);
    if (!selected) {
      return;
    }
    setPresetOptionsError(null);
    setPresetOptionsId(selected.id);
    setPresetDraftName(selected.name);
    setPresetDraftFormula(selected.formula);
  };

  const renderPresetsPanel = (className?: string): JSX.Element => (
    <PresetsPanel
      className={className}
      density={windowDensities.presets}
      presets={data.presets}
      onCreate={(name) => {
        clearMessages();
        try {
          commit((previous) => ({
            ...previous,
            presets: createPreset(previous.presets, {
              name,
              counts,
              formula,
              secret: secretRoll
            })
          }));
          setStatusMessage('Preset created.');
        } catch (presetError) {
          setLocalError((presetError as Error).message);
        }
      }}
      onOpenOptions={openPresetOptions}
      onApply={(presetId) => {
        clearMessages();
        try {
          const preset = applyPreset(data.presets, presetId);
          setCounts({ ...preset.counts });
          setFormula(preset.formula);
          setSecretRoll(preset.secret);
          setStatusMessage(`Preset "${preset.name}" applied.`);
        } catch (applyError) {
          setLocalError((applyError as Error).message);
        }
      }}
    />
  );

  const updateStatBase = (key: StatKey, value: number): void => {
    commit((previous) => ({
      ...previous,
      characterModifiers: {
        ...previous.characterModifiers,
        stats: {
          ...previous.characterModifiers.stats,
          [key]: {
            ...previous.characterModifiers.stats[key],
            base: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }
    }));
  };

  const updateStatTemp = (key: StatKey, value: number): void => {
    commit((previous) => ({
      ...previous,
      characterModifiers: {
        ...previous.characterModifiers,
        stats: {
          ...previous.characterModifiers.stats,
          [key]: {
            ...previous.characterModifiers.stats[key],
            temp: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }
    }));
  };

  const updateSaveBase = (key: SaveKey, value: number): void => {
    commit((previous) => ({
      ...previous,
      characterModifiers: {
        ...previous.characterModifiers,
        saves: {
          ...previous.characterModifiers.saves,
          [key]: {
            ...previous.characterModifiers.saves[key],
            base: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }
    }));
  };

  const updateSaveTemp = (key: SaveKey, value: number): void => {
    commit((previous) => ({
      ...previous,
      characterModifiers: {
        ...previous.characterModifiers,
        saves: {
          ...previous.characterModifiers.saves,
          [key]: {
            ...previous.characterModifiers.saves[key],
            temp: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }
    }));
  };

  const modifiersPanel = (
    <ModifierToolkitPanel
      modifiers={data.characterModifiers}
      onStatBaseChange={updateStatBase}
      onStatTempChange={updateStatTemp}
      onSaveBaseChange={updateSaveBase}
      onSaveTempChange={updateSaveTemp}
    />
  );

  const roomPanel = (
    <PlayerRoomPanel
      playerAlias={data.preferences.playerAlias}
      defaultSecret={data.preferences.defaultSecret}
      roomCode={data.preferences.roomCode}
      connectedRoomCode={connectedRoomCode}
      authUserId={authUserId}
      realtimeReady={realtimeReady}
      connecting={roomConnecting}
      members={presenceMembers}
      availableRooms={joinableRooms}
      loadingRooms={loadingRooms}
      onPlayerAliasChange={(value) =>
        commit((previous) => ({
          ...previous,
          preferences: {
            ...previous.preferences,
            playerAlias: value.replace(/[^A-Za-z0-9 _'\-]/g, '').slice(0, 24)
          }
        }))
      }
      onDefaultSecretChange={(value) => {
        setSecretRoll(value);
        commit((previous) => ({
          ...previous,
          preferences: {
            ...previous.preferences,
            defaultSecret: value
          }
        }));
      }}
      onRoomCodeChange={(value) =>
        commit((previous) => ({
          ...previous,
          preferences: {
            ...previous.preferences,
            roomCode: normalizeRoomCode(value)
          }
        }))
      }
      onSelectExistingRoom={(roomCode) => {
        commit((previous) => ({
          ...previous,
          preferences: {
            ...previous.preferences,
            roomCode
          }
        }));
        void connectToRoom(roomCode);
      }}
      onRefreshRooms={() => {
        void refreshAvailableRooms();
      }}
      onJoin={() => {
        void connectToRoom();
      }}
      onLeave={() => {
        void leaveConnectedRoom();
      }}
    />
  );

  const windowContent: Record<WorkspaceWindowId, JSX.Element> = {
    presets: renderPresetsPanel('presets-emphasis'),
    quickActions: (
      <QuickActions
        density={windowDensities.quickActions}
        onRollPublicD20={() => runRoll({ source: 'quick', useFormula: true, forcedFormula: '1d20', forcedSecret: false, note: 'Quick 1d20' })}
        onRollSecretD20={() => runRoll({ source: 'quick', useFormula: true, forcedFormula: '1d20', forcedSecret: true, note: 'Quick secret 1d20' })}
        onRollRandomBatch={() => {
          const template = rollRandomBatchTemplate(createRng(data.preferences.rngMode));
          runRoll({ source: 'quick', forcedCounts: template, forcedFormula: '', note: 'Random batch' });
        }}
      />
    ),
    rollComposer: (
      <RollComposer
        density={windowDensities.rollComposer}
        counts={counts}
        formula={formula}
        modifiers={data.characterModifiers}
        secretRoll={secretRoll}
        onCountChange={(sides, value) => {
          setCounts((previous) => ({
            ...previous,
            [sides]: sanitizePositiveInt(value, 1000)
          }));
        }}
        onFormulaChange={(value) => {
          setFormula(value);
        }}
        onInsertModifier={insertFormulaModifier}
        onSecretRollChange={(value) => setSecretRoll(value)}
        onRoll={() => runRoll({ source: 'manual', useFormula: false })}
        onRollFormula={() => runRoll({ source: 'formula', useFormula: true })}
        onReset={() => {
          setCounts(createEmptyCounts());
          setFormula('');
          setSecretRoll(data.preferences.defaultSecret);
          setStatusMessage('Inputs reset.');
          setLocalError(null);
        }}
      />
    ),
    history: (
      <HistoryFeed
        density={windowDensities.history}
        items={feedItems}
        mutedAliases={[]}
        hasMore={canPaginateRoomHistory && hasMoreRoomHistory}
        loadingMore={loadingMoreHistory}
        onLoadMore={() => {
          void loadMoreRoomHistory();
        }}
      />
    )
  };

  const renderColumn = (column: WorkspaceColumn): JSX.Element => {
    const orderedIds = (column === 'left' ? workspaceLayout.leftOrder : workspaceLayout.rightOrder).filter(isWorkspaceWindowId);

    return (
      <div
        ref={(element) => {
          columnRefs.current[column] = element;
        }}
        className={`workspace-column ${dragTarget?.column === column ? 'drag-target-column' : ''}`}
        data-column={column}
        onDragOver={onColumnDragOver(column)}
        onDrop={onColumnDrop(column)}
        onDragLeave={onColumnDragLeave(column)}
      >
        {!workspaceLayout.locked && dragTarget?.column === column && dragTarget.index === 0 ? <div className="drop-indicator" aria-hidden="true" /> : null}

        {orderedIds.map((windowId, index) => {
          const width = clampWindowWidth(workspaceLayout.windowWidths?.[windowId] ?? 100);
          const height = clampWindowHeight(workspaceLayout.windowHeights?.[windowId] ?? 360);
          const density = windowDensities[windowId] ?? 'regular';
          const canEditWidth = workspaceLayout.windowsResizable && !workspaceLayout.sizesLocked;
          return (
            <div
              ref={(element) => {
                windowCellRefs.current[windowId] = element;
              }}
              key={windowId}
              className={`workspace-cell ${workspaceLayout.windowsResizable ? 'sizing-mode' : ''} ${selectedWindowId === windowId ? 'selected-cell' : ''}`}
              style={
                {
                  '--window-width': `${width}%`,
                  '--window-height': `${height}px`
                } as CSSProperties
              }
              data-density={density}
            >
              <div
                className={`workspace-window window-${windowId} ${workspaceLayout.locked ? 'locked' : 'unlocked'} ${draggingWindowId === windowId ? 'dragging' : ''} ${selectedWindowId === windowId ? 'editing-active' : ''} ${resizingWindowId === windowId ? 'resizing' : ''}`}
                draggable={!workspaceLayout.locked}
                onDragStart={onWindowDragStart(windowId)}
                onDragEnd={onWindowDragEnd}
                onMouseDown={() => {
                  setSelectedWindowId(windowId);
                }}
                onFocus={() => {
                  setSelectedWindowId(windowId);
                }}
                tabIndex={workspaceLayout.locked ? undefined : 0}
                onKeyDown={onWindowKeyDown(column, windowId)}
                aria-label={`${windowId} window. Drag the window to move it, Alt+Arrow to reorder, Alt+M to move column.`}
              >
                {!workspaceLayout.locked ? (
                  <div className="window-handle">
                    <span className="window-size-pill" aria-label={`${windowId} width ${width}% and height ${height}px`}>
                      {width}% x {height}
                    </span>

                    <div className="window-handle-actions">
                      <button
                        type="button"
                        className="window-handle-btn"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          nudgeWindow(column, windowId, 'backward');
                        }}
                        aria-label={`Move ${windowId} earlier`}
                        title="Move earlier"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="window-handle-btn"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          nudgeWindow(column, windowId, 'forward');
                        }}
                        aria-label={`Move ${windowId} later`}
                        title="Move later"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="window-handle-btn"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          moveWindowToOtherColumn(column, windowId);
                        }}
                        aria-label={`Move ${windowId} to ${column === 'left' ? 'right' : 'left'} column`}
                        title="Move across columns"
                      >
                        ↔
                      </button>

                      {workspaceLayout.windowsResizable ? (
                        <>
                          <button
                            type="button"
                            className="window-handle-btn"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              adjustWindowWidth(windowId, -5);
                            }}
                            aria-label={`Decrease ${windowId} width`}
                            disabled={!canEditWidth}
                            title="Shrink width"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="window-handle-btn"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              adjustWindowWidth(windowId, 5);
                            }}
                            aria-label={`Increase ${windowId} width`}
                            disabled={!canEditWidth}
                            title="Grow width"
                          >
                            +
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {windowContent[windowId]}
                {!workspaceLayout.locked && workspaceLayout.windowsResizable ? (
                  <button
                    type="button"
                    className="window-corner-resizer"
                    onPointerDown={onCornerResizeStart(windowId)}
                    aria-label={`Resize ${WINDOW_LABELS[windowId]} block`}
                    title="Drag to resize block"
                    disabled={workspaceLayout.sizesLocked}
                  >
                    ⇲
                  </button>
                ) : null}
              </div>

              {!workspaceLayout.locked && dragTarget?.column === column && dragTarget.index === index + 1 ? <div className="drop-indicator" aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="app-shell" style={{ backgroundImage: currentBackground.image }}>
      <div className="overlay" />
      <div className="content">
        <header className="hero hero-shell">
          <div className="hero-main">
            <h1>Dice Workspace Roller</h1>
            <p>DnD-focused shared roller with formula helpers and movable windows.</p>
            <div className="badge-row">
              <span className="badge">Storage: {storageKind === 'opfs' ? 'OPFS file' : 'IndexedDB fallback'}</span>
              <span className="badge">Realtime: {realtimeReady ? 'Supabase enabled' : 'Not configured'}</span>
            </div>
          </div>

          <div className="hero-actions">
            <div className="hero-action-row">
              <button
                type="button"
                className="icon-btn"
                aria-label="Open background theme selector"
                aria-haspopup="dialog"
                onClick={() => setShowThemeModal(true)}
              >
                🎨
              </button>
              <button
                type="button"
                className="hero-action-btn"
                aria-label="Open stat and save modifiers"
                aria-haspopup="dialog"
                onClick={() => setShowModifiersModal(true)}
              >
                Stats & Saves
              </button>
              <button
                type="button"
                className="window-lock-btn"
                aria-label="Open layout studio"
                aria-haspopup="dialog"
                onClick={() => setShowLayoutModal(true)}
              >
                Layout Studio
              </button>
            </div>

            <button
              type="button"
              className="hero-room-btn"
              aria-label="Open player and shared room controls"
              aria-haspopup="dialog"
              onClick={() => setShowRoomModal(true)}
            >
              {connectedRoomCode
                ? `Player & Shared Room • ${connectedRoomCode} • ${presenceMembers.length} online`
                : 'Player & Shared Room'}
            </button>

            <div className="layout-status-row">
              <span className="badge">{workspaceLayout.locked ? 'Windows locked' : 'Windows unlocked'}</span>
              <span className="badge">{workspaceLayout.windowsResizable ? 'Block sizing on' : 'Block sizing off'}</span>
              <span className="badge">Columns {workspaceLayout.columnSplit}/{100 - (workspaceLayout.columnSplit ?? 45)}</span>
            </div>
          </div>
        </header>

        {(error || localError || statusMessage) && (
          <section className="panel status-panel" aria-live="polite">
            {error ? <p className="error-text">Storage error: {error}</p> : null}
            {localError ? <p className="error-text">{localError}</p> : null}
            {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
          </section>
        )}

        <div className={`workspace-grid ${showLayoutModal ? 'layout-live-preview' : ''}`.trim()} style={workspaceGridStyle}>
          {renderColumn('left')}
          {renderColumn('right')}
        </div>

        {!workspaceLayout.locked && selectedWindowId ? (
          <aside className="layout-hud panel" aria-label="Selected block controls">
            <div className="layout-hud-header">
              <strong>{WINDOW_LABELS[selectedWindowId]}</strong>
              <button
                type="button"
                className="window-handle-btn"
                onClick={() => {
                  setSelectedWindowId(null);
                }}
                aria-label="Clear selected block"
              >
                ✕
              </button>
            </div>

            <div className="layout-hud-meta">
              <span>W {selectedWindowWidth}%</span>
              <span>H {selectedWindowHeight}px</span>
              <span>{selectedWindowColumn === 'left' ? 'Left Column' : 'Right Column'}</span>
            </div>

            <div className="layout-hud-actions">
              <button
                type="button"
                onClick={() => {
                  if (!selectedWindowColumn) {
                    return;
                  }
                  nudgeWindow(selectedWindowColumn, selectedWindowId, 'backward');
                }}
                aria-label="Move selected block earlier"
              >
                ↑ Earlier
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedWindowColumn) {
                    return;
                  }
                  nudgeWindow(selectedWindowColumn, selectedWindowId, 'forward');
                }}
                aria-label="Move selected block later"
              >
                ↓ Later
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedWindowColumn) {
                    return;
                  }
                  moveWindowToOtherColumn(selectedWindowColumn, selectedWindowId);
                }}
                aria-label="Move selected block to the other column"
              >
                ↔ Other Column
              </button>
            </div>

            <p className="muted-text layout-hud-hint">Shortcuts: `Alt+Shift+Arrows` resize, `Alt+[ / ]` reorder. Use corner handle for free resize.</p>
          </aside>
        ) : null}

        {activePresetOption ? (
          <Modal title={`Preset Options: ${activePresetOption.name}`} onClose={() => setPresetOptionsId(null)} className="preset-actions-modal-shell">
            <div className="preset-actions-form">
              <label htmlFor="preset-select-edit">
                Select Preset
                <select
                  id="preset-select-edit"
                  value={activePresetOption.id}
                  onChange={(event) => {
                    switchPresetOptions(event.target.value);
                  }}
                >
                  {data.presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="preset-name-edit">
                Name
                <input
                  id="preset-name-edit"
                  value={presetDraftName}
                  onChange={(event) => {
                    setPresetDraftName(event.target.value);
                    if (presetOptionsError) {
                      setPresetOptionsError(null);
                    }
                  }}
                  maxLength={40}
                />
              </label>

              <label htmlFor="preset-formula-edit">
                Formula
                <input
                  id="preset-formula-edit"
                  value={presetDraftFormula}
                  onChange={(event) => {
                    setPresetDraftFormula(event.target.value);
                    if (presetOptionsError) {
                      setPresetOptionsError(null);
                    }
                  }}
                  placeholder="e.g. 2d20kh1+5"
                />
              </label>

              {presetOptionsError ? <p className="error-text">{presetOptionsError}</p> : null}

              <div className="row wrap gap-sm">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    clearMessages();
                    try {
                      commit((previous) => ({
                        ...previous,
                        presets: renamePreset(previous.presets, activePresetOption.id, presetDraftName).map((preset) =>
                          preset.id === activePresetOption.id
                            ? {
                                ...preset,
                                formula: presetDraftFormula.trim(),
                                updatedAt: Date.now()
                              }
                            : preset
                        )
                      }));
                      setStatusMessage('Preset updated.');
                    } catch (saveError) {
                      setPresetOptionsError((saveError as Error).message);
                    }
                  }}
                >
                  Save Changes
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    try {
                      const preset = applyPreset(data.presets, activePresetOption.id);
                      setCounts({ ...preset.counts });
                      setFormula(preset.formula);
                      setSecretRoll(preset.secret);
                      setStatusMessage(`Preset "${preset.name}" applied.`);
                    } catch (applyError) {
                      setPresetOptionsError((applyError as Error).message);
                    }
                  }}
                >
                  Apply
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    commit((previous) => ({
                      ...previous,
                      presets: updatePresetFromDraft(previous.presets, activePresetOption.id, {
                        counts,
                        formula,
                        secret: secretRoll
                      })
                    }));
                    setPresetDraftFormula(formula.trim());
                    setStatusMessage('Preset updated from current setup.');
                  }}
                >
                  Update From Current
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    const remaining = data.presets.filter((preset) => preset.id !== activePresetOption.id);
                    commit((previous) => ({
                      ...previous,
                      presets: deletePreset(previous.presets, activePresetOption.id)
                    }));
                    setStatusMessage('Preset deleted.');
                    if (remaining.length > 0) {
                      switchPresetOptions(remaining[0].id);
                    } else {
                      setPresetOptionsId(null);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </Modal>
        ) : null}

        {showThemeModal ? (
          <Modal title="Background Theme" onClose={() => setShowThemeModal(false)} className="theme-modal-shell">
            <BackgroundWidget
              currentId={data.preferences.backgroundId}
              onSelect={(id) =>
                commit((previous) => ({
                  ...previous,
                  preferences: {
                    ...previous.preferences,
                    backgroundId: id
                  }
                }))
              }
            />
          </Modal>
        ) : null}

        {showModifiersModal ? (
          <Modal title="Stat & Save Modifiers" onClose={() => setShowModifiersModal(false)} className="modifiers-modal-shell">
            {modifiersPanel}
          </Modal>
        ) : null}

        {showLayoutModal ? (
          <Modal title="Layout Studio" onClose={() => setShowLayoutModal(false)} className="layout-modal-shell">
            <section className="panel layout-studio-panel">
              <p className="panel-subtitle">
                Tune the block workspace: move panels, resize widths, and reset the entire arrangement.
              </p>
              <div className="row wrap gap-sm layout-toggle-row">
                <button type="button" className="window-lock-btn" onClick={() => setLayoutLocked(!workspaceLayout.locked)} aria-pressed={!workspaceLayout.locked}>
                  {workspaceLayout.locked ? 'Unlock Windows' : 'Lock Windows'}
                </button>
                <button
                  type="button"
                  className="window-resize-btn"
                  onClick={() => setWindowsResizable(!workspaceLayout.windowsResizable)}
                  aria-pressed={workspaceLayout.windowsResizable}
                >
                  {workspaceLayout.windowsResizable ? 'Disable Block Sizing' : 'Enable Block Sizing'}
                </button>
                <button
                  type="button"
                  className="window-resize-btn"
                  onClick={() => setSizesLocked(!workspaceLayout.sizesLocked)}
                  aria-pressed={workspaceLayout.sizesLocked}
                  disabled={!workspaceLayout.windowsResizable}
                >
                  {workspaceLayout.sizesLocked ? 'Unlock Block Sizes' : 'Lock Current Sizes'}
                </button>
                <button type="button" className="secondary-btn" onClick={resetWorkspaceLayout}>
                  Reset Windows
                </button>
              </div>

              <label htmlFor="layout-column-split-range" className="column-resize-control">
                <span>Column Split</span>
                <input
                  id="layout-column-split-range"
                  type="range"
                  min={30}
                  max={70}
                  value={workspaceLayout.columnSplit}
                  onChange={(event) => setColumnSplit(Number.parseInt(event.target.value, 10) || 45)}
                  aria-label="Resize left and right column widths"
                  disabled={workspaceLayout.sizesLocked}
                />
                <strong>{workspaceLayout.columnSplit}/{100 - (workspaceLayout.columnSplit ?? 45)}</strong>
              </label>

              <div className="layout-split-presets" role="group" aria-label="Column split presets">
                <button type="button" onClick={() => setColumnSplitPreset(35)} disabled={workspaceLayout.sizesLocked}>
                  35/65
                </button>
                <button type="button" onClick={() => setColumnSplitPreset(45)} disabled={workspaceLayout.sizesLocked}>
                  45/55
                </button>
                <button type="button" onClick={() => setColumnSplitPreset(50)} disabled={workspaceLayout.sizesLocked}>
                  50/50
                </button>
                <button type="button" onClick={() => setColumnSplitPreset(55)} disabled={workspaceLayout.sizesLocked}>
                  55/45
                </button>
                <button type="button" onClick={() => setColumnSplitPreset(65)} disabled={workspaceLayout.sizesLocked}>
                  65/35
                </button>
              </div>

              <div className="row wrap gap-sm">
                <button type="button" className="secondary-btn" onClick={autoBalanceBlocks}>
                  Auto Balance Grid
                </button>
              </div>

              <ul className="layout-hints muted-text">
                <li>Drag a window block directly to reorder it.</li>
                <li>Use the corner handle on each block to resize width and height.</li>
                <li>When two blocks share a row, resizing one automatically resizes the other.</li>
                <li>Keyboard shortcuts when unlocked: `Alt+Arrow` reorder, `Alt+M` move columns.</li>
              </ul>
            </section>
          </Modal>
        ) : null}

        {showRoomModal ? (
          <Modal title="Player & Shared Room" onClose={() => setShowRoomModal(false)} className="room-modal-shell">
            {roomPanel}
          </Modal>
        ) : null}
      </div>
    </main>
  );
}
