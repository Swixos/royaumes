'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import { RANKING_CHANNEL, type Ranking } from './contracts'

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<RankingApi>('/api/ranking')

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Delay between two reads, while the projection has not reached the announced event. */
const RETRY_MS = 1_000

/** Maximum number of reads for the same announced event. */
const MAX_READS = 10

/**
 * Ranking screen: the best players, with the signed-in player highlighted.
 *
 * @param props - Identifier of the signed-in player.
 * @returns The ranking table, or a message when no player is ranked.
 */
export function RankingScreen({ userId }: { userId: string }) {
  const [ranking, setRanking] = useState<Ranking | undefined>(undefined)

  /**
   * Reloads the ranking; on the server, reading catches the projection up.
   *
   * @returns The position up to which the received ranking is up to date; 0 on failure.
   */
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setRanking(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Position of the last announced event. */
  const wanted = useRef(0)
  /** Whether a read loop is in progress. */
  const following = useRef(false)

  /**
   * Follows an event announced by the channel: the ranking is read again until the
   * projection reaches its position, since it may have stopped for a few seconds before
   * a missing position. A loop already in progress takes the new position into account.
   *
   * @param event - Announced event.
   * @returns Resolves once the ranking is up to date, or after the maximum number of reads.
   */
  const follow = useCallback(
    async (event: ChannelEvent) => {
      wanted.current = Math.max(wanted.current, event.position)
      if (following.current) return
      following.current = true
      try {
        for (let read = 0; read < MAX_READS; read++) {
          if ((await refresh()) >= wanted.current) return
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        }
      } finally {
        following.current = false
      }
    },
    [refresh],
  )

  const status = useChannel(RANKING_CHANNEL, follow)
  const entries = ranking?.entries

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="ranking" /> Classement
        </h1>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
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
