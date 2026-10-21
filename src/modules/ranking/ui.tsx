'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import type { RankingEntry } from './contracts'

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<RankingApi>('/api/ranking')

/**
 * Ranking screen: the best players, with the signed-in player highlighted.
 *
 * @param props - Identifier of the signed-in player.
 * @returns The ranking table, or a message when no player is ranked.
 */
export function RankingScreen({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<RankingEntry[] | undefined>(undefined)

  /** Reloads the ranking; on the server, reading catches the projection up. */
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (res.ok) setEntries((await res.json()).entries)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="ranking" /> Classement
        </h1>
        <button className="link" type="button" onClick={refresh}>
          Actualiser
        </button>
      </div>
      <section className="panel" aria-label="Classement des joueurs">
        {entries?.length === 0 && <p className="muted">Aucun joueur classé pour le moment.</p>}
        {entries && entries.length > 0 && (
          <table className="ranking">
            <thead>
              <tr>
                <th>Rang</th>
                <th>Joueur</th>
                <th>Victoires</th>
                <th>Expéditions</th>
                <th>
                  <Entity kind="gold" />
                </th>
                <th>Meilleur butin</th>
                <th>Améliorations</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerId}
                  aria-current={entry.playerId === userId ? 'true' : undefined}
                >
                  <td>{entry.rank}</td>
                  <td>{entry.label}</td>
                  <td>{entry.gamesWon}</td>
                  <td>{entry.gamesPlayed}</td>
                  <td>{entry.gold}</td>
                  <td>{entry.bestLoot}</td>
                  <td>{entry.upgrades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
