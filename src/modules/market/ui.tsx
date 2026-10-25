'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RESOURCES, type Resource } from '@/modules/realm/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { MarketApi } from './api'
import {
  type Amounts,
  MARKET_CHANNEL,
  type MarketList,
  type OfferError,
  type OfferStatus,
  type OfferView,
} from './contracts'

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<MarketApi>('/api/market')

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Label of each state of an offer. */
const OFFER_STATUS: Record<OfferStatus, string> = {
  reserving: 'Réservation en cours',
  open: 'Ouverte',
  settling: 'Règlement en cours',
  completed: 'Échange conclu',
  rejected: 'Refusée : stock insuffisant',
  withdrawn: 'Retirée',
}

/** Message shown to the player for each error. */
const ERRORS: Record<OfferError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  OFFER_NOT_FOUND: 'Offre introuvable.',
  ALREADY_EXISTS: 'Offre déjà publiée.',
  NOT_OPEN: "L'offre n'est plus disponible.",
  OWN_OFFER: 'Vous ne pouvez pas accepter votre propre offre.',
  NOT_SELLER: 'Seul le vendeur peut retirer son offre.',
  EXPIRED: "L'offre a expiré.",
  NOT_EXPIRED: "L'offre n'a pas expiré.",
}

/** Delay between two reads, while the projection has not reached the announced event. */
const RETRY_MS = 1_000

/** Maximum number of reads for the same announced event. */
const MAX_READS = 10

/**
 * Shows resource amounts, such as "60 bois, 30 pierre".
 *
 * @param props - Amounts to show.
 * @returns The amounts with their icons.
 */
function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

/**
 * Describes the outcome of a command, from the offer view returned by the API.
 *
 * @param view - View of the offer.
 * @returns The message shown to the player.
 */
function outcomeOf(view: OfferView): string {
  if (view.missing && view.status === 'open') {
    const missing = Object.entries(view.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Paiement refusé : il vous manque ${missing}.`
  }
  return OFFER_STATUS[view.status]
}

/**
 * Market screen: publishing an offer (one resource given, one wanted), the player's
 * offers and the other players' offers.
 *
 * @returns The market screen.
 */
export function MarketScreen() {
  const [list, setList] = useState<MarketList | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [give, setGive] = useState<{ resource: Resource; amount: number }>({
    resource: 'wood',
    amount: 50,
  })
  const [want, setWant] = useState<{ resource: Resource; amount: number }>({
    resource: 'stone',
    amount: 25,
  })

  /**
   * Reloads the list; on the server, reading dispatches the outbox, then catches the
   * projection up.
   *
   * @returns The position up to which the received list is up to date; 0 on failure.
   */
  const refresh = useCallback(async () => {
    const res = await client.offers.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setList(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Position of the last announced event. */
  const wanted = useRef(0)
  /** Whether a read loop is in progress. */
  const following = useRef(false)
  const status = useChannel(MARKET_CHANNEL, async (event) => {
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
  })

  /**
   * Shows the outcome of a command, whose response holds the offer view or an error,
   * then reloads the list.
   *
   * @param res - Response of the command.
   * @returns Resolves once the list is reloaded.
   */
  async function handle(res: Response) {
    const body = (await res.json()) as { view: OfferView } | { error: { code: string } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.', error: true })
    } else {
      setMessage({ text: outcomeOf(body.view), error: body.view.status === 'rejected' })
    }
    await refresh()
  }

  /** Publishes the offer of the form. */
  const publish = async () =>
    handle(
      await client.offers.$post({
        json: { give: { [give.resource]: give.amount }, want: { [want.resource]: want.amount } },
      }),
    )
  /**
   * Accepts an offer.
   *
   * @param id - Offer identifier.
   */
  const acceptOffer = async (id: string) =>
    handle(await client.offers[':id'].accept.$post({ param: { id } }))
  /**
   * Withdraws one of the player's offers.
   *
   * @param id - Offer identifier.
   */
  const withdrawOffer = async (id: string) =>
    handle(await client.offers[':id'].withdraw.$post({ param: { id } }))

  const mine = list?.offers.filter((offer) => offer.mine) ?? []
  const others = list?.offers.filter((offer) => !offer.mine) ?? []

  /**
   * Builds a picker for a resource and its amount.
   *
   * @param label - Label of the picker.
   * @param value - Current resource and amount.
   * @param onChange - Called with the new resource and amount.
   * @returns The picker controls.
   */
  const picker = (
    label: string,
    value: { resource: Resource; amount: number },
    onChange: (value: { resource: Resource; amount: number }) => void,
  ) => (
    <>
      <label htmlFor={`${label}-amount`}>{label}</label>
      <input
        id={`${label}-amount`}
        className="amount"
        type="number"
        min={1}
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
      />
      <select
        aria-label={`Ressource : ${label}`}
        value={value.resource}
        onChange={(e) => onChange({ ...value, resource: e.target.value as Resource })}
      >
        {RESOURCES.map((resource) => (
          <option key={resource} value={resource}>
            {look(resource).label}
          </option>
        ))}
      </select>
    </>
  )

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="market" /> Marché
        </h1>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="panel row">
        {picker('Je cède', give, setGive)}
        {picker('contre', want, setWant)}
        <button type="button" data-guide="publish-offer" onClick={publish}>
          Publier l'offre
        </button>
      </div>
      {message && (
        <p className={message.error ? 'error' : 'muted'} role="status">
          {message.text}
        </p>
      )}

      <section className="panel" aria-label="Vos offres">
        <h2>Vos offres</h2>
        {mine.length === 0 && <p className="muted">Aucune offre en cours.</p>}
        <ul className="offers">
          {mine.map((offer) => (
            <li key={offer.offerId}>
              <span>
                <AmountsText amounts={offer.give} /> contre <AmountsText amounts={offer.want} />{' '}
                <span className="muted">({OFFER_STATUS[offer.status]})</span>
              </span>
              {offer.status === 'open' && (
                <button type="button" onClick={() => withdrawOffer(offer.offerId)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Offres des autres joueurs">
        <h2>Offres des autres joueurs</h2>
        {others.length === 0 && <p className="muted">Aucune offre disponible.</p>}
        <ul className="offers">
          {others.map((offer) => (
            <li key={offer.offerId}>
              <span>
                {offer.sellerName} cède <AmountsText amounts={offer.give} /> contre{' '}
                <AmountsText amounts={offer.want} />
              </span>
              <button type="button" onClick={() => acceptOffer(offer.offerId)}>
                Accepter
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
