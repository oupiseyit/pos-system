import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
// ponytail: the approved v2 mockup stylesheet is the app's stylesheet; one source of truth for tokens
import '../../../mockups/v2/styles.css';
import { ToastProvider } from '../../backoffice/src/ui';
import './app.css';
import { App } from './App';

// Service worker (app shell offline). A new version waits until the cashier reloads.
const updateSW = registerSW({ onNeedRefresh: () => dispatchEvent(new Event('pos:update')) });

function UpdatePrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    addEventListener('pos:update', on);
    return () => removeEventListener('pos:update', on);
  }, []);
  if (!show) return null;
  return (
    <div className="toast update" role="status">
      A new version is ready.
      <button className="btn btn-sm" onClick={() => updateSW(true)}>
        Reload
      </button>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <App />
      <UpdatePrompt />
    </ToastProvider>
  </StrictMode>,
);
