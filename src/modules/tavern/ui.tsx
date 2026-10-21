'use client'
import { hc } from 'hono/client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { TavernApi } from './api'
import {
  HEARTBEAT_MS,
  MESSAGE_MAX_LENGTH,
  type MessageError,
  type PresentPlayer,
  TAVERN_CHANNEL,
  type TavernMessage,
} from './contracts'

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<TavernApi>('/api/tavern')

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/**
 * Builds the message shown to the player for an error.
 *
 * @param error - Error returned by the API.
 * @returns The message.
 */
function errorText(error: MessageError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'EMPTY_MESSAGE':
      return 'Le message est vide.'
    case 'MESSAGE_TOO_LONG':
      return `Le message dépasse ${error.max} caractères.`
    case 'TOO_MANY_MESSAGES':
      return `Trop de messages : patientez ${Math.ceil(error.retryAfterMs / 1000)} secondes.`
    case 'INVALID_INPUT':
      return 'Saisie invalide.'
  }
}

/**
 * Adds messages to the list, without duplicates, in identifier order.
 *
 * @param current - Messages already shown.
 * @param added - Messages to add.
 * @returns The merged list.
 */
function merge(current: TavernMessage[], added: TavernMessage[]): TavernMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of added) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/**
 * Departure being sent. A presence signal waits for it to be received: otherwise, a
 * player leaving the tavern and coming back at once could see their departure reach the
 * server after their new signal, and vanish from the list of present players.
 */
let leaving: Promise<unknown> = Promise.resolve()

/**
 * Signals the departure of the player. The `keepalive` option keeps the request alive
 * while the tab closes.
 */
function leave() {
  leaving = fetch('/api/tavern/presence/leave', { method: 'POST', keepalive: true }).catch(() => {})
}

/**
 * Formats the time of a message in the local format.
 *
 * @param at - Time in milliseconds.
 * @returns The hours and minutes.
 */
const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Tavern screen: chat room and present players. New messages arrive with their content
 * on the channel. Each time the channel opens, including after a reconnection, the
 * history is read again, since the channel only sends upcoming messages. The page sends
 * a presence signal right away, then regularly while shown, and signals the departure
 * when the player leaves the page or closes the tab.
 *
 * @param props - Identifier of the signed-in player, whose messages are highlighted.
 * @returns The tavern screen.
 */
export function TavernScreen({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<TavernMessage[]>([])
  const [players, setPlayers] = useState<PresentPlayer[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  /** Reloads the latest messages. */
  const refresh = useCallback(async () => {
    const res = await client.messages.$get()
    if (!res.ok) return
    const latest = (await res.json()).messages
    setMessages((current) => merge(current, latest))
  }, [])

  const status = useChannel(TAVERN_CHANNEL, (event) => {
    setMessages((current) => merge(current, [event.data as unknown as TavernMessage]))
  })

  useEffect(() => {
    if (status === 'open') refresh()
  }, [status, refresh])

  useEffect(() => {
    /** Sends a presence signal and updates the present players. */
    const beat = async () => {
      await leaving
      const res = await client.presence.$post()
      if (res.ok) setPlayers((await res.json()).players)
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [])

  /**
   * Posts the draft message.
   *
   * @param event - Form submission.
   * @returns Resolves once the response is handled.
   */
  async function send(event: FormEvent) {
    event.preventDefault()
    const res = await client.messages.$post({ json: { body: draft } })
    const body = await res.json()
    if ('error' in body) {
      setError(errorText(body.error as MessageError))
    } else {
      setError(null)
      setDraft('')
      setMessages((current) => merge(current, [body.message]))
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="tavern" /> Taverne
        </h1>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="tavern">
        <section className="panel" aria-label="Messages">
          {messages.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
          <ul className="messages">
            {messages.map((message) => (
              <li key={message.id} data-mine={message.authorId === userId || undefined}>
                <span className="muted">{timeOf(message.postedAt)}</span>{' '}
                <strong>{message.authorName}</strong> {message.body}
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={send}>
            <input
              aria-label="Votre message"
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH * 2}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Votre message"
              style={{ flex: 1 }}
            />
            <button type="submit">Envoyer</button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="panel" aria-label="Joueurs présents">
          <h2>Présents</h2>
          <ul className="presence">
            {players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
