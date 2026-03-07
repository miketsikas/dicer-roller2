import { BACKGROUNDS } from '../constants/backgrounds';

interface BackgroundCarouselProps {
  currentId: string;
  autoCarousel: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleAuto: (value: boolean) => void;
}

export function BackgroundCarousel({
  currentId,
  autoCarousel,
  disabled,
  onSelect,
  onNext,
  onPrev,
  onToggleAuto
}: BackgroundCarouselProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Background Scene</h2>
      <p className="panel-subtitle">Pick a local scene for this workspace. Carousel rotates backgrounds automatically.</p>
      <div className="row gap-sm">
        <button type="button" onClick={onPrev} aria-label="Previous background" disabled={disabled}>
          Prev
        </button>
        <button type="button" onClick={onNext} aria-label="Next background" disabled={disabled}>
          Next
        </button>
        <label className="inline-toggle" htmlFor="carousel-toggle">
          <input
            id="carousel-toggle"
            type="checkbox"
            checked={autoCarousel}
            onChange={(event) => onToggleAuto(event.target.checked)}
            disabled={disabled}
          />
          Auto carousel
        </label>
      </div>
      <div className="background-grid" role="list" aria-label="Available backgrounds">
        {BACKGROUNDS.map((option) => {
          const selected = option.id === currentId;
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={`background-swatch ${selected ? 'selected' : ''}`}
              aria-pressed={selected}
              aria-label={`Set background to ${option.label}`}
              onClick={() => onSelect(option.id)}
              disabled={disabled}
              style={{ backgroundImage: option.image }}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
