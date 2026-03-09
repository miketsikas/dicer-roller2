import { BACKGROUNDS } from '../constants/backgrounds';

interface BackgroundWidgetProps {
  currentId: string;
  onSelect: (id: string) => void;
}

export function BackgroundWidget({ currentId, onSelect }: BackgroundWidgetProps): JSX.Element {
  return (
    <aside className="panel background-widget" aria-label="Background scene selector">
      <h2>Scene</h2>
      <p className="panel-subtitle">Local visual theme</p>
      <div className="background-widget-grid" role="list" aria-label="Scene options">
        {BACKGROUNDS.map((option) => {
          const selected = option.id === currentId;
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={`background-widget-swatch ${selected ? 'selected' : ''}`}
              aria-pressed={selected}
              aria-label={`Set scene to ${option.label}`}
              onClick={() => onSelect(option.id)}
              style={{ backgroundImage: option.image }}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
