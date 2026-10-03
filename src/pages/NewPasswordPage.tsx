import { Page } from 'konsta/react'
import { Logo } from '../components/Logo'
import { SetPasswordForm } from '../components/SetPasswordForm'
import { useAuth } from '../lib/auth'

/** Shown after opening a password-reset email link (the user is signed in by the link). */
export function NewPasswordPage() {
  const { endRecovery, signOut } = useAuth()
  return (
    <Page className="pt-safe">
      <div className="flex min-h-full flex-col justify-center px-4 pb-10">
        <div className="fade-up mb-8 text-center">
          <Logo />
          <h2 className="mt-8 text-[24px] font-bold">Set a new password</h2>
          <p className="mt-1 text-[15px] text-muted">Choose a new password for your account.</p>
        </div>
        <SetPasswordForm submitLabel="Save and continue" onDone={endRecovery} />
        <button type="button" onClick={signOut} className="mt-6 text-[15px] text-muted">
          Cancel
        </button>
      </div>
    </Page>
  )
}
