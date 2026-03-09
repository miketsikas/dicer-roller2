const ALIAS_RE = /^[A-Za-z0-9 _'\\-]{1,24}$/;
const ROOM_RE = /^[A-Za-z0-9 _'\\-]{1,32}$/;
const ROOM_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;

export function normalizeAlias(alias: string): string {
  return alias.trim().replace(/\s+/g, ' ');
}

export function validateAlias(alias: string): string | null {
  const value = normalizeAlias(alias);
  if (!ALIAS_RE.test(value)) {
    return 'Player alias must be 1-24 characters and use letters, numbers, spaces, apostrophes, underscores, or dashes.';
  }
  return null;
}

export function validateRoomName(room: string): string | null {
  const value = room.trim().replace(/\s+/g, ' ');
  if (!ROOM_RE.test(value)) {
    return 'Room name must be 1-32 characters and use letters, numbers, spaces, apostrophes, underscores, or dashes.';
  }
  return null;
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
}

export function validateRoomCode(roomCode: string): string | null {
  const code = normalizeRoomCode(roomCode);
  if (!ROOM_CODE_RE.test(code)) {
    return 'Room code must be 3-24 characters and use A-Z, 0-9, or dashes.';
  }
  return null;
}

export function validatePresetName(name: string): string | null {
  const value = name.trim();
  if (value.length < 1) {
    return 'Preset name is required.';
  }
  if (value.length > 40) {
    return 'Preset name must be 40 characters or fewer.';
  }
  return null;
}

export function sanitizePositiveInt(value: string | number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(max, Math.floor(parsed));
}

export function sanitizeSignedInt(value: string | number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  const normalized = Math.floor(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}
