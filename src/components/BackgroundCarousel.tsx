import { BACKGROUNDS } from '../constants/backgrounds';
import { InfoHint } from './InfoHint';

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
  const currentLabel = BACKGROUNDS.find((option) => option.id === currentId)?.label ?? 'Scene';

  return (
    <section className="panel background-carousel-panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Background Scene</h2>
            <InfoHint
              text="Pick a local scene for this workspace. Carousel rotates backgrounds automatically."
              label="About background scene"
            />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className="badge">{currentLabel}</span>
          <span className={`badge ${autoCarousel ? 'badge-accent' : 'badge-neutral'}`}>{autoCarousel ? 'Auto on' : 'Auto off'}</span>
        </div>
      </div>
      <div className="panel-slab">
        <div className="row gap-sm background-carousel-controls">
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
