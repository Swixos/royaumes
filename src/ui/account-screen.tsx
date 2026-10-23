'use client'
import { useState } from 'react'

/** Phrase the player must type to confirm the deletion of their account. */
const CONFIRMATION = 'SUPPRIMER'

/**
 * "My data" screen: export of personal data, rectification of the name, and deletion of
 * the account. It belongs to
 * no module, since player rights cover the whole game. The export link lets the browser
 * download the JSON file, thanks to the `Content-Disposition` header returned by the API.
 *
 * @returns The account screen.
 */
export function AccountScreen() {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [renamed, setRenamed] = useState<{ text: string; error: boolean } | null>(null)

  const exportUrl = '/api/account/export'

  /**
   * Deletes the account. Deletion cannot be undone, so it is only sent once the
   * confirmation phrase is typed. On success, the account and its sessions no longer
   * exist, and the player goes back to the sign-in page.
   *
   * @returns Resolves once the response is handled.
   */
  async function erase() {
    setBusy(true)
    const res = await fetch('/api/account', { method: 'DELETE' })
    if (res.ok) {
      window.location.href = '/login'
    } else {
      setBusy(false)
      setError("La suppression n'a pas abouti. Vous pouvez la relancer.")
    }
  }

  /**
   * Rectifies the name of the player everywhere it is copied, then reloads the page so
   * the navigation shows the new name.
   *
   * @returns Resolves once the response is handled.
   */
  async function rectify() {
    const res = await fetch('/api/account/name', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const body = await res.json()
    if (res.ok) {
      setRenamed({ text: `Votre nom est désormais ${body.name}.`, error: false })
      window.location.reload()
    } else {
      setRenamed({ text: body.error?.message ?? "La rectification n'a pas abouti.", error: true })
    }
  }

  return (
    <>
      <h1>Mes données</h1>

      <section className="panel" aria-label="Exporter mes données">
        <h2>Exporter mes données</h2>
        <p>
          Téléchargez, au format JSON, l'ensemble des données que le jeu conserve à votre sujet :
          compte, village, expéditions, offres, messages, classement et raids.
        </p>
        <a className="button" href={exportUrl} download>
          Télécharger mes données
        </a>
      </section>

      <section className="panel" aria-label="Corriger mon nom">
        <h2>Corriger mon nom</h2>
        <p>
          Votre nom est remplacé partout où le jeu l'a recopié : expéditions, offres, messages,
          classement et raids de la Flotte.
        </p>
        <div className="row">
          <label htmlFor="new-name">Nouveau nom</label>
          <input
            id="new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            maxLength={40}
          />
          <button type="button" disabled={name.trim().length < 2} onClick={rectify}>
            Corriger
          </button>
        </div>
        {renamed && (
          <p className={renamed.error ? 'error' : 'ok'} aria-live="polite">
            {renamed.text}
          </p>
        )}
      </section>

      <section className="panel" aria-label="Supprimer mon compte">
        <h2>Supprimer mon compte</h2>
        <p>
          Votre compte, vos messages et votre présence dans la Taverne sont supprimés. Votre nom et
          celui de votre village sont remplacés partout ailleurs par une mention neutre. Cette
          opération est irréversible.
        </p>
        <div className="row">
          <label htmlFor="confirmation">Saisissez {CONFIRMATION} pour confirmer</label>
          <input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="danger"
            disabled={busy || confirmation !== CONFIRMATION}
            onClick={erase}
          >
            Supprimer mon compte
          </button>
        </div>
        {error && (
          <p className="error" role="status">
            {error}
          </p>
        )}
      </section>
    </>
  )
}
