'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { HealthStatus } from '@/modules/system/ui'
import { authClient } from '@/platform/auth/client'
import { Entity } from '@/ui/entity'

/**
 * Messages shown for the errors returned by Better Auth. The original English
 * message is never shown as is.
 */
const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Adresse ou mot de passe incorrect.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Cette adresse est déjà utilisée.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit comporter au moins 8 caractères.',
  VALIDATION_ERROR: 'Saisie invalide.',
}

/**
 * Picks the message to show for a Better Auth error.
 *
 * @param error - Error returned by the authentication client.
 * @param error.code - Better Auth error code, if any.
 * @param error.status - HTTP status code.
 * @returns A specific message for rate limiting (429) and known codes, a generic one otherwise.
 */
function messageFor(error: { code?: string; status: number }): string {
  if (error.status === 429) return 'Trop de tentatives : réessayez dans une minute.'
  return (error.code && ERRORS[error.code]) || 'La connexion a échoué.'
}

/**
 * Sign-in and sign-up page. On success the server sets the session cookie and
 * the page redirects to the village.
 *
 * @returns The sign-in or sign-up form, depending on the current mode.
 */
export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  /**
   * Signs the player up or in, then redirects to the village or shows the error.
   *
   * @param event - Form submit event.
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))

    setPending(true)
    setError(null)
    const result =
      mode === 'signUp'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
        : await authClient.signIn.email({ email, password })
    setPending(false)

    if (result.error) setError(messageFor(result.error))
    else router.push('/village')
  }

  return (
    <>
      <h1>
        <Entity kind="village" /> Royaumes
      </h1>
      <p className="muted">{mode === 'signIn' ? 'Connexion' : 'Création de compte'}</p>
      <div className="panel">
        <form onSubmit={submit}>
          {mode === 'signUp' && (
            <input name="name" placeholder="Pseudo" required minLength={2} maxLength={30} />
          )}
          <input
            name="email"
            type="email"
            placeholder="Adresse électronique"
            required
            autoComplete="email"
          />
          <input
            name="password"
            type="password"
            placeholder="Mot de passe (8 caractères minimum)"
            required
            minLength={8}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          />
          <button type="submit" disabled={pending}>
            {mode === 'signIn' ? 'Se connecter' : 'Créer mon compte'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
        <p>
          <button
            className="link"
            type="button"
            onClick={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn')
              setError(null)
            }}
          >
            {mode === 'signIn' ? 'Pas de compte ? En créer un' : 'Déjà un compte ? Se connecter'}
          </button>
        </p>
      </div>
      <HealthStatus />
    </>
  )
}
