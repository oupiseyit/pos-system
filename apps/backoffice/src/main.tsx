import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [api, setApi] = useState('checking…');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ status: string }>)
      .then((b) => setApi(b.status))
      .catch(() => setApi('unreachable'));
  }, []);
  return (
    <main>
      <h1>Hello, Back office</h1>
      <p>API: {api}</p>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
