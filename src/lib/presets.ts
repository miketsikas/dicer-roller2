import type { DiceCounts, SavedPreset } from '../types';
import { createId } from './uuid';
import { validatePresetName } from './validation';

export interface PresetDraft {
  name: string;
  counts: DiceCounts;
  formula: string;
  secret: boolean;
}

function ensureUniqueName(presets: SavedPreset[], candidate: string, ignoreId?: string): void {
  const lower = candidate.trim().toLowerCase();
  const duplicate = presets.some(
    (preset) => preset.id !== ignoreId && preset.name.trim().toLowerCase() === lower
  );
  if (duplicate) {
    throw new Error('Preset names must be unique.');
  }
}

export function createPreset(presets: SavedPreset[], draft: PresetDraft, now = Date.now()): SavedPreset[] {
  const nameError = validatePresetName(draft.name);
  if (nameError) {
    throw new Error(nameError);
  }
  ensureUniqueName(presets, draft.name);

  const next: SavedPreset = {
    id: createId('preset'),
    name: draft.name.trim(),
    counts: { ...draft.counts },
    formula: draft.formula.trim(),
    secret: draft.secret,
    updatedAt: now
  };

  return [next, ...presets];
}

export function renamePreset(
  presets: SavedPreset[],
  presetId: string,
  nextName: string,
  now = Date.now()
): SavedPreset[] {
  const nameError = validatePresetName(nextName);
  if (nameError) {
    throw new Error(nameError);
  }
  ensureUniqueName(presets, nextName, presetId);

  return presets.map((preset) =>
    preset.id === presetId
      ? {
          ...preset,
          name: nextName.trim(),
          updatedAt: now
        }
      : preset
  );
}

export function updatePresetFromDraft(
  presets: SavedPreset[],
  presetId: string,
  draft: Omit<PresetDraft, 'name'>,
  now = Date.now()
): SavedPreset[] {
  return presets.map((preset) =>
    preset.id === presetId
      ? {
          ...preset,
          counts: { ...draft.counts },
          formula: draft.formula.trim(),
          secret: draft.secret,
          updatedAt: now
        }
      : preset
  );
}

export function deletePreset(presets: SavedPreset[], presetId: string): SavedPreset[] {
  return presets.filter((preset) => preset.id !== presetId);
}

export function applyPreset(presets: SavedPreset[], presetId: string): SavedPreset {
  const found = presets.find((preset) => preset.id === presetId);
  if (!found) {
    throw new Error('Preset not found.');
  }
  return found;
}
