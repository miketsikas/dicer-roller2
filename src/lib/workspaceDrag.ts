export interface WorkspaceCellRect {
  index: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface WorkspaceCellPlacement extends WorkspaceCellRect {
  id: string;
  width: number;
}

export interface WorkspaceInlinePlacement {
  anchorId: string;
  side: 'left' | 'right';
  width: number;
  anchorWidth?: number;
}

export interface WorkspaceDropPlacement {
  index: number;
  direction: 'left' | 'right' | 'top' | 'bottom';
  anchorId?: string;
  inlineTarget?: WorkspaceInlinePlacement;
}

const ROW_TOLERANCE_PX = 18;
const MIN_ATTACHABLE_WIDTH = 30;
const MIN_ANCHOR_WIDTH = 30;
const EDGE_ZONE_MIN_PX = 12;
const EDGE_ZONE_MAX_PX = 30;
const EDGE_ZONE_RATIO = 0.26;

function buildRows<T extends WorkspaceCellRect>(cells: T[]): T[][] {
  const visualOrder = [...cells].sort((a, b) => a.top - b.top || a.left - b.left || a.index - b.index);
  const rows: T[][] = [];

  for (const cell of visualOrder) {
    const lastRow = rows[rows.length - 1];
    if (!lastRow) {
      rows.push([cell]);
      continue;
    }

    const rowTop = Math.min(...lastRow.map((entry) => entry.top));
    if (Math.abs(cell.top - rowTop) <= ROW_TOLERANCE_PX) {
      lastRow.push(cell);
      continue;
    }

    rows.push([cell]);
  }

  rows.forEach((row) => row.sort((a, b) => a.left - b.left || a.index - b.index));
  return rows;
}

export function computeDropPlacementFromRects(
  cells: WorkspaceCellPlacement[],
  clientX: number,
  clientY: number,
  draggingId?: string
): WorkspaceDropPlacement {
  if (cells.length === 0) {
    return { index: 0, direction: 'top' };
  }

  const targetCells = cells.filter((entry) => entry.id !== draggingId);
  if (targetCells.length === 0) {
    return { index: 0, direction: 'top' };
  }

  const rows = buildRows(cells);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowTargets = row.filter((entry) => entry.id !== draggingId);
    if (rowTargets.length === 0) {
      continue;
    }

    const rowTop = Math.min(...rowTargets.map((entry) => entry.top));
    const rowBottom = Math.max(...rowTargets.map((entry) => entry.bottom));
    const nextRow = rows[rowIndex + 1];
    const nextRowTargets = nextRow ? nextRow.filter((entry) => entry.id !== draggingId) : [];
    const nextRowTop = nextRowTargets.length > 0 ? Math.min(...nextRowTargets.map((entry) => entry.top)) : Number.POSITIVE_INFINITY;

    if (clientY < rowTop) {
      return { index: rowTargets[0].index, direction: 'top', anchorId: rowTargets[0].id };
    }

    if (clientY <= rowBottom || clientY < nextRowTop || rowIndex === rows.length - 1) {
      let anchor = rowTargets[rowTargets.length - 1];
      let side: 'left' | 'right' = 'right';

      for (const cell of rowTargets) {
        const centerX = cell.left + (cell.right - cell.left) / 2;
        if (clientX < centerX) {
          anchor = cell;
          side = 'left';
          break;
        }
      }

      const index = side === 'left' ? anchor.index : anchor.index + 1;
      const usedWidth = rowTargets.reduce((sum, entry) => sum + entry.width, 0);
      const remainingWidth = 100 - usedWidth;
      const anchorHeight = anchor.bottom - anchor.top;
      const edgeZone = Math.max(EDGE_ZONE_MIN_PX, Math.min(EDGE_ZONE_MAX_PX, Math.round(anchorHeight * EDGE_ZONE_RATIO)));
      const topEdge = anchor.top + edgeZone;
      const bottomEdge = anchor.bottom - edgeZone;

      if (clientY <= topEdge) {
        return {
          index: anchor.index,
          direction: 'top',
          anchorId: anchor.id
        };
      }

      if (clientY >= bottomEdge) {
        return {
          index: anchor.index + 1,
          direction: 'bottom',
          anchorId: anchor.id
        };
      }

      if (remainingWidth >= MIN_ATTACHABLE_WIDTH && remainingWidth < 100) {
        return {
          index,
          direction: side,
          anchorId: anchor.id,
          inlineTarget: {
            anchorId: anchor.id,
            side,
            width: remainingWidth
          }
        };
      }

      if (
        remainingWidth < MIN_ATTACHABLE_WIDTH &&
        rowTargets.length === 1 &&
        rowTargets[0].id === anchor.id
      ) {
        const splitWidth = Math.max(MIN_ATTACHABLE_WIDTH, Math.min(100 - MIN_ANCHOR_WIDTH, Math.round(anchor.width / 2)));
        const nextAnchorWidth = 100 - splitWidth;

        if (nextAnchorWidth >= MIN_ANCHOR_WIDTH) {
          return {
            index,
            direction: side,
            anchorId: anchor.id,
            inlineTarget: {
              anchorId: anchor.id,
              side,
              width: splitWidth,
              anchorWidth: nextAnchorWidth
            }
          };
        }
      }

      const centerY = anchor.top + anchorHeight / 2;
      if (clientY < centerY) {
        return {
          index: anchor.index,
          direction: 'top',
          anchorId: anchor.id
        };
      }

      return {
        index: anchor.index + 1,
        direction: 'bottom',
        anchorId: anchor.id
      };
    }
  }

  const last = targetCells[targetCells.length - 1];
  return { index: cells.length, direction: 'bottom', anchorId: last?.id };
}

export function computeDropIndexFromRects(cells: WorkspaceCellRect[], clientX: number, clientY: number): number {
  if (cells.length === 0) {
    return 0;
  }

  const rows = buildRows(cells);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowTop = Math.min(...row.map((entry) => entry.top));
    const rowBottom = Math.max(...row.map((entry) => entry.bottom));
    const nextRow = rows[rowIndex + 1];
    const nextRowTop = nextRow ? Math.min(...nextRow.map((entry) => entry.top)) : Number.POSITIVE_INFINITY;

    if (clientY < rowTop) {
      return row[0].index;
    }

    if (clientY <= rowBottom || clientY < nextRowTop || rowIndex === rows.length - 1) {
      for (const cell of row) {
        const centerX = cell.left + (cell.right - cell.left) / 2;
        if (clientX < centerX) {
          return cell.index;
        }
      }
      return row[row.length - 1].index + 1;
    }
  }

  return cells.length;
}
