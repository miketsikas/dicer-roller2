import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface InfoHintProps {
  text: string;
  label?: string;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const VIEWPORT_PADDING = 10;
const POPUP_GAP = 10;

export function InfoHint({ text, label = 'Show section info' }: InfoHintProps): JSX.Element {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0 });

  const updatePosition = (): void => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    let nextLeft = triggerRect.right + POPUP_GAP;
    let nextTop = triggerRect.top - popoverRect.height - POPUP_GAP;

    if (nextLeft + popoverRect.width > window.innerWidth - VIEWPORT_PADDING) {
      nextLeft = window.innerWidth - popoverRect.width - VIEWPORT_PADDING;
    }
    if (nextLeft < VIEWPORT_PADDING) {
      nextLeft = VIEWPORT_PADDING;
    }

    if (nextTop < VIEWPORT_PADDING) {
      nextTop = triggerRect.bottom + POPUP_GAP;
    }
    if (nextTop + popoverRect.height > window.innerHeight - VIEWPORT_PADDING) {
      nextTop = Math.max(VIEWPORT_PADDING, window.innerHeight - popoverRect.height - VIEWPORT_PADDING);
    }

    setPosition({
      top: Math.round(nextTop),
      left: Math.round(nextLeft)
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, text]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!target || !trigger || !popover) {
        return;
      }
      if (trigger.contains(target) || popover.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const onViewportChange = (): void => {
      updatePosition();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  return (
    <span className="info-hint">
      <button
        type="button"
        ref={triggerRef}
        className="info-hint-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((previous) => !previous)}
        title={label}
      >
        i
      </button>
      {open
        ? createPortal(
            <div
              id={popoverId}
              ref={popoverRef}
              className="info-hint-popover"
              role="note"
              style={{
                top: `${position.top}px`,
                left: `${position.left}px`
              }}
            >
              {text}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
