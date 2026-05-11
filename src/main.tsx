import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'

// Inicializa Sentry antes de tudo (no-op se VITE_SENTRY_DSN não estiver setado)
initSentry()

console.log('App mounting...');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
