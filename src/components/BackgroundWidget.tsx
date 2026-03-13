import { BACKGROUNDS } from '../constants/backgrounds';
import { InfoHint } from './InfoHint';

interface BackgroundWidgetProps {
  currentId: string;
  onSelect: (id: string) => void;
}

export function BackgroundWidget({ currentId, onSelect }: BackgroundWidgetProps): JSX.Element {
  const currentLabel = BACKGROUNDS.find((option) => option.id === currentId)?.label ?? 'Scene';

  return (
    <aside className="panel background-widget" aria-label="Background scene selector">
      <div className="panel-header-row">
        <div>
          <div className="panel-title-row">
            <h2>Scene</h2>
            <InfoHint text="Local visual theme." label="About scene theme" />
          </div>
        </div>
        <div className="panel-header-badges">
          <span className="badge badge-accent">Active</span>
          <span className="badge">{currentLabel}</span>
        </div>
      </div>
      <p className="muted-text background-widget-hint">Scene changes are local to this device and do not affect other players.</p>
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
