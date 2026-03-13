import { describe, expect, test } from 'vitest';
import { computeDropIndexFromRects, computeDropPlacementFromRects } from './workspaceDrag';

describe('computeDropIndexFromRects', () => {
  test('handles same-row placement using horizontal centers', () => {
    const cells = [
      { index: 0, top: 0, bottom: 100, left: 0, right: 100 },
      { index: 1, top: 0, bottom: 100, left: 112, right: 212 },
      { index: 2, top: 116, bottom: 216, left: 0, right: 212 }
    ];

    expect(computeDropIndexFromRects(cells, 24, 50)).toBe(0);
    expect(computeDropIndexFromRects(cells, 90, 50)).toBe(1);
    expect(computeDropIndexFromRects(cells, 208, 50)).toBe(2);
  });

  test('handles row gaps and below-all placement predictably', () => {
    const cells = [
      { index: 0, top: 0, bottom: 100, left: 0, right: 100 },
      { index: 1, top: 0, bottom: 100, left: 112, right: 212 },
      { index: 2, top: 132, bottom: 232, left: 0, right: 100 },
      { index: 3, top: 132, bottom: 232, left: 112, right: 212 }
    ];

    expect(computeDropIndexFromRects(cells, 40, 116)).toBe(0);
    expect(computeDropIndexFromRects(cells, 180, 116)).toBe(2);
    expect(computeDropIndexFromRects(cells, 180, 260)).toBe(4);
  });

  test('returns inline attachment details when a row still has usable width remaining', () => {
    const cells = [
      { id: 'history', index: 0, top: 0, bottom: 100, left: 0, right: 126, width: 60 },
      { id: 'presets', index: 1, top: 120, bottom: 220, left: 0, right: 212, width: 100 }
    ];

    const placement = computeDropPlacementFromRects(cells, 110, 48, 'rollComposer');
    expect(placement.index).toBe(1);
    expect(placement.inlineTarget).toEqual({
      anchorId: 'history',
      side: 'right',
      width: 40
    });
  });

  test('allows inline attachment with tighter remaining row width after resizing', () => {
    const cells = [
      { id: 'history', index: 0, top: 0, bottom: 100, left: 0, right: 148, width: 70 },
      { id: 'presets', index: 1, top: 120, bottom: 220, left: 0, right: 212, width: 100 }
    ];

    const placement = computeDropPlacementFromRects(cells, 140, 48, 'rollComposer');
    expect(placement.index).toBe(1);
    expect(placement.inlineTarget).toEqual({
      anchorId: 'history',
      side: 'right',
      width: 30
    });
  });

  test('splits a full-width row when dropping to the side of a single block', () => {
    const cells = [
      { id: 'history', index: 0, top: 0, bottom: 100, left: 0, right: 212, width: 100 },
      { id: 'presets', index: 1, top: 120, bottom: 220, left: 0, right: 212, width: 100 }
    ];

    const placement = computeDropPlacementFromRects(cells, 190, 42, 'rollComposer');
    expect(placement.index).toBe(1);
    expect(placement.inlineTarget).toEqual({
      anchorId: 'history',
      side: 'right',
      width: 50,
      anchorWidth: 50
    });
  });

  test('prioritizes bottom drop on the hovered block in same-row layouts', () => {
    const cells = [
      { id: 'x', index: 0, top: 0, bottom: 100, left: 0, right: 92, width: 30 },
      { id: 'y', index: 1, top: 0, bottom: 100, left: 102, right: 194, width: 30 },
      { id: 'z', index: 2, top: 120, bottom: 220, left: 0, right: 212, width: 100 }
    ];

    const placement = computeDropPlacementFromRects(cells, 176, 95, 'dragging');
    expect(placement.direction).toBe('bottom');
    expect(placement.anchorId).toBe('y');
    expect(placement.index).toBe(2);
    expect(placement.inlineTarget).toBeUndefined();
  });

  test('prioritizes top drop on the hovered block in same-row layouts', () => {
    const cells = [
      { id: 'x', index: 0, top: 0, bottom: 100, left: 0, right: 92, width: 30 },
      { id: 'y', index: 1, top: 0, bottom: 100, left: 102, right: 194, width: 30 },
      { id: 'z', index: 2, top: 120, bottom: 220, left: 0, right: 212, width: 100 }
    ];

    const placement = computeDropPlacementFromRects(cells, 176, 8, 'dragging');
    expect(placement.direction).toBe('top');
    expect(placement.anchorId).toBe('y');
    expect(placement.index).toBe(1);
    expect(placement.inlineTarget).toBeUndefined();
  });
});
