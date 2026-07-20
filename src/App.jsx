// App.jsx
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './state/store';
import { SceneCanvas } from './rendering/SceneCanvas';
import { initWorld } from './physics/world';

function App() {
  const [worldReady, setWorldReady] = useState(false);

  useEffect(() => {
    initWorld().then(() => setWorldReady(true));
  }, []);

  if (!worldReady) return <div>Loading physics engine…</div>;

  return (
    <Provider store={store}>
      <div className="app-layout">
        <main className="viewport">
          <SceneCanvas />
        </main>
      </div>
    </Provider>
  );
}

export default App;