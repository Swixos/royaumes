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
  /** Notice addressed to a player's harbor. */
  | { kind: 'notice'; playerId: string; notice: HarborNotice }

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

    case 'FleetSailed': {
      const requests: SagaRequest[] = [{ kind: 'arrive', raidId, at: state.arrivesAt }]
      if (defender) {
        requests.push({
          kind: 'notice',
          playerId: defender,
          notice: {
            kind: 'sighted',
            raidId,
            attackerId: state.attackerId,
            attackerName: state.attackerName,
            ships: state.ships,
            arrivesAt: state.arrivesAt,
          },
        })
      }
      return requests
    }

    case 'FleetRecalled':
    case 'RaidAborted': {
      const requests: SagaRequest[] = [
        {
          kind: 'deposit',
          transferId: id('refund'),
          playerId: state.attackerId,
          resources: state.cost,
        },
      ]
      if (defender && event.type === 'FleetRecalled') {
        requests.push({
          kind: 'notice',
          playerId: defender,
          notice: { kind: 'turned-back', raidId },
        })
      }
      return requests
    }

    case 'BattleFought':
      if (event.data.victory) {
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
      }
      return reports(state, {})

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
      return [...delivery, ...reports(state, loot)]
    }

    case 'RaidCancelled':
      return []
  }
}

/**
 * Builds the battle reports addressed to the attacker and, for a village, its owner.
 *
 * @param state - Raid after its battle.
 * @param loot - Plunder taken; empty after a defeat.
 * @returns The notice requests.
 */
function reports(state: RaidState, loot: Amounts): SagaRequest[] {
  const won = state.battle?.victory ?? false
  const raidId = state.raidId
  const targetId = state.target.kind === 'village' ? state.target.playerId : state.target.islandId
  const requests: SagaRequest[] = [
    {
      kind: 'notice',
      playerId: state.attackerId,
      notice: {
        kind: 'report',
        raidId,
        role: 'attacker',
        won,
        opponentId: targetId,
        opponentName: state.target.name,
        loot,
      },
    },
  ]
  if (state.target.kind === 'village') {
    requests.push({
      kind: 'notice',
      playerId: state.target.playerId,
      notice: {
        kind: 'report',
        raidId,
        role: 'defender',
        won: !won,
        opponentId: state.attackerId,
        opponentName: state.attackerName,
        loot,
      },
    })
  }
  return requests
}
