import { describe, expect, test } from 'vitest';
import {
  cloneCharacterModifiers,
  createEmptyCharacterModifiers,
  createModifierSetup,
  deleteModifierSetup,
  getModifierSetup,
  renameModifierSetup,
  suggestModifierSetupName,
  updateModifierSetupModifiers
} from './modifierSetups';

describe('modifier setup helpers', () => {
  test('create, rename, update, read, and delete setups', () => {
    const baseModifiers = createEmptyCharacterModifiers();
    baseModifiers.stats.str.base = 4;

    let setups = createModifierSetup([], {
      name: 'Frontliner',
      modifiers: baseModifiers
    });

    const created = setups[0];
    expect(created.name).toBe('Frontliner');
    expect(created.modifiers.stats.str.base).toBe(4);

    setups = renameModifierSetup(setups, created.id, 'Guardian');
    expect(setups[0].name).toBe('Guardian');

    const nextModifiers = cloneCharacterModifiers(setups[0].modifiers);
    nextModifiers.saves.fort.temp = 2;
    setups = updateModifierSetupModifiers(setups, created.id, nextModifiers);

    const active = getModifierSetup(setups, created.id);
    expect(active.modifiers.saves.fort.temp).toBe(2);

    setups = deleteModifierSetup(setups, created.id);
    expect(setups).toHaveLength(0);
  });

  test('setup names must be unique and suggested names increment cleanly', () => {
    const base = createModifierSetup([], {
      name: 'Setup',
      modifiers: createEmptyCharacterModifiers()
    });
    const withSecond = createModifierSetup(base, {
      name: 'Setup 2',
      modifiers: createEmptyCharacterModifiers()
    });

    expect(() =>
      createModifierSetup(withSecond, {
        name: 'setup',
        modifiers: createEmptyCharacterModifiers()
      })
    ).toThrow('Setup names must be unique.');

    expect(suggestModifierSetupName(withSecond, 'Setup')).toBe('Setup 3');
  });
});
