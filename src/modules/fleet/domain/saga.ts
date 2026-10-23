/**
 * Steps of the raid saga: for each event of a raid, the requests to address to the village
 * module, to the raid itself, or to the harbors of both players. The domain decides on
 * these requests; the service turns them into outbox messages.
 *
 * @packageDocumentation
 */
import type { HarborNotice } from './harbor'
import { type Amounts, isEmpty } from './naval'
import { type RaidEvent, type RaidState, transferIdOf } from './raid'

/** Request produced by a step of the saga. */
export type SagaRequest =
  /** Withdraw resources: the village module replies, and the reply moves the saga forward. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Deposit resources: a deposit cannot fail, so no reply is expected. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }
  /** Reminder addressed to the raid itself at the arrival of its fleet. */
  | { kind: 'arrive'; raidId: string; at: number }
  /**
   * Notice addressed to a player's harbor. It only names the raid and the kind of notice:
   * the names of the players are read from the raid when the notice is recorded, so the
   * outbox, which keeps the messages, holds no name.
   */
  | { kind: 'notice'; playerId: string; raidId: string; notice: HarborNotice['kind'] }

/**
 * Lists the requests triggered by an event:
 * 1. launch withdraws the equipment from the attacker's village (compensable step);
 * 2. once at sea, the fleet is sighted by the defender, and reminds itself at its arrival;
 * 3. a victory against a village asks for its plunder, reduced once after a refusal;
 * 4. the plunder is delivered to the attacker, and both harbors get the battle report;
 * - a recalled fleet, or one whose target disappeared, refunds the equipment
 *   (compensation), and the defender sees the fleet turn back;
 * - a defeat sends the reports, with nothing to deliver: the fleet is lost;
 * - a refused equipment withdrew nothing, so there is nothing to compensate.
 *
 * @param state - State after the event is applied.
 * @param event - Recorded event.
 * @returns The requests to send.
 */
export function requestsFor(state: RaidState, event: RaidEvent): SagaRequest[] {
  const id = (step: string) => transferIdOf(state.raidId, step)
  const defender = state.target.kind === 'village' ? state.target.playerId : null
  const raidId = state.raidId
  /**
   * Builds a notice request.
   *
   * @param playerId - Owner of the harbor.
   * @param notice - Kind of notice.
   * @returns The request.
   */
  const notice = (playerId: string, notice: HarborNotice['kind']): SagaRequest => ({
    kind: 'notice',
    playerId,
    raidId,
    notice,
  })
  /**
   * Builds the battle reports addressed to the attacker and, for a village, its owner.
   *
   * @returns The notice requests.
   */
  const reports = () => [
    notice(state.attackerId, 'report'),
    ...(defender ? [notice(defender, 'report')] : []),
  ]

  switch (event.type) {
    case 'RaidLaunched':
      return [
        {
          kind: 'withdraw',
          transferId: id('provision'),
          playerId: state.attackerId,
          resources: state.cost,
        },
      ]

    case 'FleetSailed':
      return [
        { kind: 'arrive', raidId, at: state.arrivesAt },
        ...(defender ? [notice(defender, 'sighted')] : []),
      ]

    case 'FleetRecalled':
    case 'RaidAborted':
      return [
        {
          kind: 'deposit',
          transferId: id('refund'),
          playerId: state.attackerId,
          resources: state.cost,
        },
        ...(defender && event.type === 'FleetRecalled' ? [notice(defender, 'turned-back')] : []),
      ]

    case 'BattleFought':
      if (!event.data.victory) return reports()
      return defender
        ? [
            {
              kind: 'withdraw',
              transferId: id('plunder-1'),
              playerId: defender,
              resources: state.plunderAsked,
            },
          ]
        : []

    case 'PlunderReduced':
      return [
        {
          kind: 'withdraw',
          transferId: id(`plunder-${event.data.attempt}`),
          playerId: defender ?? '',
          resources: event.data.asked,
        },
      ]

    case 'RaidPlundered': {
      const loot = event.data.loot
      const delivery: SagaRequest[] = isEmpty(loot)
        ? []
        : [{ kind: 'deposit', transferId: id('loot'), playerId: state.attackerId, resources: loot }]
      return [...delivery, ...reports()]
    }

    case 'RaidCancelled':
      return []
  }
}

/**
 * Builds the notice a harbor records for a raid, from the state of the raid when the
 * notice is handled. The defender never learns the tactic of the fleet from a notice.
 *
 * @param state - Current raid state.
 * @param kind - Kind of notice.
 * @param playerId - Owner of the harbor.
 * @returns The notice, or null if the raid does not concern the player, or has not
 *   reached the stage the notice reports.
 */
export function noticeOf(
  state: RaidState,
  kind: HarborNotice['kind'],
  playerId: string,
): HarborNotice | null {
  if (!state.exists) return null
  const raidId = state.raidId
  const defender = state.target.kind === 'village' && state.target.playerId === playerId
  const attacker = state.attackerId === playerId
  if (!attacker && !defender) return null

  switch (kind) {
    case 'sighted':
      return defender
        ? {
            kind,
            raidId,
            attackerId: state.attackerId,
            attackerName: state.attackerName,
            ships: state.ships,
            arrivesAt: state.arrivesAt,
          }
        : null
    case 'turned-back':
      return defender ? { kind, raidId } : null
    case 'report': {
      if (!state.battle) return null
      const won = state.battle.victory
      const targetId =
        state.target.kind === 'village' ? state.target.playerId : state.target.islandId
      return attacker
        ? {
            kind,
            raidId,
            role: 'attacker',
            won,
            opponentId: targetId,
            opponentName: state.target.name,
            loot: state.loot ?? {},
          }
        : {
            kind,
            raidId,
            role: 'defender',
            won: !won,
            opponentId: state.attackerId,
            opponentName: state.attackerName,
            loot: state.loot ?? {},
          }
    }
  }
}
