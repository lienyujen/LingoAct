import { StrictMode } from 'react'
import { IconContext } from '@phosphor-icons/react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.message, event.error?.stack || '')
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandled-rejection]', event.reason instanceof Error ? event.reason.stack : event.reason)
})

// Phosphor defaults to its 'regular' weight, which is thinner than the icon
// language this interface is built around. Setting it once here beats repeating
// weight="bold" on every one of the several hundred call sites.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ weight: 'bold' }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
)
