// components/ScenarioSetup/LayoutEditor.jsx
// The editor tab. Composition only — the state lives in `layoutSlice`, the rules live in
// `obstacles/schema.js`, and storage lives behind `persistence/`.
//
// Everything edited here is LIVE: the draft's obstacle array is exactly what SceneCanvas
// renders, so adding a wall creates its rigid body immediately, and switching to the
// simulator tab shows a world that is already up to date.
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { renameDraft } from '../../state/layoutSlice';
import { selectDraftId, selectDraftName, selectObstacleCounts } from '../../state/selectors';
import { ObstacleFields } from './ObstacleFields';
import { ObstacleList } from './ObstacleList';
import { SavedLayoutsPanel } from './SavedLayoutsPanel';
import { TopDownMap } from './TopDownMap';

export function LayoutEditor() {
  const name = useSelector(selectDraftName);
  const draftId = useSelector(selectDraftId);
  const counts = useSelector(selectObstacleCounts);
  const dispatch = useDispatch();
  // Which type the next map click places. Local because it is a transient interaction mode,
  // not part of the layout.
  const [pendingType, setPendingType] = useState(null);

  return (
    <div className="editor">
      <header className="editor-header">
        <label className="name-field">
          <span>Layout name</span>
          <input value={name} onChange={(e) => dispatch(renameDraft(e.target.value))} />
        </label>
        <p className="meta">
          {draftId ? 'Saved layout' : 'Unsaved'} ·{' '}
          {counts.length ? counts.map((c) => `${c.count} ${c.label.toLowerCase()}`).join(', ') : 'empty'}
        </p>
      </header>

      <div className="editor-body">
        <aside className="editor-side">
          <SavedLayoutsPanel />
          <ObstacleList pendingType={pendingType} onArm={setPendingType} />
          <ObstacleFields />
        </aside>
        <TopDownMap pendingType={pendingType} onPlaced={() => setPendingType(null)} />
      </div>
    </div>
  );
}
