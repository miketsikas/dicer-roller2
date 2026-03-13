import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { ModifierToolkitPanel } from './ModifierToolkitPanel';

function Harness(props: { onSaveBaseChangeSpy: ReturnType<typeof vi.fn> }): JSX.Element {
  const [modifiers, setModifiers] = useState({
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
  });

  return (
    <ModifierToolkitPanel
      modifierSetups={[
        {
          id: 'setup-1',
          name: 'Default Setup',
          modifiers,
          updatedAt: 1
        }
      ]}
      activeSetupId="setup-1"
      modifiers={modifiers}
      onSelectSetup={() => {}}
      onCreateSetup={() => {}}
      onDuplicateSetup={() => {}}
      onRenameSetup={() => {}}
      onDeleteSetup={() => {}}
      onStatBaseChange={(key, value) =>
        setModifiers((previous) => ({
          ...previous,
          stats: {
            ...previous.stats,
            [key]: {
              ...previous.stats[key],
              base: value
            }
          }
        }))
      }
      onStatTempChange={(key, value) =>
        setModifiers((previous) => ({
          ...previous,
          stats: {
            ...previous.stats,
            [key]: {
              ...previous.stats[key],
              temp: value
            }
          }
        }))
      }
      onSaveBaseChange={(key, value) => {
        props.onSaveBaseChangeSpy(key, value);
        setModifiers((previous) => ({
          ...previous,
          saves: {
            ...previous.saves,
            [key]: {
              ...previous.saves[key],
              base: value
            }
          }
        }));
      }}
      onSaveTempChange={(key, value) =>
        setModifiers((previous) => ({
          ...previous,
          saves: {
            ...previous.saves,
            [key]: {
              ...previous.saves[key],
              temp: value
            }
          }
        }))
      }
    />
  );
}

describe('ModifierToolkitPanel', () => {
  test('save inputs do not commit intermediate invalid number states while typing', () => {
    const onSaveBaseChangeSpy = vi.fn();
    render(<Harness onSaveBaseChangeSpy={onSaveBaseChangeSpy} />);

    const fortBaseInput = screen.getByLabelText('Fort base modifier');

    fireEvent.change(fortBaseInput, { target: { value: '-' } });
    expect(onSaveBaseChangeSpy).not.toHaveBeenCalled();

    fireEvent.change(fortBaseInput, { target: { value: '-2' } });
    expect(onSaveBaseChangeSpy).toHaveBeenLastCalledWith('fort', -2);
    expect((fortBaseInput as HTMLInputElement).value).toBe('-2');
  });
});
