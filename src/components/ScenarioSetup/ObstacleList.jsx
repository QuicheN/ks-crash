// components/ScenarioSetup/ObstacleList.jsx
// The contents of the layout: add a type (which arms the map for click-to-place), select an
// entry, delete one. The type buttons come from the schema, so the catalogue and this list
// can never drift apart.
import { useDispatch, useSelector } from 'react-redux';
import { OBSTACLE_SCHEMA, OBSTACLE_TYPES, describeObstacle } from '../../obstacles/schema';
import { removeObstacle, selectObstacle } from '../../state/layoutSlice';
import { selectSceneObstacles, selectSelectedObstacleId } from '../../state/selectors';

export function ObstacleList({ pendingType, onArm }) {
  const obstacles = useSelector(selectSceneObstacles);
  const selectedId = useSelector(selectSelectedObstacleId);
  const dispatch = useDispatch();

  return (
    <section className="panel">
      <h2>Obstacles ({obstacles.length})</h2>

      <div className="type-row">
        {OBSTACLE_TYPES.map((type) => (
          <button
            key={type}
            className={`chip ${pendingType === type ? 'chip--armed' : ''}`}
            style={{ '--chip-color': OBSTACLE_SCHEMA[type].mapColor }}
            // Clicking again disarms, so an accidental arm doesn't force a placement.
            onClick={() => onArm(pendingType === type ? null : type)}
          >
            + {OBSTACLE_SCHEMA[type].label}
          </button>
        ))}
      </div>
      <p className="hint">
        {pendingType
          ? `Click the map to place a ${OBSTACLE_SCHEMA[pendingType].label.toLowerCase()}.`
          : 'Pick a type, then click the map to place it.'}
      </p>

      <ul className="obstacle-list">
        {obstacles.map((obstacle) => (
          <li key={obstacle.id} className={obstacle.id === selectedId ? 'row row--selected' : 'row'}>
            <button className="row-main" onClick={() => dispatch(selectObstacle(obstacle.id))}>
              <span className="swatch" style={{ background: OBSTACLE_SCHEMA[obstacle.type]?.mapColor }} />
              {describeObstacle(obstacle)}
            </button>
            <button
              className="row-delete"
              aria-label={`Delete ${describeObstacle(obstacle)}`}
              onClick={() => dispatch(removeObstacle(obstacle.id))}
            >
              ✕
            </button>
          </li>
        ))}
        {obstacles.length === 0 && <li className="hint">Empty layout — nothing to crash into.</li>}
      </ul>
    </section>
  );
}
