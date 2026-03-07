import { describe, expect, test } from 'vitest';
import { createEmptyCounts } from './dice';
import { applyPreset, createPreset, deletePreset, renamePreset, updatePresetFromDraft } from './presets';

describe('preset CRUD', () => {
  test('create, rename, update, apply and delete preset', () => {
    const counts = createEmptyCounts();
    counts[20] = 1;

    let presets = createPreset([], {
      name: 'Attack Roll',
      counts,
      formula: '1d20+7',
      secret: false
    });

    const created = presets[0];
    expect(created.name).toBe('Attack Roll');

    presets = renamePreset(presets, created.id, 'Melee Attack');
    expect(presets[0].name).toBe('Melee Attack');

    const nextCounts = createEmptyCounts();
    nextCounts[6] = 4;
    presets = updatePresetFromDraft(presets, created.id, {
      counts: nextCounts,
      formula: '4d6kh3',
      secret: true
    });

    const applied = applyPreset(presets, created.id);
    expect(applied.formula).toBe('4d6kh3');
    expect(applied.secret).toBe(true);
    expect(applied.counts[6]).toBe(4);

    presets = deletePreset(presets, created.id);
    expect(presets).toHaveLength(0);
  });

  test('duplicate names are rejected', () => {
    const base = createPreset([], {
      name: 'A',
      counts: createEmptyCounts(),
      formula: '',
      secret: false
    });

    expect(() =>
      createPreset(base, {
        name: 'a',
        counts: createEmptyCounts(),
        formula: '',
        secret: false
      })
    ).toThrow('Preset names must be unique.');
  });
});
