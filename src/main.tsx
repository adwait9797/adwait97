import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Must run first: on the old address it hands the login to the custom domain and stops here.
import { redirectingToCanonical } from './lib/domainRedirect'
import '@fontsource-variable/inter/opsz.css'
import './index.css'

if (!redirectingToCanonical) {
  // Loaded lazily so the Supabase client is never created on a page that is redirecting away.
  import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
