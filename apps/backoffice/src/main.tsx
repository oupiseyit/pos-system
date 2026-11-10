import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// ponytail: the approved v2 mockup stylesheet is the app's stylesheet; one source of truth for tokens
import '../../../mockups/v2/styles.css';
import './app.css';
import { App } from './App';
import { ToastProvider } from './ui';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
