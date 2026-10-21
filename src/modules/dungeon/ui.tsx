'use client'
import { hc } from 'hono/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { useCountdown } from '@/ui/use-countdown'
import type { DungeonApi } from './api'
import {
  type Action,
  DIFFICULTIES,
  type Difficulty,
  type Effect,
  type GameError,
  type GameView,
  gameChannel,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
} from './contracts'

/** Typed HTTP client inferred from the dungeon Hono sub-app. */
const client = hc<DungeonApi>('/api/dungeon')

/** Errors the API can return: domain errors and the validation error. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message shown to the player for each error. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  GAME_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  NOT_YOUR_TURN: "Ce n'est pas votre tour.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Label shown for each difficulty level. */
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Facile', hard: 'Difficile' }

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/**
 * Dungeon home screen: open expeditions and opening a new one.
 *
 * @returns The lobby screen.
 */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')

  /** Reloads the list of open expeditions. */
  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Opens a new expedition and goes to its page. */
  async function open() {
    const res = await client.games.$post({ json: { difficulty } })
    if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
  }

  return (
    <>
      <h1>
        <Entity kind="dungeon" /> Donjon
      </h1>
      <div className="panel row">
        <label htmlFor="difficulty">Niveau</label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
        >
          {DIFFICULTIES.map((level) => (
            <option key={level} value={level}>
              {DIFFICULTY_LABELS[level]}
            </option>
          ))}
        </select>
        <button type="button" onClick={open}>
          Ouvrir une nouvelle expédition
        </button>
      </div>
      <section className="panel" aria-label="Expéditions ouvertes">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Expéditions ouvertes</h2>
          <button className="link" type="button" onClick={refresh}>
            Actualiser
          </button>
        </div>
        {games?.length === 0 && <p className="muted">Aucune expédition ouverte pour le moment.</p>}
        <ul className="games">
          {games?.map((game) => (
            <li key={game.gameId}>
              <span>
                Expédition de {game.hostName}{' '}
                <span className="muted">
                  ({game.heroCount}/{MAX_HEROES} héros)
                </span>
              </span>
              <Link href={`/dungeon/${game.gameId}`}>Voir</Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/**
 * Builds the displayed name of a monster, numbered when the room holds several
 * of the same kind.
 *
 * @param monster - Monster to name.
 * @param monsters - Monsters of the room.
 * @returns The displayed name.
 */
function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/**
 * Describes an action as the player chose it.
 *
 * @param action - Chosen action.
 * @param nameOf - Resolves a fighter identifier to its name.
 * @returns The description shown to the player.
 */
function describeAction(action: Action, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

/**
 * Prefixes a phrase with the French preposition "de", elided before a vowel.
 *
 * @param text - Phrase to prefix.
 * @returns The phrase preceded by "d'" or "de".
 */
const ofVerb = (text: string) => (/^[aeéiou]/i.test(text) ? `d'${text}` : `de ${text}`)

/**
 * Describes an effect of the last round.
 *
 * @param effect - Damage or heal.
 * @param nameOf - Resolves a fighter identifier to its name.
 * @returns The description shown to the player.
 */
function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

/**
 * Expedition screen: lobby, exploration, combat and end. Members listen to the
 * discreet expedition channel and reread their view on each notification; their
 * countdown sends the deadline command, and the server decides.
 *
 * @param props - Component props.
 * @param props.gameId - Expedition identifier.
 * @param props.userId - Signed-in player.
 * @returns The expedition screen.
 */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const param = { id: gameId }

  /** Rereads the player's view of the expedition. */
  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)

  /**
   * Applies an API response: shows the error and rereads the view, or stores the new view.
   *
   * @param body - Response body.
   */
  function handle(body: { view: GameView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  /** Adds a companion to the expedition, as host. */
  const addCompanion = async () =>
    handle(await (await client.games[':id'].companion.$post({ param })).json())
  /** Joins the expedition. */
  const join = async () => handle(await (await client.games[':id'].join.$post({ param })).json())
  /** Starts the expedition, as host. */
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  /** Opens the next door. */
  const openDoor = async () =>
    handle(await (await client.games[':id'].door.$post({ param })).json())
  /**
   * Chooses an action for the round shown on screen.
   *
   * @param action - Chosen action.
   */
  async function act(action: Action) {
    if (!view) return
    const res = await client.games[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
  }

  /** Sends the deadline command; the server checks whether the round is really due. */
  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])
  const remaining = useCountdown(
    view?.isMember && (view.phase === 'combat' || view.phase === 'exploring')
      ? view.deadline
      : null,
    checkDeadline,
  )

  const title = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="dungeon" /> Expédition
        {view && <span className="muted"> - {DIFFICULTY_LABELS[view.difficulty]}</span>}
      </h1>
      {view?.isMember && (
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
  )

  if (view === undefined) return title
  if (view === null) {
    return (
      <>
        {title}
        <p className="error">{ERRORS.GAME_NOT_FOUND}</p>
        <Link href="/dungeon">Retour au Donjon</Link>
      </>
    )
  }

  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((m) => m.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }
  const me = view.heroes.find((hero) => hero.id === userId)
  const standingMonsters = view.monsters.filter((monster) => monster.hp > 0)
  const standingHeroes = view.heroes.filter((hero) => hero.hp > 0)

  return (
    <>
      {title}

      <section className="panel heroes" aria-label="Héros">
        {view.heroes.map((hero) => (
          <div key={hero.id} className="fighter" data-down={hero.hp <= 0}>
            <span>
              <Entity kind={hero.companion ? 'companion' : 'hero'} /> {hero.name}
              {hero.id === view.hostId && <span className="muted"> (hôte)</span>}
              {hero.companion && <span className="muted"> (piloté par l'ordinateur)</span>}
            </span>
            <span className="muted">
              {hero.hp}/{hero.maxHp} PV
            </span>
            {view.phase === 'combat' && hero.ready && <span className="ok">prêt</span>}
            {view.turnHeroId === hero.id && <span className="ok">à son tour</span>}
          </div>
        ))}
      </section>

      {view.phase === 'lobby' && (
        <div className="panel">
          <p className="muted">
            Communiquez l'adresse de cette page aux joueurs que vous souhaitez inviter.
          </p>
          {!view.isMember && view.heroes.length < MAX_HEROES && (
            <button type="button" onClick={join}>
              Rejoindre l'expédition
            </button>
          )}
          {view.isHost && view.heroes.length < MAX_HEROES && (
            <button type="button" onClick={addCompanion}>
              <Entity kind="companion" /> Ajouter un compagnon
            </button>
          )}
          {view.isHost && (
            <button type="button" onClick={start}>
              Entrer dans le donjon
            </button>
          )}
          {view.isMember && !view.isHost && (
            <p className="muted">En attente du lancement par l'hôte.</p>
          )}
        </div>
      )}

      {view.phase === 'exploring' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Exploration</h2>
            {remaining !== null && (
              <span className="countdown" title="La porte s'ouvrira d'elle-même">
                {remaining} s
              </span>
            )}
          </div>
          <p>
            Salle {view.room + 1} sur {view.roomCount}
            {view.currentRoom?.kind === 'treasure' && ` : un trésor de ${view.currentRoom.gold} or`}
            {view.currentRoom?.kind === 'empty' && ' : une salle vide'}
            {' - '}
            <Entity kind="gold" /> {view.loot}
          </p>
          {view.turnHeroId === userId ? (
            <button type="button" onClick={openDoor}>
              <Entity kind="door" /> Ouvrir la porte suivante
            </button>
          ) : (
            <p className="muted">Au tour de {nameOf(view.turnHeroId ?? '')}.</p>
          )}
        </div>
      )}

      {view.phase === 'combat' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>
              Combat - salle {view.room + 1}, manche {view.round}
            </h2>
            {remaining !== null && <span className="countdown">{remaining} s</span>}
          </div>
          <div className="monsters">
            {view.monsters.map((monster) => (
              <div key={monster.id} className="fighter" data-down={monster.hp <= 0}>
                <span>
                  <Entity kind={monster.kind} /> {monsterName(monster, view.monsters)}
                </span>
                <span className="muted">
                  {monster.hp}/{monster.maxHp} PV
                </span>
              </div>
            ))}
          </div>
          {me && me.hp > 0 && !me.action && (
            <div className="actions">
              {standingMonsters.map((monster) => (
                <button
                  key={monster.id}
                  type="button"
                  onClick={() => act({ type: 'attack', target: monster.id })}
                >
                  Attaquer {monsterName(monster, view.monsters)}
                </button>
              ))}
              <button type="button" onClick={() => act({ type: 'defend' })}>
                Se défendre
              </button>
              {standingHeroes.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  onClick={() => act({ type: 'heal', target: hero.id })}
                >
                  Soigner {hero.name}
                </button>
              ))}
            </div>
          )}
          {me?.action && (
            <p className="muted">
              Votre choix : {describeAction(me.action, nameOf)}. En attente des autres héros.
            </p>
          )}
        </div>
      )}

      {(view.phase === 'won' || view.phase === 'lost') && (
        <div className="panel">
          <h2>{view.phase === 'won' ? 'Victoire !' : 'Défaite...'}</h2>
          <p>
            Butin de l'expédition : <Entity kind="gold" /> {view.loot}
          </p>
          <Link href="/dungeon">Retour au Donjon</Link>
        </div>
      )}

      {view.lastRound && (
        <section className="panel" aria-label="Dernière manche">
          <h2>Manche {view.lastRound.round}</h2>
          <ul className="log">
            {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
              <li key={heroId}>
                {nameOf(heroId)} a choisi {ofVerb(describeAction(action, nameOf))}.
              </li>
            ))}
            {view.lastRound.effects.map((effect) => (
              <li key={`${effect.kind}-${effect.source}-${effect.target}`}>
                {describeEffect(effect, nameOf)}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </>
  )
}
