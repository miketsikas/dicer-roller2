export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export type DieSides = (typeof DICE_SIDES)[number];

export type DiceCounts = Record<DieSides, number>;

export type RngMode = 'crypto' | 'math';

export type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type SaveKey = 'fort' | 'reflex' | 'will';

export interface ModifierField {
  base: number;
  temp: number;
}

export interface CharacterModifiers {
  stats: Record<StatKey, ModifierField>;
  saves: Record<SaveKey, ModifierField>;
}

export interface WorkspaceLayout {
  locked: boolean;
  leftOrder: string[];
  rightOrder: string[];
  windowsResizable?: boolean;
  columnSplit?: number;
  sizesLocked?: boolean;
  windowWidths?: Record<string, number>;
  windowHeights?: Record<string, number>;
}

export interface Preferences {
  playerAlias: string;
  roomName: string;
  roomCode: string;
  defaultSecret: boolean;
  backgroundId: string;
  autoCarousel: boolean;
  rngMode: RngMode;
  guidedSetupCompleted: boolean;
  favoritePresetIds: string[];
  reduceMotion: boolean;
  resultFxEnabled: boolean;
  resultFxSound: boolean;
  resultFxHaptics: boolean;
  mobileQuickRoll: boolean;
}

export interface ModerationSettings {
  ownerMode: boolean;
  roomLocked: boolean;
  mutedAliases: string[];
  hiddenAliases: string[];
  spamWindowMs: number;
}

export interface DicePoolResult {
  sides: DieSides | number;
  values: number[];
  sign?: 1 | -1;
  keptValues?: number[];
  droppedValues?: number[];
}

export interface RollEntry {
  id: string;
  timestamp: number;
  playerAlias: string;
  roomName: string;
  roomCode: string;
  secret: boolean;
  source: 'manual' | 'formula' | 'quick';
  formula: string | null;
  modifier: number;
  total: number;
  dicePools: DicePoolResult[];
  spamKey: string;
  note?: string;
}

export interface SavedPreset {
  id: string;
  name: string;
  counts: DiceCounts;
  formula: string;
  secret: boolean;
  updatedAt: number;
}

export interface SessionReplay {
  id: string;
  name: string;
  createdAt: number;
  playerAlias: string;
  roomName: string;
  entries: RollEntry[];
}

export interface AppData {
  clientId: string;
  createdAt: number;
  updatedAt: number;
  lastCleanupAt: number;
  preferences: Preferences;
  characterModifiers: CharacterModifiers;
  workspaceLayout: WorkspaceLayout;
  rollHistory: RollEntry[];
  presets: SavedPreset[];
  moderation: ModerationSettings;
  sessionReplays: SessionReplay[];
}

export interface FeedItem {
  primary: RollEntry;
  duplicates: RollEntry[];
}
