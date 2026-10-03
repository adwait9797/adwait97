import { App as KonstaApp, Preloader } from 'konsta/react'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { AuthPage } from './pages/AuthPage'
import { Home } from './pages/Home'
import { NewPasswordPage } from './pages/NewPasswordPage'
import { Onboarding } from './pages/Onboarding'

function Screens() {
  const { session, profile, loading, recovery } = useAuth()

  if (loading || (session && !profile)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Preloader />
      </div>
    )
  }
  if (!session) return <AuthPage />
  if (recovery) return <NewPasswordPage />
  if (!profile!.onboarded) return <Onboarding />
  return <Home profile={profile!} />
}

export default function App() {
  return (
    <KonstaApp theme="ios" dark safeAreas className="h-full">
      {isConfigured ? (
        <AuthProvider>
          <Screens />
        </AuthProvider>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
          <h1 className="text-2xl font-bold">Almost there</h1>
          <p className="text-muted">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see README) and reload.
          </p>
        </div>
      )}
    </KonstaApp>
  )
}
