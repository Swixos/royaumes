'use client'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { SystemApi } from './api'

/**
 * Typed HTTP client inferred from the system Hono sub-app. Only the API type is
 * imported, so no server code is shipped to the browser.
 */
const client = hc<SystemApi>('/api/system')

/** Call result: loading, success with the server time, or failure. */
type Health = { status: 'loading' } | { status: 'ok'; time: string } | { status: 'error' }

/**
 * Shows whether the API responds, by calling the health route on mount.
 *
 * @returns The API status line.
 */
export function HealthStatus() {
  const [health, setHealth] = useState<Health>({ status: 'loading' })

  useEffect(() => {
    client.health
      .$get()
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setHealth({ status: 'ok', time: data.time })
      })
      .catch(() => setHealth({ status: 'error' }))
  }, [])

  if (health.status === 'loading') return <p className="muted">Interrogation de l'API...</p>
  if (health.status === 'error') return <p className="error">L'API ne répond pas.</p>
  return (
    <p className="muted">
      API disponible - heure du serveur : {new Date(health.time).toLocaleTimeString('fr-FR')}
    </p>
  )
}
