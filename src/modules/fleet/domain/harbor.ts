/**
 * Harbor of a player: the defensive posture of their village, and the log of the fleets
 * seen from it (fleets sighted, fleets turning back, battle reports). It follows the
 * decider pattern; notices are idempotent, since they come from outbox messages.
 *
 * @packageDocumentation
 */
import type { Amounts, Tactic } from './naval'

/** Notice addressed to a harbor by a raid. */
export type HarborNotice =
  /** An enemy fleet sailed towards the village. Its tactic is never revealed. */
  | {
      kind: 'sighted'
      raidId: string
      attackerId: string
      attackerName: string
      ships: number
      arrivesAt: number
    }
  /** The enemy fleet was recalled by its attacker before arriving. */
  | { kind: 'turned-back'; raidId: string }
  /** Outcome of a battle, from the point of view of the harbor owner. */
  | {
      kind: 'report'
      raidId: string
      role: 'attacker' | 'defender'
      won: boolean
      opponentId: string
      opponentName: string
      loot: Amounts
    }

/** State of a harbor, rebuilt from its events. */
export interface HarborState {
  /** Posture chosen by the owner; null if they never chose one. */
  posture: Tactic | null
  /** Keys of the notices already recorded, `<raidId>:<kind>`, for idempotency. */
  known: ReadonlySet<string>
}

/** State of a harbor before any event. */
export const initialHarbor: HarborState = { posture: null, known: new Set() }

/** Facts recorded for a harbor. */
export type HarborEvent =
  | { type: 'PostureChosen'; data: { posture: Tactic; at: number } }
  | {
      type: 'FleetSighted'
      data: {
        raidId: string
        attackerId: string
        attackerName: string
        ships: number
        arrivesAt: number
        at: number
      }
    }
  | { type: 'FleetTurnedBack'; data: { raidId: string; at: number } }
  | {
      type: 'BattleReported'
      data: {
        raidId: string
        role: 'attacker' | 'defender'
        won: boolean
        opponentId: string
        opponentName: string
        loot: Amounts
        at: number
      }
    }

/** Requests on a harbor: the owner's posture, and the notices sent by raids. */
export type HarborCommand =
  | { type: 'ChoosePosture'; posture: Tactic }
  | { type: 'RecordNotice'; notice: HarborNotice }

/**
 * Builds the idempotency key of a notice.
 *
 * @param notice - Notice of a raid.
 * @returns The key, `<raidId>:<kind>`.
 */
export const noticeKey = (notice: { raidId: string; kind: string }) =>
  `${notice.raidId}:${notice.kind}`

/**
 * Finds the notice kind an event records.
 *
 * @param event - Harbor event.
 * @returns The notice kind, or null for a posture.
 */
function kindOf(event: HarborEvent): HarborNotice['kind'] | null {
  switch (event.type) {
    case 'FleetSighted':
      return 'sighted'
    case 'FleetTurnedBack':
      return 'turned-back'
    case 'BattleReported':
      return 'report'
    default:
      return null
  }
}

/**
 * Applies an event to a harbor.
 *
 * @param state - Current harbor state.
 * @param event - Event to apply.
 * @returns The new state; the given state is never modified.
 */
export function evolveHarbor(state: HarborState, event: HarborEvent): HarborState {
  if (event.type === 'PostureChosen') return { ...state, posture: event.data.posture }
  const kind = kindOf(event)
  if (!kind) return state
  return {
    ...state,
    known: new Set([...state.known, noticeKey({ raidId: event.data.raidId, kind })]),
  }
}

/**
 * Rebuilds a harbor from its events.
 *
 * @param events - Events of the harbor, in order.
 * @returns The current state.
 */
export const replayHarbor = (events: HarborEvent[]) => events.reduce(evolveHarbor, initialHarbor)

/**
 * Decides on a harbor command (rule 10). Choosing the posture already held, or a notice
 * already recorded, has no effect.
 *
 * @param state - Current harbor state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record.
 */
export function decideHarbor(
  state: HarborState,
  command: HarborCommand,
  now: number,
): HarborEvent[] {
  if (command.type === 'ChoosePosture') {
    return state.posture === command.posture
      ? []
      : [{ type: 'PostureChosen', data: { posture: command.posture, at: now } }]
  }

  const { notice } = command
  if (state.known.has(noticeKey(notice))) return []
  switch (notice.kind) {
    case 'sighted':
      return [
        {
          type: 'FleetSighted',
          data: {
            raidId: notice.raidId,
            attackerId: notice.attackerId,
            attackerName: notice.attackerName,
            ships: notice.ships,
            arrivesAt: notice.arrivesAt,
            at: now,
          },
        },
      ]
    case 'turned-back':
      return [{ type: 'FleetTurnedBack', data: { raidId: notice.raidId, at: now } }]
    case 'report':
      return [
        {
          type: 'BattleReported',
          data: {
            raidId: notice.raidId,
            role: notice.role,
            won: notice.won,
            opponentId: notice.opponentId,
            opponentName: notice.opponentName,
            loot: notice.loot,
            at: now,
          },
        },
      ]
  }
}
