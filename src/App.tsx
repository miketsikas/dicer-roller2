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
import { HistoryFeed, type HistoryFilters } from './components/HistoryFeed';
import { InfoHint } from './components/InfoHint';
import { Modal } from './components/Modal';
import { ModifierToolkitPanel } from './components/ModifierToolkitPanel';
import { PlayerRoomPanel } from './components/PlayerRoomPanel';
import { PresetsPanel } from './components/PresetsPanel';
import { QuickActions } from './components/QuickActions';
import { RollComposer } from './components/RollComposer';
import { BACKGROUNDS } from './constants/backgrounds';
import { useAppData } from './hooks/useAppData';
import { buildCountsLabel, buildSpamKey, createEmptyCounts, groupFeedEntries, rollCounts, rollRandomBatchTemplate } from './lib/dice';
import { downloadTextFile } from './lib/download';
import { parseImportedSession } from './lib/exporters';
import { evaluateFormula } from './lib/formula';
import {
  cloneCharacterModifiers,
  createEmptyCharacterModifiers,
  createModifierSetup,
  deleteModifierSetup,
  getModifierSetup,
  renameModifierSetup,
  suggestModifierSetupName,
  updateModifierSetupModifiers
} from './lib/modifierSetups';
import { applyPreset, createPreset, deletePreset, renamePreset, updatePresetFromDraft } from './lib/presets';
import { createRng } from './lib/rng';
import { parseShareParams } from './lib/share';
import { createId } from './lib/uuid';
import { computeDropPlacementFromRects } from './lib/workspaceDrag';
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
import {
  DICE_SIDES,
  type AppData,
  type CharacterModifiers,
  type DiceCounts,
  type ModifierSetup,
  type RollEntry,
  type SaveKey,
  type StatKey,
  type WorkspaceLayout
} from './types';

const PAGE_SIZE = 100;
const ROOM_SYNC_INTERVAL_MS = 8_000;
const RESULT_EMPHASIS_MS = 1_350;
const MIN_WINDOW_WIDTH = 30;
const MAX_WINDOW_WIDTH = 100;
const MIN_WINDOW_HEIGHT = 180;
const MAX_WINDOW_HEIGHT = 900;

const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  searchText: '',
  mineOnly: false,
  showPublic: true,
  showSecret: true,
  formulaOnly: false
};

const WINDOW_IDS = ['presets', 'quickActions', 'rollComposer', 'history'] as const;
const WINDOW_LABELS: Record<(typeof WINDOW_IDS)[number], string> = {
  presets: 'Saved Dice Combinations',
  quickActions: 'Quick Actions',
  rollComposer: 'Dice Roller',
  history: 'Roll History'
};
const MOBILE_NAV_WINDOW_ORDER: readonly (typeof WINDOW_IDS)[number][] = ['history', 'rollComposer', 'quickActions', 'presets'];
const MOBILE_NAV_LABELS: Record<(typeof WINDOW_IDS)[number], string> = {
  history: 'History',
  rollComposer: 'Roll',
  quickActions: 'Quick',
  presets: 'Preset'
};

type WorkspaceWindowId = (typeof WINDOW_IDS)[number];
type WorkspaceColumn = 'left' | 'right';
type WindowDensity = 'regular' | 'compact' | 'tiny';
type RollHighlightKind = 'nat20' | 'nat1' | 'critical';

const LEGACY_DEFAULT_WINDOW_HEIGHTS: ReadonlyArray<Record<WorkspaceWindowId, number>> = [
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
];

const DEFAULT_WINDOW_HEIGHTS: Record<WorkspaceWindowId, number> = {
  quickActions: 338,
  history: 562,
  presets: 338,
  rollComposer: 562
};

interface GuideStep {
  id: string;
  title: string;
  description: string;
  target: () => HTMLElement | null;
  onEnter?: () => void;
}

interface RecentRollAction {
  id: string;
  label: string;
  detail: string;
  source: RollEntry['source'];
  forcedFormula?: string;
  forcedCounts?: DiceCounts;
  forcedSecret: boolean;
}

interface DesktopQuickBarPosition {
  x: number;
  y: number;
}

interface DragTargetState {
  column: WorkspaceColumn;
  index: number;
  direction: 'left' | 'right' | 'top' | 'bottom';
  anchorId?: WorkspaceWindowId;
  inlineTarget?: {
    anchorId: WorkspaceWindowId;
    side: 'left' | 'right';
    width: number;
    anchorWidth?: number;
  };
}

interface SetupTransferPayloadV1 {
  type: 'dicer.setup';
  version: 1;
  exportedAt: string;
  appData: unknown;
  composer?: {
    counts?: unknown;
    formula?: unknown;
    secretRoll?: unknown;
  };
}

