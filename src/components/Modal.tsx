import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ title, onClose, children, className }: ModalProps): JSX.Element {
  const headingId = useId();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const focusableSelector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const shell = shellRef.current;
    const focusables = shell?.querySelectorAll<HTMLElement>(focusableSelector);
    const firstFocusable = focusables?.[0] ?? shell;
    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const activeShell = shellRef.current;
      if (!activeShell) {
        return;
      }

      const activeFocusable = activeShell.querySelectorAll<HTMLElement>(focusableSelector);
      if (activeFocusable.length === 0) {
        event.preventDefault();
        activeShell.focus();
        return;
      }

      const first = activeFocusable[0];
      const last = activeFocusable[activeFocusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !activeShell.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last || !activeShell.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [focusableSelector]);

  const modalMarkup = (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div className={`modal-shell ${className ?? ''}`.trim()} role="dialog" aria-modal="true" aria-labelledby={headingId} ref={shellRef} tabIndex={-1}>
        <header className="modal-header">
          <h2 id={headingId}>{title}</h2>
          <button type="button" onClick={() => onCloseRef.current()} className="modal-close-btn" aria-label={`Close ${title}`}>
            Close
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalMarkup;
  }

  return createPortal(modalMarkup, document.body);
}
