import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { Modal } from './Modal';

function ModalHarness(): JSX.Element {
  const [value, setValue] = useState('');

  return (
    <Modal title="Focus Test" onClose={() => {}}>
      <label htmlFor="modal-input">
        Value
        <input id="modal-input" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
    </Modal>
  );
}

describe('Modal', () => {
  test('keeps focus on active input when parent rerenders with a new onClose function', () => {
    render(<ModalHarness />);

    const input = screen.getByLabelText('Value');
    input.focus();
    fireEvent.change(input, { target: { value: '7' } });

    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('7');
  });

  test('escape uses the latest onClose handler', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    function EscapeHarness(): JSX.Element {
      const [useSecond, setUseSecond] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setUseSecond(true)}>
            Swap
          </button>
          <Modal title="Escape Test" onClose={useSecond ? secondClose : firstClose}>
            <input aria-label="Escape input" />
          </Modal>
        </>
      );
    }

    render(<EscapeHarness />);
    fireEvent.click(screen.getByText('Swap'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledTimes(1);
  });
});
