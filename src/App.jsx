// App.jsx
import { useEffect, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import { store } from './state/store';
import { SceneCanvas } from './rendering/SceneCanvas';
import { LayoutEditor } from './components/ScenarioSetup/LayoutEditor';
import { TabBar } from './components/TabBar';
import { selectActiveTab } from './state/selectors';
import { initWorld } from './physics/world';

// Inside the Provider so it can read the active tab.
function Workspace() {
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="app-layout">
      <TabBar />
      <div className="tab-area">
        {/* The simulator is ALWAYS mounted — unmounting it would tear down the Rapier world
            and the vehicle on every tab switch, and `display: none` is just as bad: r3f sizes
            the canvas from its parent, so a zero-sized parent resizes the drawing buffer to 0
            and back on each switch. `visibility: hidden` keeps the element laid out. */}
        <main className={`viewport ${activeTab === 'simulator' ? '' : 'viewport--hidden'}`}>
          <SceneCanvas />
        </main>
        {activeTab === 'editor' && <LayoutEditor />}
      </div>
    </div>
  );
}

function App() {
  const [worldReady, setWorldReady] = useState(false);

  useEffect(() => {
    initWorld().then(() => setWorldReady(true));
  }, []);

  if (!worldReady) return <div>Loading physics engine…</div>;

  return (
    <Provider store={store}>
      <Workspace />
    </Provider>
  );
}

export default App;
