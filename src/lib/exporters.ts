import type { AppData, RollEntry } from '../types';

export function toSessionJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function historyToCsv(entries: RollEntry[]): string {
  const header = ['timestamp', 'playerAlias', 'roomName', 'roomCode', 'secret', 'source', 'formula', 'total', 'details'];
  const rows = entries.map((entry) => {
    const details = entry.dicePools
      .map((pool) => `d${pool.sides}:${pool.values.join('/')}`)
      .join(' | ');

    return [
      new Date(entry.timestamp).toISOString(),
      entry.playerAlias,
      entry.roomName,
      entry.roomCode,
      String(entry.secret),
      entry.source,
      entry.formula ?? '',
      String(entry.total),
      details
    ];
  });

  return [header, ...rows]
    .map((cells) => cells.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
}

export function parseImportedSession(raw: string): AppData {
  const parsed = JSON.parse(raw) as Partial<AppData>;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid import: expected JSON object.');
  }
  if (!Array.isArray(parsed.rollHistory) || !Array.isArray(parsed.presets) || !Array.isArray(parsed.sessionReplays)) {
    throw new Error('Invalid import: missing required arrays.');
  }
  if (!parsed.preferences || !parsed.moderation || !parsed.clientId) {
    throw new Error('Invalid import: missing required fields.');
  }

  if (typeof parsed.preferences.roomCode !== 'string') {
    parsed.preferences.roomCode = '';
  }
  if (typeof parsed.preferences.guidedSetupCompleted !== 'boolean') {
    parsed.preferences.guidedSetupCompleted = true;
  }
  if (!Array.isArray(parsed.preferences.favoritePresetIds)) {
    parsed.preferences.favoritePresetIds = [];
  }
  if (typeof parsed.preferences.reduceMotion !== 'boolean') {
    parsed.preferences.reduceMotion = false;
  }
  if (typeof parsed.preferences.resultFxEnabled !== 'boolean') {
    parsed.preferences.resultFxEnabled = true;
  }
  if (typeof parsed.preferences.resultFxSound !== 'boolean') {
    parsed.preferences.resultFxSound = false;
  }
  if (typeof parsed.preferences.resultFxHaptics !== 'boolean') {
    parsed.preferences.resultFxHaptics = true;
  }
  if (typeof parsed.preferences.mobileQuickRoll !== 'boolean') {
    parsed.preferences.mobileQuickRoll = true;
  }

  for (const entry of parsed.rollHistory) {
    if (!entry.roomCode) {
      entry.roomCode = 'LOCAL';
    }
  }

  return parsed as AppData;
}
