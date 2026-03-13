import type { CharacterModifiers, ModifierSetup } from '../types';
import { createId } from './uuid';
import { validateModifierSetupName } from './validation';

export const DEFAULT_MODIFIER_SETUP_NAME = 'Default Setup';

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function cloneField(field: { base: number; temp: number }) {
  return {
    base: field.base,
    temp: field.temp
  };
}

function ensureUniqueName(setups: ModifierSetup[], candidate: string, ignoreId?: string): void {
  const lower = normalizeName(candidate);
  const duplicate = setups.some((setup) => setup.id !== ignoreId && normalizeName(setup.name) === lower);
  if (duplicate) {
    throw new Error('Setup names must be unique.');
  }
}

export function createEmptyCharacterModifiers(): CharacterModifiers {
  return {
    stats: {
      str: { base: 0, temp: 0 },
      dex: { base: 0, temp: 0 },
      con: { base: 0, temp: 0 },
      int: { base: 0, temp: 0 },
      wis: { base: 0, temp: 0 },
      cha: { base: 0, temp: 0 }
    },
    saves: {
      fort: { base: 0, temp: 0 },
      reflex: { base: 0, temp: 0 },
      will: { base: 0, temp: 0 }
    }
  };
}

export function cloneCharacterModifiers(modifiers: CharacterModifiers): CharacterModifiers {
  return {
    stats: {
      str: cloneField(modifiers.stats.str),
      dex: cloneField(modifiers.stats.dex),
      con: cloneField(modifiers.stats.con),
      int: cloneField(modifiers.stats.int),
      wis: cloneField(modifiers.stats.wis),
      cha: cloneField(modifiers.stats.cha)
    },
    saves: {
      fort: cloneField(modifiers.saves.fort),
      reflex: cloneField(modifiers.saves.reflex),
      will: cloneField(modifiers.saves.will)
    }
  };
}

export function suggestModifierSetupName(setups: ModifierSetup[], seed = 'Setup'): string {
  const base = seed.trim() || 'Setup';
  if (!setups.some((setup) => normalizeName(setup.name) === normalizeName(base))) {
    return base;
  }

  let suffix = 2;
  while (setups.some((setup) => normalizeName(setup.name) === normalizeName(`${base} ${suffix}`))) {
    suffix += 1;
  }

  return `${base} ${suffix}`;
}

export function createModifierSetup(
  setups: ModifierSetup[],
  draft: { name: string; modifiers?: CharacterModifiers },
  now = Date.now()
): ModifierSetup[] {
  const nameError = validateModifierSetupName(draft.name);
  if (nameError) {
    throw new Error(nameError);
  }
  ensureUniqueName(setups, draft.name);

  const next: ModifierSetup = {
    id: createId('setup'),
    name: draft.name.trim(),
    modifiers: cloneCharacterModifiers(draft.modifiers ?? createEmptyCharacterModifiers()),
    updatedAt: now
  };

  return [next, ...setups];
}

export function renameModifierSetup(setups: ModifierSetup[], setupId: string, nextName: string, now = Date.now()): ModifierSetup[] {
  const nameError = validateModifierSetupName(nextName);
  if (nameError) {
    throw new Error(nameError);
  }
  ensureUniqueName(setups, nextName, setupId);

  return setups.map((setup) =>
    setup.id === setupId
      ? {
          ...setup,
          name: nextName.trim(),
          updatedAt: now
        }
      : setup
  );
}

export function updateModifierSetupModifiers(
  setups: ModifierSetup[],
  setupId: string,
  modifiers: CharacterModifiers,
  now = Date.now()
): ModifierSetup[] {
  return setups.map((setup) =>
    setup.id === setupId
      ? {
          ...setup,
          modifiers: cloneCharacterModifiers(modifiers),
          updatedAt: now
        }
      : setup
  );
}

export function deleteModifierSetup(setups: ModifierSetup[], setupId: string): ModifierSetup[] {
  return setups.filter((setup) => setup.id !== setupId);
}

export function getModifierSetup(setups: ModifierSetup[], setupId: string): ModifierSetup {
  const found = setups.find((setup) => setup.id === setupId);
  if (!found) {
    throw new Error('Setup not found.');
  }
  return found;
}
