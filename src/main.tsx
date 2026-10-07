import { StrictMode } from 'react'
import { IconContext } from '@phosphor-icons/react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/noto-sans-tc'
import App from './App.tsx'
import { guardTranslationDom } from './lib/translationDomGuard'

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.message, event.error?.stack || '')
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandled-rejection]', event.reason instanceof Error ? event.reason.stack : event.reason)
})

// Phosphor defaults to its 'regular' weight, which is thinner than the icon
// language this interface is built around. Setting it once here beats repeating
// weight="bold" on every one of the several hundred call sites.
const appRoot = document.getElementById('root')!
guardTranslationDom(appRoot)
createRoot(appRoot).render(
  <StrictMode>
    <IconContext.Provider value={{ weight: 'bold' }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
)
