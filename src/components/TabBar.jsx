// components/TabBar.jsx
// Switches between the simulator and the layout editor. Both are always mounted (see
// App.jsx) — this only changes which one is visible.
import { useDispatch, useSelector } from 'react-redux';
import { setActiveTab } from '../state/uiSlice';
import { selectActiveTab } from '../state/selectors';

const TABS = [
  { id: 'simulator', label: 'Simulator' },
  { id: 'editor', label: 'Layout editor' },
];

export function TabBar() {
  const activeTab = useSelector(selectActiveTab);
  const dispatch = useDispatch();

  return (
    <nav className="tab-bar" role="tablist" aria-label="Main">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeTab === id}
          className={`tab ${activeTab === id ? 'tab--active' : ''}`}
          onClick={() => dispatch(setActiveTab(id))}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
