import Link from 'next/link'
import { HealthStatus } from '@/modules/system/ui'

/**
 * Temporary home page, replaced once authentication is in place.
 *
 * @returns The home page with the API status and a link to the village.
 */
export default function Home() {
  return (
    <>
      <h1>Royaumes</h1>
      <p className="muted">Le socle du projet est en place.</p>
      <HealthStatus />
      <p>
        <Link href="/village">Accéder au village</Link>
      </p>
    </>
  )
}