const DEFAULT_LAYOUT: WorkspaceLayout = {
  locked: true,
  leftOrder: ['quickActions', 'history'],
  rightOrder: ['presets', 'rollComposer'],
  windowsResizable: false,
  columnSplit: 45,
  sizesLocked: false,
  windowWidths: {},
  windowHeights: { ...DEFAULT_WINDOW_HEIGHTS }
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

function isLegacyDefaultWindowHeights(heights: Record<string, number>): boolean {
  const entries = Object.entries(heights).filter(([key]) => isWorkspaceWindowId(key));
  if (entries.length === 0) {
    return true;
  }
  const allClassic = entries.every(([, value]) => Math.round(value) === 360);
  if (allClassic) {
    return true;
  }
  return LEGACY_DEFAULT_WINDOW_HEIGHTS.some((profile) =>
    entries.every(([key, value]) => Math.round(value) === profile[key as WorkspaceWindowId])
  );
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
  const resolvedRight: WorkspaceWindowId[] = [...right, ...missing];
  const rawSplit = typeof layout.columnSplit === 'number' && Number.isFinite(layout.columnSplit) ? layout.columnSplit : DEFAULT_LAYOUT.columnSplit ?? 45;
  const safeSplit = Math.max(30, Math.min(70, Math.round(rawSplit)));
  const rawWidths = layout.windowWidths && typeof layout.windowWidths === 'object' ? layout.windowWidths : {};
  const rawHeights = layout.windowHeights && typeof layout.windowHeights === 'object' ? layout.windowHeights : {};
  const safeWidths = Object.fromEntries(
    Object.entries(rawWidths).filter(
      ([key, value]) =>
        isWorkspaceWindowId(key) && typeof value === 'number' && Number.isFinite(value) && value >= MIN_WINDOW_WIDTH && value <= MAX_WINDOW_WIDTH
    )
  );
  const safeHeights = Object.fromEntries(
    Object.entries(rawHeights).filter(
      ([key, value]) =>
        isWorkspaceWindowId(key) && typeof value === 'number' && Number.isFinite(value) && value >= MIN_WINDOW_HEIGHT && value <= MAX_WINDOW_HEIGHT
    )
  );
  const hasCustomWidths = Object.keys(safeWidths).length > 0;
  const isDefaultOrder =
    resolvedLeft.length === DEFAULT_LAYOUT.leftOrder.length &&
    resolvedLeft.every((id, index) => id === DEFAULT_LAYOUT.leftOrder[index]) &&
    resolvedRight.length === DEFAULT_LAYOUT.rightOrder.length &&
    resolvedRight.every((id, index) => id === DEFAULT_LAYOUT.rightOrder[index]);
  const shouldApplyDefaultHeights =
    isDefaultOrder &&
    !hasCustomWidths &&
    safeSplit === (DEFAULT_LAYOUT.columnSplit ?? 45) &&
    isLegacyDefaultWindowHeights(safeHeights);
  const mergedHeights = shouldApplyDefaultHeights
    ? { ...(DEFAULT_LAYOUT.windowHeights ?? {}) }
    : {
        ...(DEFAULT_LAYOUT.windowHeights ?? {}),
        ...safeHeights
      };

  return {
    locked: layout.locked ?? true,
    leftOrder: resolvedLeft,
    rightOrder: resolvedRight,
    windowsResizable: layout.windowsResizable ?? DEFAULT_LAYOUT.windowsResizable ?? false,
    columnSplit: safeSplit,
    sizesLocked: layout.sizesLocked ?? DEFAULT_LAYOUT.sizesLocked ?? false,
    windowWidths: safeWidths,
    windowHeights: mergedHeights
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
  return Math.max(MIN_WINDOW_WIDTH, Math.min(MAX_WINDOW_WIDTH, Math.round(value)));
}

function clampWindowHeight(value: number): number {
  return Math.max(MIN_WINDOW_HEIGHT, Math.min(MAX_WINDOW_HEIGHT, Math.round(value)));
}

function applyBalancedColumnWidths(order: WorkspaceWindowId[], existingWidths: Record<string, number> | undefined): Record<string, number> {
  const next = { ...(existingWidths ?? {}) };

  for (let index = 0; index < order.length; index += 2) {
    const first = order[index];
    const second = order[index + 1];

    if (!first) {
      continue;
    }

    if (!second) {
      next[first] = 100;
      continue;
    }

    next[first] = 50;
    next[second] = 50;
  }

  return next;
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

function computeDropPlacementFromPointer(
  columnEl: HTMLDivElement,
  clientX: number,
  clientY: number,
  windowWidths: Record<string, number> | undefined,
  draggingWindowId: WorkspaceWindowId | null
): DragTargetState {
  const cells = Array.from(columnEl.querySelectorAll<HTMLElement>(':scope > .workspace-cell')).flatMap((cell, index) => {
    const windowId = cell.dataset.windowId;
    if (!windowId || !isWorkspaceWindowId(windowId)) {
      return [];
    }

    const rect = cell.getBoundingClientRect();
    return [
      {
        id: windowId,
        index,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: clampWindowWidth(windowWidths?.[windowId] ?? 100)
      }
    ];
  });

  const placement = computeDropPlacementFromRects(cells, clientX, clientY, draggingWindowId ?? undefined);
  return {
    column: columnEl.dataset.column === 'right' ? 'right' : 'left',
    index: placement.index,
    direction: placement.direction,
    anchorId: placement.anchorId && isWorkspaceWindowId(placement.anchorId) ? placement.anchorId : undefined,
    inlineTarget: placement.inlineTarget && isWorkspaceWindowId(placement.inlineTarget.anchorId)
      ? {
          anchorId: placement.inlineTarget.anchorId,
          side: placement.inlineTarget.side,
          width: placement.inlineTarget.width,
          anchorWidth: placement.inlineTarget.anchorWidth
        }
      : undefined
  };
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

function findActiveModifierSetup(data: Pick<AppData, 'modifierSetups' | 'activeModifierSetupId'>): ModifierSetup | null {
  return data.modifierSetups.find((setup) => setup.id === data.activeModifierSetupId) ?? data.modifierSetups[0] ?? null;
}

function withSelectedModifierSetup(data: AppData, setupId: string): AppData {
  const activeSetup = getModifierSetup(data.modifierSetups, setupId);
  return {
    ...data,
    activeModifierSetupId: activeSetup.id,
    characterModifiers: cloneCharacterModifiers(activeSetup.modifiers)
  };
}

function withUpdatedActiveModifierSetup(data: AppData, updater: (modifiers: CharacterModifiers) => CharacterModifiers): AppData {
  const nextModifiers = updater(cloneCharacterModifiers(data.characterModifiers));
  return {
    ...data,
    characterModifiers: nextModifiers,
    modifierSetups: updateModifierSetupModifiers(data.modifierSetups, data.activeModifierSetupId, nextModifiers)
  };
}

function isKnownDieSides(value: number): value is (typeof DICE_SIDES)[number] {
  return (DICE_SIDES as readonly number[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isSetupTransferPayload(value: unknown): value is SetupTransferPayloadV1 {
  if (!isRecord(value)) {
    return false;
  }
  return value.type === 'dicer.setup' && value.version === 1 && typeof value.exportedAt === 'string' && 'appData' in value;
}

function sanitizeImportedCounts(rawCounts: unknown): DiceCounts {
  const next = createEmptyCounts();
  if (!isRecord(rawCounts)) {
    return next;
  }

  for (const sides of DICE_SIDES) {
    const value = rawCounts[String(sides)];
    next[sides] = sanitizePositiveInt(typeof value === 'number' ? value : 0, 1000);
  }

  return next;
}

function countsFromPools(pools: RollEntry['dicePools']): DiceCounts {
  const counts = createEmptyCounts();
  for (const pool of pools) {
    if (!isKnownDieSides(pool.sides)) {
      continue;
    }
    counts[pool.sides] += pool.values.length;
  }
  return counts;
}

function deriveRecentRollActions(entries: RollEntry[], limit = 6): RecentRollAction[] {
  const actions: RecentRollAction[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.formula) {
      const normalized = entry.formula.trim();
      const key = `formula|${normalized}|${entry.secret ? 'secret' : 'public'}`;
      if (!normalized || seen.has(key)) {
        continue;
      }

      seen.add(key);
      actions.push({
        id: key,
        label: normalized,
        detail: `${entry.secret ? 'Secret' : 'Public'} formula`,
        source: entry.source,
        forcedFormula: normalized,
        forcedSecret: entry.secret
      });
    } else {
      const counts = countsFromPools(entry.dicePools);
      const countsLabel = buildCountsLabel(counts);
      if (!countsLabel) {
        continue;
      }
      const key = `counts|${countsLabel}|${entry.secret ? 'secret' : 'public'}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      actions.push({
        id: key,
        label: countsLabel,
        detail: `${entry.secret ? 'Secret' : 'Public'} dice`,
        source: entry.source,
        forcedCounts: counts,
        forcedFormula: '',
        forcedSecret: entry.secret
      });
    }

    if (actions.length >= limit) {
      break;
    }
  }

  return actions;
}

function rollHighlight(entry: RollEntry): RollHighlightKind | null {
  let hasNat20 = false;
  let hasNat1 = false;
  let hasCritical = false;

  for (const pool of entry.dicePools) {
    const values = pool.keptValues && pool.keptValues.length > 0 ? pool.keptValues : pool.values;
    if (values.length === 0) {
      continue;
    }

    if (pool.sides === 20) {
      if (values.includes(20)) {
        hasNat20 = true;
      }
      if (values.includes(1)) {
        hasNat1 = true;
      }
    }

    const maxHits = values.filter((value) => value === pool.sides).length;
    if (pool.sides >= 10 && values.length >= 2 && maxHits >= 2) {
      hasCritical = true;
    }
  }

  if (hasCritical) {
    return 'critical';
  }
  if (hasNat20) {
    return 'nat20';
  }
  if (hasNat1) {
    return 'nat1';
  }
  return null;
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
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS);

  const [showHeroMenu, setShowHeroMenu] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [guideTargetRect, setGuideTargetRect] = useState<DOMRect | null>(null);

  const [resultHighlight, setResultHighlight] = useState<RollHighlightKind | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileActiveWindow, setMobileActiveWindow] = useState<WorkspaceWindowId>('history');
  const [mobilePanelHeight, setMobilePanelHeight] = useState<number | null>(null);
  const [desktopQuickBarPinned, setDesktopQuickBarPinned] = useState(false);
  const [desktopQuickBarPosition, setDesktopQuickBarPosition] = useState<DesktopQuickBarPosition | null>(null);
  const [desktopQuickBarDragging, setDesktopQuickBarDragging] = useState(false);

  const [draggingWindowId, setDraggingWindowId] = useState<WorkspaceWindowId | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTargetState | null>(null);
  const [selectedWindowId, setSelectedWindowId] = useState<WorkspaceWindowId | null>(null);
  const [resizingWindowId, setResizingWindowId] = useState<WorkspaceWindowId | null>(null);
  const [windowDensities, setWindowDensities] = useState<Record<WorkspaceWindowId, WindowDensity>>({
    quickActions: 'regular',
    history: 'regular',
    presets: 'regular',
    rollComposer: 'regular'
  });

  const initializedRef = useRef(false);
  const resultHighlightTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
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
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const mobileBottomStackRef = useRef<HTMLDivElement | null>(null);
  const desktopQuickBarRef = useRef<HTMLDivElement | null>(null);
  const desktopQuickBarDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);
  const roomButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavButtonRefs = useRef<Record<WorkspaceWindowId, HTMLButtonElement | null>>({
    history: null,
    rollComposer: null,
    quickActions: null,
    presets: null
  });
  const panelGuideRefs = useRef<Record<WorkspaceWindowId, HTMLDivElement | null>>({
    history: null,
    rollComposer: null,
    quickActions: null,
    presets: null
  });

  const clearMessages = useCallback((): void => {
    setLocalError(null);
    setStatusMessage(null);
  }, []);

  const exportSetupJson = useCallback((): void => {
    if (!data) {
      return;
    }

    clearMessages();
    const payload: SetupTransferPayloadV1 = {
      type: 'dicer.setup',
      version: 1,
      exportedAt: new Date().toISOString(),
      appData: data,
      composer: {
        counts,
        formula,
        secretRoll
      }
    };
    const timestamp = payload.exportedAt.replace(/[:.]/g, '-');
    downloadTextFile(`dicer-setup-${timestamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
    setStatusMessage('Setup exported as JSON.');
  }, [clearMessages, counts, data, formula, secretRoll]);

  const importSetupJson = useCallback(
    async (file: File): Promise<void> => {
      if (!data) {
        return;
      }

      clearMessages();
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as unknown;

        let importedData: AppData;
        let importedCounts = counts;
        let importedFormula = formula;
        let importedSecret = secretRoll;

        if (isSetupTransferPayload(parsed)) {
          importedData = parseImportedSession(JSON.stringify(parsed.appData));
          importedCounts = sanitizeImportedCounts(parsed.composer?.counts);
          importedFormula = typeof parsed.composer?.formula === 'string' ? parsed.composer.formula : '';
          importedSecret =
            typeof parsed.composer?.secretRoll === 'boolean' ? parsed.composer.secretRoll : importedData.preferences.defaultSecret;
        } else {
          importedData = parseImportedSession(raw);
          importedCounts = createEmptyCounts();
          importedFormula = '';
          importedSecret = importedData.preferences.defaultSecret;
        }

        commit((previous) => ({
          ...previous,
          preferences: importedData.preferences,
          characterModifiers: importedData.characterModifiers,
          modifierSetups: importedData.modifierSetups,
          activeModifierSetupId: importedData.activeModifierSetupId,
          workspaceLayout: importedData.workspaceLayout,
          presets: importedData.presets
        }));
        setCounts(importedCounts);
        setFormula(importedFormula);
        setSecretRoll(importedSecret);
        setStatusMessage('Setup imported from JSON.');
      } catch (importError) {
        setLocalError(`Failed to import setup: ${(importError as Error).message}`);
      }
    },
    [clearMessages, commit, counts, data, formula, secretRoll]
  );

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
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(media.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setPrefersReducedMotion(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 779px)');
    setIsMobileViewport(media.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setIsMobileViewport(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobilePanelHeight(null);
      return;
    }

    let frameId = 0;
    const scheduleUpdate = (): void => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const gridElement = workspaceGridRef.current;
        if (!gridElement) {
          return;
        }

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const gridTop = gridElement.getBoundingClientRect().top;
        const bottomStackHeight = mobileBottomStackRef.current?.getBoundingClientRect().height ?? 0;
        const nextHeight = Math.max(260, Math.floor(viewportHeight - gridTop - bottomStackHeight - 12));
        setMobilePanelHeight((previous) => (previous === nextHeight ? previous : nextHeight));
      });
    };

    scheduleUpdate();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleUpdate());
    const contentElement = workspaceGridRef.current?.parentElement;
    if (observer) {
      if (contentElement) {
        observer.observe(contentElement);
      }
      if (mobileBottomStackRef.current) {
        observer.observe(mobileBottomStackRef.current);
      }
    }

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('scroll', scheduleUpdate);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate);
    };
  }, [error, isMobileViewport, localError, showLayoutModal, statusMessage]);

  useEffect(() => {
    if (!desktopQuickBarPinned || selectedWindowId !== 'quickActions') {
      return;
    }
    setSelectedWindowId(null);
  }, [desktopQuickBarPinned, selectedWindowId]);

  useEffect(() => {
    if (!desktopQuickBarPinned) {
      desktopQuickBarDragRef.current = null;
      setDesktopQuickBarDragging(false);
      return;
    }
    setDesktopQuickBarPosition(null);
  }, [desktopQuickBarPinned]);

  const clampDesktopQuickBarPosition = useCallback((x: number, y: number, width: number, height: number): DesktopQuickBarPosition => {
    const horizontalPadding = 12;
    const verticalPadding = 12;
    const maxX = Math.max(horizontalPadding, window.innerWidth - width - horizontalPadding);
    const maxY = Math.max(verticalPadding, window.innerHeight - height - verticalPadding);

    return {
      x: Math.round(Math.min(maxX, Math.max(horizontalPadding, x))),
      y: Math.round(Math.min(maxY, Math.max(verticalPadding, y)))
    };
  }, []);

  useEffect(() => {
    if (!desktopQuickBarPinned || !desktopQuickBarPosition) {
      return;
    }

    const clampPosition = (): void => {
      const barRect = desktopQuickBarRef.current?.getBoundingClientRect();
      if (!barRect) {
        return;
      }

      setDesktopQuickBarPosition((previous) => {
        if (!previous) {
          return previous;
        }
        const next = clampDesktopQuickBarPosition(previous.x, previous.y, barRect.width, barRect.height);
        if (next.x === previous.x && next.y === previous.y) {
          return previous;
        }
        return next;
      });
    };

    window.addEventListener('resize', clampPosition);
    window.visualViewport?.addEventListener('resize', clampPosition);

    return () => {
      window.removeEventListener('resize', clampPosition);
      window.visualViewport?.removeEventListener('resize', clampPosition);
    };
  }, [clampDesktopQuickBarPosition, desktopQuickBarPinned, desktopQuickBarPosition]);

  useEffect(() => {
    if (!isMobileViewport || !showLayoutModal) {
      return;
    }
    setShowLayoutModal(false);
  }, [isMobileViewport, showLayoutModal]);

  useEffect(() => {
    if (!showHeroMenu) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && heroMenuRef.current?.contains(target)) {
        return;
      }
      setShowHeroMenu(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setShowHeroMenu(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showHeroMenu]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [statusMessage]);

  useEffect(() => {
    if (!data || initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    setSecretRoll(data.preferences.defaultSecret);

    if (!data.preferences.guidedSetupCompleted) {
      setShowGuide(true);
      setGuideStepIndex(0);
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          guidedSetupCompleted: true
        }
      }));
    }

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
    return () => {
      if (resultHighlightTimerRef.current !== null) {
        window.clearTimeout(resultHighlightTimerRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

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
  const activeModifierSetup = useMemo(() => (data ? findActiveModifierSetup(data) : null), [data]);

  const visibleEntries = useMemo(() => (connectedRoomCode ? roomEntries : data?.rollHistory ?? []), [connectedRoomCode, data?.rollHistory, roomEntries]);
  const currentAliasKey = useMemo(() => normalizeAlias(data?.preferences.playerAlias ?? '').toLowerCase(), [data?.preferences.playerAlias]);
  const filteredEntries = useMemo(() => {
    const query = historyFilters.searchText.trim().toLowerCase();

    return visibleEntries.filter((entry) => {
      const aliasKey = entry.playerAlias.trim().toLowerCase();
      if (historyFilters.mineOnly && aliasKey !== currentAliasKey) {
        return false;
      }
      if (entry.secret && !historyFilters.showSecret) {
        return false;
      }
      if (!entry.secret && !historyFilters.showPublic) {
        return false;
      }
      if (historyFilters.formulaOnly && !entry.formula) {
        return false;
      }
      if (!query) {
        return true;
      }

      const formulaLabel = entry.formula ?? '';
      return aliasKey.includes(query) || formulaLabel.toLowerCase().includes(query);
    });
  }, [currentAliasKey, historyFilters, visibleEntries]);

  const feedItems = useMemo(() => {
    if (!data) {
      return [];
    }
    return groupFeedEntries(filteredEntries, data.moderation.spamWindowMs);
  }, [data, filteredEntries]);

  const joinableRooms = useMemo(() => availableRooms.filter((room) => room.roomCode !== connectedRoomCode), [availableRooms, connectedRoomCode]);
  const favoritePresets = useMemo(() => {
    if (!data) {
      return [];
    }
    const presetMap = new Map(data.presets.map((preset) => [preset.id, preset]));
    const orderedFavorites = data.preferences.favoritePresetIds
      .map((presetId) => presetMap.get(presetId))
      .filter((preset): preset is NonNullable<typeof preset> => !!preset);
    return orderedFavorites;
  }, [data]);
  const recentRollActions = useMemo(() => deriveRecentRollActions(data?.rollHistory ?? []), [data?.rollHistory]);
  const recentActionMap = useMemo(() => new Map(recentRollActions.map((action) => [action.id, action])), [recentRollActions]);
  const sceneTheme = currentBackground.id === 'forge' ? 'obsidian' : 'azure';
  const reduceMotionEnabled = useMemo(
    () => Boolean(data?.preferences.reduceMotion) || prefersReducedMotion,
    [data?.preferences.reduceMotion, prefersReducedMotion]
  );

  useEffect(() => {
    const themeClass = `ui-theme-${sceneTheme}`;
    document.body.classList.remove('ui-theme-azure', 'ui-theme-obsidian');
    document.body.classList.add(themeClass);
    return () => {
      document.body.classList.remove(themeClass);
    };
  }, [sceneTheme]);

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', reduceMotionEnabled);
    return () => {
      document.body.classList.remove('reduce-motion');
    };
  }, [reduceMotionEnabled]);

  const setResultFxEnabled = useCallback(
    (value: boolean): void => {
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          resultFxEnabled: value
        }
      }));
    },
    [commit]
  );

  const setResultFxSound = useCallback(
    (value: boolean): void => {
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          resultFxSound: value
        }
      }));
    },
    [commit]
  );

  const setResultFxHaptics = useCallback(
    (value: boolean): void => {
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          resultFxHaptics: value
        }
      }));
    },
    [commit]
  );

  const setReduceMotionPreference = useCallback(
    (value: boolean): void => {
      commit((previous) => ({
        ...previous,
        preferences: {
          ...previous.preferences,
          reduceMotion: value
        }
      }));
    },
    [commit]
  );

  const guideSteps = useMemo<GuideStep[]>(() => {
    if (isMobileViewport) {
      return [
        {
          id: 'room',
          title: 'Set Your Player',
          description: 'Tap the highlighted button to set alias and join a room.',
          target: () => roomButtonRef.current
        },
        {
          id: 'roll-nav',
          title: 'Open Roll',
          description: 'Tap this tab to open the Roll panel.',
          target: () => mobileNavButtonRefs.current.rollComposer,
          onEnter: () => setMobileActiveWindow('history')
        },
        {
          id: 'preset-nav',
          title: 'Open Presets',
          description: 'Tap this tab to reach your saved combinations.',
          target: () => mobileNavButtonRefs.current.presets,
          onEnter: () => setMobileActiveWindow('rollComposer')
        },
        {
          id: 'history-nav',
          title: 'Review History',
          description: 'Tap this tab to return to roll history and filters.',
          target: () => mobileNavButtonRefs.current.history,
          onEnter: () => setMobileActiveWindow('presets')
        }
      ];
    }

    return [
      {
        id: 'room',
        title: 'Set Your Player',
        description: 'Click here first to set alias and join a room.',
        target: () => roomButtonRef.current
      },
      {
        id: 'roll-panel',
        title: 'Roll Dice',
        description: 'This panel is where you roll counts or formulas.',
        target: () => panelGuideRefs.current.rollComposer
      },
      {
        id: 'preset-panel',
        title: 'Use Presets',
        description: 'Save and reuse combinations from this panel.',
        target: () => panelGuideRefs.current.presets
      },
      {
        id: 'history-panel',
        title: 'Track Results',
        description: 'This panel shows roll history with filters and search.',
        target: () => panelGuideRefs.current.history
      }
    ];
  }, [isMobileViewport]);

  const activeGuideStep = showGuide ? guideSteps[guideStepIndex] ?? null : null;

  useEffect(() => {
    if (!showGuide || !activeGuideStep) {
      return;
    }
    activeGuideStep.onEnter?.();
  }, [activeGuideStep, showGuide]);

  useEffect(() => {
    if (!showGuide || !activeGuideStep) {
      setGuideTargetRect(null);
      return;
    }

    const updateRect = (): void => {
      const element = activeGuideStep.target();
      if (!element) {
        setGuideTargetRect(null);
        return;
      }
      setGuideTargetRect(element.getBoundingClientRect());
    };

    const element = activeGuideStep.target();
    if (element && typeof element.scrollIntoView === 'function') {
      try {
        element.scrollIntoView({
          behavior: reduceMotionEnabled ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      } catch {
        try {
          // Fallback for engines that only support legacy scrollIntoView signatures.
          element.scrollIntoView();
        } catch {
          // Ignore engines with no usable scrollIntoView implementation.
        }
      }
    }
    updateRect();

    const interval = window.setInterval(updateRect, 120);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [activeGuideStep, reduceMotionEnabled, showGuide]);

  const workspaceLayout = useMemo(() => normalizeWorkspaceLayout(data?.workspaceLayout), [data?.workspaceLayout]);
  const workspaceGridStyle = useMemo(
    () =>
      ({
        '--workspace-left': `${workspaceLayout.columnSplit ?? 45}%`,
        '--workspace-right': `${100 - (workspaceLayout.columnSplit ?? 45)}%`,
        '--mobile-panel-height': mobilePanelHeight ? `${mobilePanelHeight}px` : 'auto'
      }) as CSSProperties,
    [mobilePanelHeight, workspaceLayout.columnSplit]
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

  const markGuidedSetupCompleted = useCallback((): void => {
    if (!data || data.preferences.guidedSetupCompleted) {
      return;
    }
    commit((previous) => ({
      ...previous,
      preferences: {
        ...previous.preferences,
        guidedSetupCompleted: true
      }
    }));
  }, [commit, data]);

  const completeGuide = useCallback((): void => {
    setShowGuide(false);
    setGuideStepIndex(0);
    setGuideTargetRect(null);
    markGuidedSetupCompleted();
  }, [markGuidedSetupCompleted]);

  const closeGuide = useCallback((): void => {
    setShowGuide(false);
    setGuideStepIndex(0);
    setGuideTargetRect(null);
  }, []);

  useEffect(() => {
    if (!showGuide || !activeGuideStep) {
      return;
    }

    const onClickCapture = (event: MouseEvent): void => {
      const targetElement = activeGuideStep.target();
      if (!targetElement) {
        return;
      }
      const clicked = event.target as Node | null;
      if (!clicked || !targetElement.contains(clicked)) {
        return;
      }

      if (guideStepIndex >= guideSteps.length - 1) {
        completeGuide();
        return;
      }

      setGuideStepIndex(guideStepIndex + 1);
    };

    window.addEventListener('click', onClickCapture, true);
    return () => window.removeEventListener('click', onClickCapture, true);
  }, [activeGuideStep, completeGuide, guideStepIndex, guideSteps.length, showGuide]);

  const playFeedbackTone = useCallback(
    (kind: RollHighlightKind): void => {
      if (!data || !data.preferences.resultFxSound || !data.preferences.resultFxEnabled) {
        return;
      }

      const AudioCtor = (
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      );
      if (!AudioCtor) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtor();
      }

      const context = audioContextRef.current;
      if (!context) {
        return;
      }

      if (context.state === 'suspended') {
        void context.resume();
      }

      const now = context.currentTime;
      const gainNode = context.createGain();
      const oscillator = context.createOscillator();

      oscillator.type = kind === 'nat1' ? 'sawtooth' : 'triangle';
      oscillator.frequency.value = kind === 'nat20' ? 880 : kind === 'critical' ? 1040 : 220;
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.19);
    },
    [data]
  );

  const triggerResultFeedback = useCallback(
    (entry: RollEntry): void => {
      if (!data || !data.preferences.resultFxEnabled) {
        return;
      }

      const highlight = rollHighlight(entry);
      if (!highlight) {
        return;
      }

      setResultHighlight(highlight);
      if (resultHighlightTimerRef.current !== null) {
        window.clearTimeout(resultHighlightTimerRef.current);
      }
      resultHighlightTimerRef.current = window.setTimeout(() => {
        setResultHighlight(null);
      }, RESULT_EMPHASIS_MS);

      playFeedbackTone(highlight);

      if (data.preferences.resultFxHaptics && 'vibrate' in navigator) {
        const pattern = highlight === 'critical' ? [20, 40, 20] : highlight === 'nat20' ? [30] : [12, 20, 12];
        navigator.vibrate(pattern);
      }
    },
    [data, playFeedbackTone]
  );

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
    markGuidedSetupCompleted();
    triggerResultFeedback(entry);

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

  const applyPresetById = useCallback(
    (presetId: string, silent = false): boolean => {
      if (!data) {
        return false;
      }

      clearMessages();
      try {
        const preset = applyPreset(data.presets, presetId);
        setCounts({ ...preset.counts });
        setFormula(preset.formula);
        setSecretRoll(preset.secret);
        if (!silent) {
          setStatusMessage(`Preset "${preset.name}" applied.`);
        }
        return true;
      } catch (applyError) {
        setLocalError((applyError as Error).message);
        return false;
      }
    },
    [clearMessages, data]
  );

  const toggleFavoritePreset = useCallback(
    (presetId: string): void => {
      commit((previous) => {
        const exists = previous.preferences.favoritePresetIds.includes(presetId);
        const nextFavorites = exists
          ? previous.preferences.favoritePresetIds.filter((id) => id !== presetId)
          : [presetId, ...previous.preferences.favoritePresetIds.filter((id) => id !== presetId)].slice(0, 8);
        return {
          ...previous,
          preferences: {
            ...previous.preferences,
            favoritePresetIds: nextFavorites
          }
        };
      });
      setStatusMessage('Preset favorites updated.');
      setLocalError(null);
    },
    [commit]
  );

  const runRecentAction = useCallback(
    (actionId: string): void => {
      const action = recentActionMap.get(actionId);
      if (!action) {
        setLocalError('Recent action is no longer available.');
        return;
      }
      runRoll({
        source: action.source,
        useFormula: Boolean(action.forcedFormula),
        forcedFormula: action.forcedFormula,
        forcedCounts: action.forcedCounts,
        forcedSecret: action.forcedSecret,
        note: `Recent: ${action.label}`
      });
    },
    [recentActionMap, runRoll]
  );

  const runPresetInstantRoll = useCallback(
    (presetId: string): void => {
      if (!data) {
        return;
      }

      clearMessages();
      try {
        const preset = applyPreset(data.presets, presetId);
        setCounts({ ...preset.counts });
        setFormula(preset.formula);
        setSecretRoll(preset.secret);
        runRoll({
          source: preset.formula ? 'formula' : 'manual',
          useFormula: Boolean(preset.formula),
          forcedFormula: preset.formula,
          forcedCounts: { ...preset.counts },
          forcedSecret: preset.secret,
          note: `Preset: ${preset.name}`
        });
      } catch (presetError) {
        setLocalError((presetError as Error).message);
      }
    },
    [clearMessages, data, runRoll]
  );

  const insertFormulaModifier = useCallback((key: ModifierRefKey, label: string): void => {
    if (!data) {
      return;
    }
    const total = getModifierTotal(data.characterModifiers, key);

    setFormula((previous) => {
      const refreshed = refreshModifierTokens(previous, data.characterModifiers);
      return appendModifierToken(refreshed, key, data.characterModifiers);
    });
    setStatusMessage(`${label} ${formatSigned(total)} inserted from ${activeModifierSetup?.name ?? 'active setup'}.`);
    setLocalError(null);
  }, [activeModifierSetup?.name, data]);

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
      const measuredHeights: Partial<Record<WorkspaceWindowId, number>> = {};
      if (enabled) {
        for (const windowId of WINDOW_IDS) {
          const element = windowCellRefs.current[windowId];
          if (!element) {
            continue;
          }
          measuredHeights[windowId] = clampWindowHeight(element.getBoundingClientRect().height);
        }
      }

      commit((previous) => ({
        ...previous,
        workspaceLayout: {
          ...normalizeWorkspaceLayout(previous.workspaceLayout),
          windowsResizable: enabled,
          windowHeights: (() => {
            const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
            if (!enabled || normalized.windowsResizable) {
              return normalized.windowHeights;
            }

            const hasSavedHeights = Object.keys(normalized.windowHeights ?? {}).length > 0;
            const nextHeights = hasSavedHeights
              ? { ...(normalized.windowHeights ?? {}) }
              : { ...(DEFAULT_LAYOUT.windowHeights ?? {}) };

            for (const windowId of WINDOW_IDS) {
              const measured = measuredHeights[windowId];
              if (typeof nextHeights[windowId] === 'number') {
                continue;
              }
              if (typeof measured === 'number' && Number.isFinite(measured)) {
                nextHeights[windowId] = measured;
              }
            }

            return nextHeights;
          })()
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
      let widths = { ...(normalized.windowWidths ?? {}) };
      widths = applyBalancedColumnWidths(normalized.leftOrder.filter(isWorkspaceWindowId), widths);
      widths = applyBalancedColumnWidths(normalized.rightOrder.filter(isWorkspaceWindowId), widths);

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
    (windowId: WorkspaceWindowId, targetColumn: WorkspaceColumn, targetIndex: number, inlineTarget?: DragTargetState['inlineTarget']): void => {
      commit((previous) => {
        const normalized = normalizeWorkspaceLayout(previous.workspaceLayout);
        const targetOrder = (targetColumn === 'left' ? normalized.leftOrder : normalized.rightOrder).filter((id) => id !== windowId);
        let resolvedIndex = targetIndex;

        if (inlineTarget) {
          const anchorIndex = targetOrder.indexOf(inlineTarget.anchorId);
          if (anchorIndex >= 0) {
            resolvedIndex = inlineTarget.side === 'left' ? anchorIndex : anchorIndex + 1;
          }
        }

        const moved = moveWindow(normalized, windowId, targetColumn, resolvedIndex);
        const widths = { ...(normalized.windowWidths ?? {}) };

        if (inlineTarget) {
          widths[windowId] = clampWindowWidth(inlineTarget.width);
          if (typeof inlineTarget.anchorWidth === 'number') {
            widths[inlineTarget.anchorId] = clampWindowWidth(inlineTarget.anchorWidth);
          }
        }

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
                const maxTarget = 100 - peerCount * MIN_WINDOW_WIDTH;
                if (maxTarget >= MIN_WINDOW_WIDTH) {
                  const targetWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(maxTarget, clampWindowWidth(width)));
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
                        widths[peerId] = Math.max(MIN_WINDOW_WIDTH, remaining - distributed);
                        return;
                      }
                      const rawShare = Math.round((ratioSource[index] / ratioSum) * remaining);
                      const nextShare = Math.max(MIN_WINDOW_WIDTH, rawShare);
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
      document.body.classList.add('layout-pointer-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', windowId);
    };

  const onWindowDragEnd = (): void => {
    setDraggingWindowId(null);
    setDragTarget(null);
    document.body.classList.remove('layout-pointer-dragging');
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

      const placement = computeDropPlacementFromPointer(
        event.currentTarget,
        event.clientX,
        event.clientY,
        workspaceLayout.windowWidths,
        draggingWindowId
      );
      setDragTarget((previous) => {
        if (
          previous &&
          previous.column === column &&
          previous.index === placement.index &&
          previous.direction === placement.direction &&
          previous.anchorId === placement.anchorId &&
          previous.inlineTarget?.anchorId === placement.inlineTarget?.anchorId &&
          previous.inlineTarget?.side === placement.inlineTarget?.side &&
          previous.inlineTarget?.width === placement.inlineTarget?.width &&
          previous.inlineTarget?.anchorWidth === placement.inlineTarget?.anchorWidth
        ) {
          return previous;
        }
        return placement;
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

      const fallbackPlacement = computeDropPlacementFromPointer(
        event.currentTarget,
        event.clientX,
        event.clientY,
        workspaceLayout.windowWidths,
        dragged
      );
      const resolvedPlacement =
        dragTarget && dragTarget.column === column
          ? dragTarget
          : fallbackPlacement;
      moveWindowInLayout(dragged, column, resolvedPlacement.index, resolvedPlacement.inlineTarget);
      setDraggingWindowId(null);
      setDragTarget(null);
      document.body.classList.remove('layout-pointer-dragging');
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

  useEffect(() => () => document.body.classList.remove('layout-pointer-dragging'), []);

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
    return <main className={`app-shell ui-theme-${sceneTheme}`}>Loading workspace...</main>;
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
      favoritePresetIds={data.preferences.favoritePresetIds}
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
        applyPresetById(presetId);
      }}
      onRollFavorite={(presetId) => {
        runPresetInstantRoll(presetId);
      }}
      onToggleFavorite={toggleFavoritePreset}
    />
  );

  const selectModifierSetup = (setupId: string): void => {
    if (setupId === data.activeModifierSetupId) {
      return;
    }

    clearMessages();
    try {
      const selected = getModifierSetup(data.modifierSetups, setupId);
      commit((previous) => withSelectedModifierSetup(previous, setupId));
      setStatusMessage(`Formula modifiers now use "${selected.name}".`);
    } catch (setupError) {
      setLocalError((setupError as Error).message);
    }
  };

  const createBlankModifierSetup = (): void => {
    clearMessages();
    try {
      const nextName = suggestModifierSetupName(data.modifierSetups, 'Setup');
      commit((previous) => {
        const nextSetups = createModifierSetup(previous.modifierSetups, {
          name: nextName,
          modifiers: createEmptyCharacterModifiers()
        });
        return withSelectedModifierSetup(
          {
            ...previous,
            modifierSetups: nextSetups
          },
          nextSetups[0].id
        );
      });
      setStatusMessage(`Setup "${nextName}" created.`);
    } catch (setupError) {
      setLocalError((setupError as Error).message);
    }
  };

  const duplicateActiveModifierSetup = (): void => {
    if (!activeModifierSetup) {
      return;
    }

    clearMessages();
    try {
      const nextName = suggestModifierSetupName(data.modifierSetups, `${activeModifierSetup.name} Copy`);
      commit((previous) => {
        const source = findActiveModifierSetup(previous);
        const nextSetups = createModifierSetup(previous.modifierSetups, {
          name: nextName,
          modifiers: source?.modifiers ?? previous.characterModifiers
        });
        return withSelectedModifierSetup(
          {
            ...previous,
            modifierSetups: nextSetups
          },
          nextSetups[0].id
        );
      });
      setStatusMessage(`Setup "${nextName}" duplicated.`);
    } catch (setupError) {
      setLocalError((setupError as Error).message);
    }
  };

  const renameActiveModifierSetup = (nextName: string): void => {
    if (!activeModifierSetup) {
      return;
    }

    clearMessages();
    try {
      const trimmed = nextName.trim();
      commit((previous) => ({
        ...previous,
        modifierSetups: renameModifierSetup(previous.modifierSetups, previous.activeModifierSetupId, trimmed)
      }));
      setStatusMessage(`Setup renamed to "${trimmed}".`);
    } catch (setupError) {
      setLocalError((setupError as Error).message);
    }
  };

  const deleteActiveModifierSetup = (): void => {
    if (!activeModifierSetup) {
      return;
    }
    if (data.modifierSetups.length <= 1) {
      setLocalError('Create another setup before deleting this one.');
      setStatusMessage(null);
      return;
    }

    clearMessages();
    try {
      const remaining = deleteModifierSetup(data.modifierSetups, activeModifierSetup.id);
      const nextActive = remaining[0];
      if (!nextActive) {
        throw new Error('Setup not found.');
      }

      commit((previous) => {
        const nextSetups = deleteModifierSetup(previous.modifierSetups, previous.activeModifierSetupId);
        return withSelectedModifierSetup(
          {
            ...previous,
            modifierSetups: nextSetups
          },
          nextActive.id
        );
      });
      setStatusMessage(`Setup "${activeModifierSetup.name}" deleted.`);
    } catch (setupError) {
      setLocalError((setupError as Error).message);
    }
  };

  const updateStatBase = (key: StatKey, value: number): void => {
    commit((previous) =>
      withUpdatedActiveModifierSetup(previous, (modifiers) => ({
        ...modifiers,
        stats: {
          ...modifiers.stats,
          [key]: {
            ...modifiers.stats[key],
            base: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }))
    );
  };

  const updateStatTemp = (key: StatKey, value: number): void => {
    commit((previous) =>
      withUpdatedActiveModifierSetup(previous, (modifiers) => ({
        ...modifiers,
        stats: {
          ...modifiers.stats,
          [key]: {
            ...modifiers.stats[key],
            temp: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }))
    );
  };

  const updateSaveBase = (key: SaveKey, value: number): void => {
    commit((previous) =>
      withUpdatedActiveModifierSetup(previous, (modifiers) => ({
        ...modifiers,
        saves: {
          ...modifiers.saves,
          [key]: {
            ...modifiers.saves[key],
            base: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }))
    );
  };

  const updateSaveTemp = (key: SaveKey, value: number): void => {
    commit((previous) =>
      withUpdatedActiveModifierSetup(previous, (modifiers) => ({
        ...modifiers,
        saves: {
          ...modifiers.saves,
          [key]: {
            ...modifiers.saves[key],
            temp: sanitizeSignedInt(value, -9999, 9999)
          }
        }
      }))
    );
  };

  const modifiersPanel = (
    <ModifierToolkitPanel
      modifierSetups={data.modifierSetups}
      activeSetupId={data.activeModifierSetupId}
      modifiers={data.characterModifiers}
      onSelectSetup={selectModifierSetup}
      onCreateSetup={createBlankModifierSetup}
      onDuplicateSetup={duplicateActiveModifierSetup}
      onRenameSetup={renameActiveModifierSetup}
      onDeleteSetup={deleteActiveModifierSetup}
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
      onExportSetupJson={exportSetupJson}
      onImportSetupJson={(file) => {
        void importSetupJson(file);
      }}
    />
  );

  const favoritePresetButtons = favoritePresets.map((preset) => ({ id: preset.id, name: preset.name }));
  const stickyFavoritePresets = favoritePresetButtons.slice(0, 4);
  const stickyRecentActions = recentRollActions.slice(0, 4);
  const stickyFavoriteOverflow = Math.max(0, favoritePresetButtons.length - stickyFavoritePresets.length);
  const stickyRecentOverflow = Math.max(0, recentRollActions.length - stickyRecentActions.length);
  const runQuickPublicD20 = (): void => {
    runRoll({ source: 'quick', useFormula: true, forcedFormula: '1d20', forcedSecret: false, note: 'Quick 1d20' });
  };
  const runQuickSecretD20 = (): void => {
    runRoll({ source: 'quick', useFormula: true, forcedFormula: '1d20', forcedSecret: true, note: 'Quick secret 1d20' });
  };
  const runQuickRandomBatch = (): void => {
    const template = rollRandomBatchTemplate(createRng(data.preferences.rngMode));
    runRoll({ source: 'quick', forcedCounts: template, forcedFormula: '', note: 'Random batch' });
  };
  const openSetupGuide = (): void => {
    setGuideStepIndex(0);
    setShowGuide(true);
  };

  const onDesktopQuickBarDragStart = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!event.isPrimary || !desktopQuickBarPinned || isMobileViewport) {
      return;
    }

    const barRect = desktopQuickBarRef.current?.getBoundingClientRect();
    if (!barRect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore browsers with partial pointer-capture support.
      }
    }

    const clampedOrigin = clampDesktopQuickBarPosition(barRect.left, barRect.top, barRect.width, barRect.height);
    setDesktopQuickBarPosition((previous) => previous ?? clampedOrigin);
    desktopQuickBarDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - clampedOrigin.x,
      offsetY: event.clientY - clampedOrigin.y,
      width: barRect.width,
      height: barRect.height
    };
    setDesktopQuickBarDragging(true);
  };

  const onDesktopQuickBarDragMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const session = desktopQuickBarDragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const nextLeft = event.clientX - session.offsetX;
    const nextTop = event.clientY - session.offsetY;
    setDesktopQuickBarPosition(clampDesktopQuickBarPosition(nextLeft, nextTop, session.width, session.height));
  };

  const endDesktopQuickBarDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const session = desktopQuickBarDragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const target = event.currentTarget;
    if (
      typeof target.hasPointerCapture === 'function' &&
      typeof target.releasePointerCapture === 'function' &&
      target.hasPointerCapture(event.pointerId)
    ) {
      target.releasePointerCapture(event.pointerId);
    }
    desktopQuickBarDragRef.current = null;
    setDesktopQuickBarDragging(false);
  };

  const desktopQuickBarStyle: CSSProperties | undefined = desktopQuickBarPosition
    ? {
        left: `${desktopQuickBarPosition.x}px`,
        top: `${desktopQuickBarPosition.y}px`,
        bottom: 'auto',
        transform: 'none'
      }
    : undefined;

  const windowContent: Record<WorkspaceWindowId, JSX.Element> = {
    presets: (
      <div
        className="window-panel-wrap"
        ref={(element) => {
          panelGuideRefs.current.presets = element;
        }}
      >
        {renderPresetsPanel('presets-emphasis')}
      </div>
    ),
    quickActions: (
      <div
        className="window-panel-wrap"
        ref={(element) => {
          panelGuideRefs.current.quickActions = element;
        }}
      >
        <QuickActions
          density={windowDensities.quickActions}
          onRollPublicD20={runQuickPublicD20}
          onRollSecretD20={runQuickSecretD20}
          onRollRandomBatch={runQuickRandomBatch}
          stickyBarEnabled={desktopQuickBarPinned}
          onToggleStickyBar={() => setDesktopQuickBarPinned((previous) => !previous)}
          favoritePresets={favoritePresetButtons}
          recentRollActions={recentRollActions.map((action) => ({ id: action.id, label: action.label, detail: action.detail }))}
          onRunFavoritePreset={(presetId) => {
            runPresetInstantRoll(presetId);
          }}
          onRunRecentAction={runRecentAction}
        />
      </div>
    ),
    rollComposer: (
      <div
        className="window-panel-wrap"
        ref={(element) => {
          panelGuideRefs.current.rollComposer = element;
        }}
      >
        <RollComposer
          density={windowDensities.rollComposer}
          counts={counts}
          formula={formula}
          modifiers={data.characterModifiers}
          modifierSetups={data.modifierSetups}
          activeModifierSetupId={data.activeModifierSetupId}
          secretRoll={secretRoll}
          useDiceImages={data.preferences.useDiceImages}
          onCountChange={(sides, value) => {
            setCounts((previous) => ({
              ...previous,
              [sides]: sanitizePositiveInt(value, 1000)
            }));
          }}
          onFormulaChange={(value) => {
            setFormula(value);
          }}
          onModifierSetupChange={selectModifierSetup}
          onInsertModifier={insertFormulaModifier}
          onSecretRollChange={(value) => setSecretRoll(value)}
          onUseDiceImagesChange={(value) => {
            commit((previous) => ({
              ...previous,
              preferences: {
                ...previous.preferences,
                useDiceImages: value
              }
            }));
          }}
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
      </div>
    ),
    history: (
      <div
        className="window-panel-wrap"
        ref={(element) => {
          panelGuideRefs.current.history = element;
        }}
      >
        <HistoryFeed
          density={windowDensities.history}
          items={feedItems}
          filters={historyFilters}
          activeAlias={currentAliasKey}
          mutedAliases={[]}
          hasMore={canPaginateRoomHistory && hasMoreRoomHistory}
          loadingMore={loadingMoreHistory}
          onFiltersChange={(next) => {
            setHistoryFilters(next);
          }}
          onLoadMore={() => {
            void loadMoreRoomHistory();
          }}
        />
      </div>
    )
  };

  const renderColumn = (column: WorkspaceColumn): JSX.Element | null => {
    const orderedIdsBase = (column === 'left' ? workspaceLayout.leftOrder : workspaceLayout.rightOrder).filter(isWorkspaceWindowId);
    const orderedIds =
      !isMobileViewport && desktopQuickBarPinned ? orderedIdsBase.filter((windowId) => windowId !== 'quickActions') : orderedIdsBase;
    if (isMobileViewport) {
      if (!orderedIds.includes(mobileActiveWindow)) {
        return null;
      }
      const activeIds = [mobileActiveWindow];
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
          {activeIds.map((windowId) => {
            const height = clampWindowHeight(workspaceLayout.windowHeights?.[windowId] ?? 360);
            const mobileHeight = mobilePanelHeight ?? height;
            const density: WindowDensity = 'tiny';
            const canEditWidth = workspaceLayout.windowsResizable && !workspaceLayout.sizesLocked;
            const directionalDrop =
              dragTarget?.column === column && dragTarget.anchorId === windowId ? dragTarget.direction : null;
            const dropClass =
              directionalDrop === 'left' || directionalDrop === 'right'
                ? `inline-drop-${directionalDrop}`
                : directionalDrop === 'top'
                  ? 'drop-target-top'
                  : directionalDrop === 'bottom'
                    ? 'drop-target-bottom'
                    : '';
            return (
              <div
                ref={(element) => {
                  windowCellRefs.current[windowId] = element;
                }}
                key={windowId}
                className={`workspace-cell mobile-active-cell ${workspaceLayout.windowsResizable ? 'sizing-mode' : ''} ${selectedWindowId === windowId ? 'selected-cell' : ''} ${
                  dropClass
                }`}
                style={
                  {
                    '--window-width': '100%',
                    '--window-height': `${mobileHeight}px`
                  } as CSSProperties
                }
                data-density={density}
                data-window-id={windowId}
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
                      <span className="window-size-pill" aria-label={`${windowId} width 100% and height ${mobileHeight}px`}>
                        100% x {mobileHeight}
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
              </div>
            );
          })}
        </div>
      );
    }

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
        {orderedIds.map((windowId) => {
          const width = clampWindowWidth(workspaceLayout.windowWidths?.[windowId] ?? 100);
          const height = clampWindowHeight(workspaceLayout.windowHeights?.[windowId] ?? 360);
          const density = windowDensities[windowId] ?? 'regular';
          const canEditWidth = workspaceLayout.windowsResizable && !workspaceLayout.sizesLocked;
          const directionalDrop =
            dragTarget?.column === column && dragTarget.anchorId === windowId ? dragTarget.direction : null;
          const dropClass =
            directionalDrop === 'left' || directionalDrop === 'right'
              ? `inline-drop-${directionalDrop}`
              : directionalDrop === 'top'
                ? 'drop-target-top'
                : directionalDrop === 'bottom'
                  ? 'drop-target-bottom'
                  : '';
          return (
            <div
              ref={(element) => {
                windowCellRefs.current[windowId] = element;
              }}
              key={windowId}
              className={`workspace-cell ${workspaceLayout.windowsResizable ? 'sizing-mode' : ''} ${selectedWindowId === windowId ? 'selected-cell' : ''} ${
                dropClass
              }`}
              style={
                {
                  '--window-width': `${width}%`,
                  '--window-height': `${height}px`
                } as CSSProperties
              }
              data-density={density}
              data-window-id={windowId}
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
            </div>
          );
        })}
      </div>
    );
  };

  const goToPreviousGuideStep = (): void => {
    setGuideStepIndex((previous) => Math.max(0, previous - 1));
  };

  const goToNextGuideStep = (): void => {
    if (guideStepIndex >= guideSteps.length - 1) {
      completeGuide();
      return;
    }
    setGuideStepIndex((previous) => Math.min(guideSteps.length - 1, previous + 1));
  };

  const guideCardStyle: CSSProperties = (() => {
    if (!guideTargetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const width = Math.min(360, Math.max(240, window.innerWidth - 24));
    let left = Math.max(12, Math.min(guideTargetRect.left, window.innerWidth - width - 12));
    let top = guideTargetRect.bottom + 14;
    const estimatedHeight = 190;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, guideTargetRect.top - estimatedHeight - 14);
    }
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }

    return {
      width: `${width}px`,
      top: `${top}px`,
      left: `${left}px`
    };
  })();

  const renderHeroMenu = (): JSX.Element => (
    <div className="hero-menu-wrap" ref={heroMenuRef}>
      <button
        type="button"
        className="icon-btn hero-menu-btn"
        aria-label="Open main menu"
        aria-haspopup="menu"
        aria-expanded={showHeroMenu}
        aria-controls="hero-main-menu"
        onClick={() => {
          setShowHeroMenu((previous) => !previous);
        }}
      >
        <span className="burger-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {showHeroMenu ? (
        <div id="hero-main-menu" className="hero-menu-popover" role="menu" aria-label="Main menu">
          {isMobileViewport ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowHeroMenu(false);
                  setShowThemeModal(true);
                }}
              >
                Palette
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowHeroMenu(false);
                  setShowModifiersModal(true);
                }}
              >
                Stats & Saves
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowHeroMenu(false);
                  openSetupGuide();
                }}
              >
                Setup Guide
              </button>
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setShowHeroMenu(false);
              setShowFeedbackModal(true);
            }}
          >
            Feedback & Accessibility
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <main
      className={[
        'app-shell',
        `ui-theme-${sceneTheme}`,
        'mobile-panel-nav-enabled',
        !isMobileViewport && desktopQuickBarPinned ? 'desktop-quick-nav-active' : '',
        resultHighlight ? `result-highlight-${resultHighlight}` : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ backgroundImage: currentBackground.image }}
    >
      <div className="overlay" />
      <div className="content">
        <header className="hero">
          {isMobileViewport ? <div className="hero-mobile-menu-row">{renderHeroMenu()}</div> : null}
          <section className="hero-command-deck panel">
            <div className="hero-primary-row">
              <button
                type="button"
                className={`hero-room-btn ${isMobileViewport ? 'hero-room-btn-inline' : ''}`.trim()}
                aria-label="Open player and shared room controls"
                aria-haspopup="dialog"
                ref={roomButtonRef}
                onClick={() => setShowRoomModal(true)}
              >
                {connectedRoomCode
                  ? `Player & Shared Room • ${connectedRoomCode} • ${presenceMembers.length} online`
                  : 'Player & Shared Room'}
              </button>

            </div>

            <div className="hero-metric-grid" aria-label="Workspace summary">
              <article className="hero-metric-card hero-metric-card-accent">
                <span>Player Alias</span>
                <strong>{data.preferences.playerAlias}</strong>
              </article>
              <article className="hero-metric-card">
                <span>Active Setup</span>
                <strong>{activeModifierSetup?.name ?? 'Default Setup'}</strong>
              </article>
              <article className="hero-metric-card">
                <span>Saved Presets</span>
                <strong>{data.presets.length}</strong>
              </article>
              <article className="hero-metric-card">
                <span>{connectedRoomCode ? 'Room Feed' : 'Local History'}</span>
                <strong>{visibleEntries.length}</strong>
              </article>
            </div>

            {!isMobileViewport ? (
              <div className="hero-action-row">
                <div className="hero-action-controls">
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
                    aria-label="Open stat and save setups"
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
                  <button
                    type="button"
                    className="hero-action-btn"
                    aria-label="Open quick setup assistant"
                    onClick={openSetupGuide}
                  >
                    Setup Guide
                  </button>
                  <button
                    type="button"
                    className="hero-action-btn"
                    aria-label="Open feedback and accessibility options"
                    aria-haspopup="dialog"
                    onClick={() => setShowFeedbackModal(true)}
                  >
                    Feedback
                  </button>
                </div>

                <div className="layout-status-row">
                  <span className="badge">Storage: {storageKind === 'opfs' ? 'OPFS file' : 'IndexedDB fallback'}</span>
                  <span className="badge">Realtime: {realtimeReady ? 'Supabase enabled' : 'Not configured'}</span>
                  <span className="badge">{workspaceLayout.locked ? 'Windows locked' : 'Windows unlocked'}</span>
                  <span className="badge">{workspaceLayout.windowsResizable ? 'Block sizing on' : 'Block sizing off'}</span>
                  <span className="badge">Columns {workspaceLayout.columnSplit}/{100 - (workspaceLayout.columnSplit ?? 45)}</span>
                </div>
              </div>
            ) : null}
          </section>
        </header>

        {(error || localError || statusMessage) && (
          <div className="toast-stack" aria-live="polite" aria-atomic="false">
            {error ? (
              <section className="toast toast-error" role="alert">
                <p>Storage error: {error}</p>
              </section>
            ) : null}
            {localError ? (
              <section className="toast toast-error" role="alert">
                <p>{localError}</p>
                <button
                  type="button"
                  className="toast-close-btn"
                  aria-label="Dismiss error message"
                  onClick={() => setLocalError(null)}
                >
                  ✕
                </button>
              </section>
            ) : null}
            {statusMessage ? (
              <section className="toast toast-success" role="status">
                <p>{statusMessage}</p>
                <button
                  type="button"
                  className="toast-close-btn"
                  aria-label="Dismiss status message"
                  onClick={() => setStatusMessage(null)}
                >
                  ✕
                </button>
              </section>
            ) : null}
          </div>
        )}

        <div
          ref={workspaceGridRef}
          className={`workspace-grid ${showLayoutModal ? 'layout-live-preview' : ''}`.trim()}
          style={workspaceGridStyle}
        >
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

        {!isMobileViewport && desktopQuickBarPinned ? (
          <div
            className={`desktop-quick-nav ${desktopQuickBarDragging ? 'is-dragging' : ''}`.trim()}
            role="navigation"
            aria-label="Sticky quick actions"
            ref={desktopQuickBarRef}
            style={desktopQuickBarStyle}
          >
            <button
              type="button"
              className="desktop-quick-nav-drag-handle"
              onPointerDown={onDesktopQuickBarDragStart}
              onPointerMove={onDesktopQuickBarDragMove}
              onPointerUp={endDesktopQuickBarDrag}
              onPointerCancel={endDesktopQuickBarDrag}
              onLostPointerCapture={endDesktopQuickBarDrag}
              aria-label="Move sticky quick actions bar"
              title="Drag to move sticky quick actions bar"
            >
              ⋮⋮
            </button>
            <div className="desktop-quick-nav-main">
              <div className="desktop-quick-nav-actions">
                <button type="button" className="desktop-quick-nav-btn desktop-quick-nav-btn-public" onClick={runQuickPublicD20}>
                  1d20
                </button>
                <button type="button" className="desktop-quick-nav-btn desktop-quick-nav-btn-secret" onClick={runQuickSecretD20}>
                  Secret d20
                </button>
                <button type="button" className="desktop-quick-nav-btn desktop-quick-nav-btn-random" onClick={runQuickRandomBatch}>
                  Random
                </button>
              </div>
              {stickyFavoritePresets.length > 0 ? (
                <div className="desktop-quick-nav-list">
                  <span className="desktop-quick-nav-label">Favorites</span>
                  <div className="desktop-quick-nav-chip-row">
                    {stickyFavoritePresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="quick-chip-btn"
                        onClick={() => {
                          runPresetInstantRoll(preset.id);
                        }}
                      >
                        {preset.name}
                      </button>
                    ))}
                    {stickyFavoriteOverflow > 0 ? <span className="desktop-quick-nav-more">+{stickyFavoriteOverflow}</span> : null}
                  </div>
                </div>
              ) : null}
              {stickyRecentActions.length > 0 ? (
                <div className="desktop-quick-nav-list">
                  <span className="desktop-quick-nav-label">Recent</span>
                  <div className="desktop-quick-nav-chip-row">
                    {stickyRecentActions.map((action) => (
                      <button key={action.id} type="button" className="quick-chip-btn" onClick={() => runRecentAction(action.id)}>
                        <span>{action.label}</span>
                      </button>
                    ))}
                    {stickyRecentOverflow > 0 ? <span className="desktop-quick-nav-more">+{stickyRecentOverflow}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="desktop-quick-nav-close"
              onClick={() => setDesktopQuickBarPinned(false)}
              aria-label="Disable sticky quick actions bar"
              title="Disable sticky quick actions bar"
            >
              ×
            </button>
          </div>
        ) : null}

        {isMobileViewport ? (
          <div className="mobile-bottom-stack" ref={mobileBottomStackRef}>
            <div className="mobile-quick-actions" aria-label="Mobile quick actions">
              <button type="button" className="mobile-quick-btn mobile-quick-btn-public" onClick={runQuickPublicD20}>
                1d20
              </button>
              <button type="button" className="mobile-quick-btn mobile-quick-btn-secret" onClick={runQuickSecretD20}>
                Secret d20
              </button>
              <button type="button" className="mobile-quick-btn mobile-quick-btn-random" onClick={runQuickRandomBatch}>
                Random
              </button>
            </div>
            <nav className="mobile-panel-nav" aria-label="Mobile panel navigation">
              {MOBILE_NAV_WINDOW_ORDER.map((windowId) => (
                <button
                  key={windowId}
                  type="button"
                  className={mobileActiveWindow === windowId ? 'active' : ''}
                  aria-current={mobileActiveWindow === windowId ? 'page' : undefined}
                  ref={(element) => {
                    mobileNavButtonRefs.current[windowId] = element;
                  }}
                  onClick={() => {
                    setMobileActiveWindow(windowId);
                  }}
                >
                  {MOBILE_NAV_LABELS[windowId]}
                </button>
              ))}
            </nav>
          </div>
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
                    applyPresetById(activePresetOption.id);
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
                      presets: deletePreset(previous.presets, activePresetOption.id),
                      preferences: {
                        ...previous.preferences,
                        favoritePresetIds: previous.preferences.favoritePresetIds.filter((id) => id !== activePresetOption.id)
                      }
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
          <Modal title="Stat & Save Setups" onClose={() => setShowModifiersModal(false)} className="modifiers-modal-shell">
            {modifiersPanel}
          </Modal>
        ) : null}

        {showLayoutModal ? (
          <Modal title="Layout Studio" onClose={() => setShowLayoutModal(false)} className="layout-modal-shell">
            <section className="panel layout-studio-panel">
              <div className="panel-title-row">
                <h2>Layout Studio</h2>
                <InfoHint
                  text="Tune the block workspace: move panels, resize widths, and reset the entire arrangement."
                  label="About layout studio"
                />
              </div>
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

        {showFeedbackModal ? (
          <Modal title="Feedback & Accessibility" onClose={() => setShowFeedbackModal(false)} className="feedback-modal-shell">
            <section className="panel feedback-panel">
              <div className="panel-title-row">
                <h2>Feedback & Accessibility</h2>
                <InfoHint
                  text="Tune visual emphasis, sound, haptics, and reduced motion behavior."
                  label="About feedback and accessibility"
                />
              </div>
              <div className="quick-toggle-grid">
                <label className="inline-toggle" htmlFor="feedback-result-fx-enabled">
                  <input
                    id="feedback-result-fx-enabled"
                    type="checkbox"
                    checked={data.preferences.resultFxEnabled}
                    onChange={(event) => setResultFxEnabled(event.target.checked)}
                  />
                  Result emphasis
                </label>
                <label className="inline-toggle" htmlFor="feedback-result-fx-sound">
                  <input
                    id="feedback-result-fx-sound"
                    type="checkbox"
                    checked={data.preferences.resultFxSound}
                    onChange={(event) => setResultFxSound(event.target.checked)}
                    disabled={!data.preferences.resultFxEnabled}
                  />
                  Sound cues
                </label>
                <label className="inline-toggle" htmlFor="feedback-result-fx-haptics">
                  <input
                    id="feedback-result-fx-haptics"
                    type="checkbox"
                    checked={data.preferences.resultFxHaptics}
                    onChange={(event) => setResultFxHaptics(event.target.checked)}
                    disabled={!data.preferences.resultFxEnabled}
                  />
                  Haptic cues
                </label>
                <label className="inline-toggle" htmlFor="feedback-reduce-motion">
                  <input
                    id="feedback-reduce-motion"
                    type="checkbox"
                    checked={data.preferences.reduceMotion}
                    onChange={(event) => setReduceMotionPreference(event.target.checked)}
                  />
                  Reduce motion
                </label>
              </div>
            </section>
          </Modal>
        ) : null}

        {showGuide && activeGuideStep ? (
          <div className="guide-overlay" role="dialog" aria-live="polite" aria-label="Guided setup helper">
            {guideTargetRect ? (
              <div
                className="guide-highlight"
                style={{
                  top: `${guideTargetRect.top}px`,
                  left: `${guideTargetRect.left}px`,
                  width: `${guideTargetRect.width}px`,
                  height: `${guideTargetRect.height}px`
                }}
              />
            ) : null}

            <div className="guide-card panel" style={guideCardStyle}>
              <p className="guide-progress">
                Step {guideStepIndex + 1} / {guideSteps.length}
              </p>
              <h3>{activeGuideStep.title}</h3>
              <p className="panel-subtitle">{activeGuideStep.description}</p>
              <p className="muted-text">Click the highlighted area to advance, or use Next.</p>
              <div className="row wrap gap-sm guide-actions">
                {guideStepIndex > 0 ? (
                  <button type="button" onClick={goToPreviousGuideStep}>
                    Back
                  </button>
                ) : null}
                <button type="button" onClick={goToNextGuideStep} className="primary-btn">
                  {guideStepIndex >= guideSteps.length - 1 ? 'Finish' : 'Next'}
                </button>
                <button type="button" onClick={closeGuide}>
                  Skip
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
