// components/ScenarioSetup/ObstacleFields.jsx
// The property editor for the selected obstacle. Every input is generated from
// `fieldsFor(type)` in obstacles/schema.js — this file contains no knowledge of walls, trees,
// ramps or pads, so a fifth obstacle type needs a schema entry and nothing here.
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fieldsFor, readField, OBSTACLE_SCHEMA } from '../../obstacles/schema';
import { setObstacleField } from '../../state/layoutSlice';
import { selectSelectedObstacle } from '../../state/selectors';

/**
 * A number input keeps its own TEXT while focused. Without that, clearing the box to type a
 * new value round-trips through the store as an empty string — and an empty string reaching a
 * collider dimension is a NaN in the physics world, not just a rendering glitch. The store is
 * only updated on a value that parses.
 *
 * Unfocused, the input shows the STORE's value rather than the local text, so a position
 * changed by dragging on the map appears here with no syncing effect to go wrong.
 */
function FieldInput({ obstacleId, field, value }) {
  const dispatch = useDispatch();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  if (field.type === 'color') {
    return (
      <input
        type="color"
        value={value}
        onChange={(e) => dispatch(setObstacleField({ id: obstacleId, field, value: e.target.value }))}
      />
    );
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      step={field.step ?? 1}
      value={focused ? text : String(value)}
      onFocus={() => {
        setText(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(parsed)) {
          dispatch(setObstacleField({ id: obstacleId, field, value: parsed }));
        }
      }}
    />
  );
}

export function ObstacleFields() {
  const obstacle = useSelector(selectSelectedObstacle);

  if (!obstacle) {
    return (
      <section className="panel">
        <h2>Properties</h2>
        <p className="hint">Select an obstacle to edit it.</p>
      </section>
    );
  }

  const rounded = (n) => Math.round(n * 1000) / 1000;

  return (
    <section className="panel">
      <h2>{OBSTACLE_SCHEMA[obstacle.type]?.label ?? obstacle.type}</h2>
      {/* Remounting on selection change resets every input's local text at once. */}
      <div className="field-grid" key={obstacle.id}>
        {fieldsFor(obstacle.type).map((field) => (
          <label key={`${field.key}${field.index ?? ''}`}>
            <span>
              {field.label}
              {field.unit ? ` (${field.unit})` : ''}
            </span>
            <FieldInput
              obstacleId={obstacle.id}
              field={field}
              value={field.type === 'color' ? readField(obstacle, field) : rounded(readField(obstacle, field))}
            />
          </label>
        ))}
      </div>
      {/* Y is derived, never typed: a wall's position is its centre, everything else sits on
          the ground. See normalizeObstacle() in obstacles/schema.js. */}
      <p className="hint">Height above ground is set automatically for this type.</p>
    </section>
  );
}
