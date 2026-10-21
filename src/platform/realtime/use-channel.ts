'use client'
import { useEffect, useRef, useState } from 'react'

/** State of the connection to a channel, shown by the interface. */
export type ChannelStatus = 'connecting' | 'open' | 'reconnecting'

/** Event received on a channel: an event store event in its generic form. */
export interface ChannelEvent {
  /** Global order of the event, across all streams. */
  position: number
  /** Stream the event belongs to. */
  stream: string
  /** Rank of the event in its stream. */
  version: number
  /** Event type. */
  type: string
  /** Event payload. */
  data: Record<string, unknown>
}

/**
 * React hook subscribing to a real-time channel. The browser `EventSource`
 * reconnects on its own after an interruption and sends `Last-Event-ID`, so
 * resuming needs no code here; the session cookie is sent automatically since
 * the stream is on the same domain. The callback is kept in a ref so that a new
 * callback on each render does not close and reopen the connection.
 *
 * @param channel - Channel to listen to; `null` to stay disconnected.
 * @param onEvent - Called with each event received.
 * @returns The connection status: `open` once the `ready` message is received,
 *   `reconnecting` after an error, `connecting` before.
 */
export function useChannel(channel: string | null, onEvent: (event: ChannelEvent) => void) {
  const [status, setStatus] = useState<ChannelStatus>('connecting')

  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!channel) return
    const source = new EventSource(`/api/stream/${encodeURIComponent(channel)}`)

    source.addEventListener('ready', () => setStatus('open'))
    source.addEventListener('domain-event', (message) => {
      handler.current(JSON.parse((message as MessageEvent<string>).data))
    })
    source.onerror = () => setStatus('reconnecting')

    return () => source.close()
  }, [channel])

  return status
}
