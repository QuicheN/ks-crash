// components/ScenarioSetup/SavedLayoutsPanel.jsx
// Save / load / delete stored layouts.
//
// Note what this file does NOT import: anything from `persistence/`. It dispatches thunks and
// reads selectors, so it is unaware that layouts currently live in localStorage — which is the
// whole point of the split. When the MongoDB backend lands, this component does not change.
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { storageName } from '../../persistence';
import {
  loadBuiltInLayout,
  openLayout,
  refreshSavedLayouts,
  removeLayout,
  saveDraft,
  startNewLayout,
} from '../../state/layoutSlice';
import {
  selectDraftId,
  selectLayoutError,
  selectLayoutStatus,
  selectSavedLayouts,
} from '../../state/selectors';

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function SavedLayoutsPanel() {
  const saved = useSelector(selectSavedLayouts);
  const draftId = useSelector(selectDraftId);
  const status = useSelector(selectLayoutStatus);
  const error = useSelector(selectLayoutError);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(refreshSavedLayouts());
  }, [dispatch]);

  const busy = status !== 'idle';

  // Refresh the list after a save so a new layout appears with its assigned id and timestamp —
  // both of which come from the repository, never from here.
  const save = async (saveAs) => {
    const result = await dispatch(saveDraft({ saveAs }));
    if (result.meta.requestStatus === 'fulfilled') dispatch(refreshSavedLayouts());
  };

  return (
    <section className="panel">
      <h2>Saved layouts</h2>

      <div className="button-row">
        <button onClick={() => save(false)} disabled={busy}>
          {draftId ? 'Save' : 'Save as new'}
        </button>
        <button onClick={() => save(true)} disabled={busy}>
          Save a copy
        </button>
        <button className="ghost" onClick={() => dispatch(startNewLayout())} disabled={busy}>
          New
        </button>
        <button className="ghost" onClick={() => dispatch(loadBuiltInLayout())} disabled={busy}>
          Built-in
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <ul className="saved-list">
        {saved.map((layout) => (
          <li key={layout.id} className={layout.id === draftId ? 'row row--selected' : 'row'}>
            <button className="row-main" onClick={() => dispatch(openLayout(layout.id))} disabled={busy}>
              <strong>{layout.name}</strong>
              <span className="meta">
                {layout.obstacleCount} obstacle{layout.obstacleCount === 1 ? '' : 's'} ·{' '}
                {formatWhen(layout.updatedAt)}
              </span>
            </button>
            <button
              className="row-delete"
              aria-label={`Delete ${layout.name}`}
              onClick={() => dispatch(removeLayout(layout.id))}
              disabled={busy}
            >
              ✕
            </button>
          </li>
        ))}
        {saved.length === 0 && <li className="hint">Nothing saved yet.</li>}
      </ul>

      {/* Visible so a backend swap is obvious while testing it. */}
      <p className="hint">Storage: {storageName}</p>
    </section>
  );
}
