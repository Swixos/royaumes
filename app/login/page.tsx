'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { HealthStatus } from '@/modules/system/ui'
import { authClient } from '@/platform/auth/client'
import { Icon } from '@/ui/icons'

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
    <main className="login">
      <section className="login-scene" aria-label="Royaumes">
        <svg
          className="scene"
          viewBox="0 0 800 900"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
        >
          <rect width="800" height="900" fill="#a9d6e6" />
          <circle cx="640" cy="170" r="70" fill="#ffd25c" />
          <g fill="#ffffff">
            <ellipse cx="180" cy="300" rx="90" ry="26" />
            <ellipse cx="240" cy="282" rx="60" ry="30" />
            <ellipse cx="560" cy="330" rx="80" ry="22" />
            <ellipse cx="610" cy="314" rx="50" ry="26" />
          </g>
          <path
            d="M0 560 L120 450 L220 520 L330 420 L460 530 L560 460 L680 540 L800 470 V600 H0 Z"
            fill="#7fabb9"
          />
          <rect y="580" width="800" height="320" fill="#2f86a8" />
          <path
            d="M0 610 h800 v14 h-800z M0 700 h800 v10 h-800z M0 800 h800 v12 h-800z"
            fill="#56a7c2"
          />
          <path d="M260 700 C300 610 520 600 590 690 C600 730 270 740 260 700 Z" fill="#e6d29a" />
          <path d="M300 680 C340 630 500 625 550 675 C520 690 330 695 300 680 Z" fill="#7a9a45" />
          <Icon kind="village" size={170} x={340} y={480} color="#5b3a22" />
          <Icon kind="brand" size={90} x={500} y={560} color="#8f2a20" />
          <Icon kind="fleet" size={150} x={70} y={640} color="#2a170a" />
          <Icon kind="trireme" size={130} x={590} y={720} color="#2a170a" />
          <Icon kind="pirates" size={70} x={690} y={560} color="#2a1a10" />
          <path
            d="M60 860 q30-14 60 0 t60 0 t60 0 M420 840 q30-14 60 0 t60 0"
            fill="none"
            stroke="#9fd2e3"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
        <div className="login-title">
          <span className="crest">
            <span className="crest-badge">
              <Icon kind="brand" />
            </span>
            <span className="crest-name">Royaumes</span>
          </span>
          <h1>Bâtissez un village. Armez une flotte. Gouvernez les mers.</h1>
          <p>
            Produisez, échangez, explorez le donjon et lancez vos trirèmes contre les ports voisins
            et les îles pirates.
          </p>
        </div>
      </section>

      <div className="login-side">
        <section
          className="panel login-card"
          aria-label={mode === 'signIn' ? 'Connexion' : 'Création de compte'}
        >
          <h2>{mode === 'signIn' ? 'Connexion' : 'Création de compte'}</h2>
          <form className="stack" onSubmit={submit}>
            {mode === 'signUp' && (
              <label className="field">
                <span>Pseudo</span>
                <input
                  name="name"
                  placeholder="Votre nom de seigneur"
                  required
                  minLength={2}
                  maxLength={30}
                />
              </label>
            )}
            <label className="field">
              <span>Adresse électronique</span>
              <input
                name="email"
                type="email"
                placeholder="vous@exemple.fr"
                required
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Mot de passe</span>
              <input
                name="password"
                type="password"
                placeholder="8 caractères minimum"
                required
                minLength={8}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              />
            </label>
            <button type="submit" className="primary" disabled={pending}>
              {mode === 'signIn' ? 'Entrer dans le royaume' : 'Fonder mon royaume'}
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
          <HealthStatus />
        </section>
      </div>
    </main>
  )
}
