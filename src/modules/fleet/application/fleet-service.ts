import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { FLEET_TOPICS, type HarborView } from '../contracts'
import { decideHarbor, type HarborCommand, type HarborNotice } from '../domain/harbor'
import { DEFAULT_POSTURE, type Tactic } from '../domain/naval'
import {
  type ArrivalContext,
  decide,
  evolve,
  type RaidCommand,
  type RaidError,
  type RaidEvent,
  type RaidState,
} from '../domain/raid'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type RaidView, toView } from '../domain/view'
import type { FleetReader } from './fleet-reader'
import type { HarborRepository, RaidRepository } from './raid-repository'

/** Result of a player command: the view of the raid, or the domain error. */
export type CommandResult = { ok: true; view: RaidView } | { ok: false; error: RaidError }

/** Player issuing a command. */
export interface Player {
  /** Player identifier. */
  id: string
  /** Display name. */
  name: string
}

/** Target asked by a player: the name of a village is read by the module, never given. */
export type TargetChoice =
  | { kind: 'village'; playerId: string }
  | { kind: 'pirates'; islandId: string }

/** Options of the fleet service. */
export interface FleetServiceOptions {
  /** Outbox dispatch, triggered after each command and each read. */
  dispatch: () => Promise<unknown>
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
  /** Identifier of a new raid; a random UUID by default. */
  newId?: () => string
}

/**
 * Turns a saga request into an outbox message. A withdrawal carries the reply topic, so
 * the reply of the village module moves the saga forward; an arrival reminder is delayed
 * until the fleet arrives.
 *
 * @param request - Saga request.
 * @param now - Current time in milliseconds.
 * @returns The message to record.
 */
function toMessage(request: SagaRequest, now: number): NewMessage {
  switch (request.kind) {
    case 'withdraw':
      return {
        topic: REALM_TOPICS.withdraw,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
          replyTo: FLEET_TOPICS.transferResult,
        },
      }
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
    case 'arrive':
      return {
        topic: FLEET_TOPICS.arrive,
        payload: { raidId: request.raidId },
        delayMs: Math.max(0, request.at - now),
      }
    case 'notice':
      return {
        topic: FLEET_TOPICS.notice,
        payload: { playerId: request.playerId, notice: request.notice },
      }
  }
}

/**
 * Lists the messages triggered by a series of events, applied one by one to the state.
 *
 * @param state - Raid state before the events.
 * @param events - Events to record.
 * @param now - Current time in milliseconds.
 * @returns The saga messages, in order.
 */
function messagesFor(state: RaidState, events: RaidEvent[], now: number): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request, now))
  }
  return messages
}

/**
 * Fleet application service, orchestrator of the raid saga. Each decision is recorded
 * with the messages it triggers, in a single transaction. The arrival of a fleet is a
 * deadline handled without background task: it is resolved by the delayed reminder
 * message, or by the first read that finds the fleet past its arrival time.
 *
 * @param raidsRepo - Persistence port of the raids.
 * @param harborsRepo - Persistence port of the harbors.
 * @param reader - Read port of the fleet read model.
 * @param options - Outbox dispatch, clock and identifier generator.
 * @returns The player commands, the reads and the saga handlers.
 */
export function createFleetService(
  raidsRepo: RaidRepository,
  harborsRepo: HarborRepository,
  reader: FleetReader,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: FleetServiceOptions,
) {
  /**
   * Decides and records a command on a raid, with the saga messages. On a version
   * conflict, everything is replayed on the fresh state, the context included.
   *
   * @param raidId - Raid identifier.
   * @param command - Builds the command from the loaded state.
   * @returns The decision.
   */
  function process(raidId: string, command: (state: RaidState) => Promise<RaidCommand>) {
    return withOptimisticRetry(async () => {
      const { state, version } = await raidsRepo.load(raidId)
      const resolved = await command(state)
      const now = clock()
      const decision = decide(state, resolved, now)
      if (!decision.ok) return decision
      await raidsRepo.save(
        raidId,
        version,
        decision.events,
        messagesFor(state, decision.events, now),
      )
      return decision
    })
  }

  /**
   * Gathers the defense met by a fleet at its arrival: the posture and the upgrades of
   * the targeted village, or the past tactics of the attacker against the pirates.
   *
   * @param state - Raid at sea.
   * @returns The arrival context; null if the village is no longer a target.
   */
  async function arrivalContext(state: RaidState): Promise<ArrivalContext> {
    if (state.target.kind === 'pirates') {
      return { kind: 'pirates', history: await reader.pirateHistory(state.attackerId) }
    }
    const village = await reader.village(state.target.playerId)
    if (!village) return null
    const harbor = await harborsRepo.load(state.target.playerId)
    return { kind: 'village', posture: harbor.state.posture, upgrades: village.upgrades }
  }

  /**
   * Resolves the arrival of a fleet, if it is due.
   *
   * @param raidId - Raid identifier.
   * @returns The decision; refused if the fleet has not arrived yet.
   */
  const resolveArrival = (raidId: string) =>
    process(raidId, async (state) => ({
      type: 'ResolveArrival',
      context: state.status === 'at-sea' ? await arrivalContext(state) : null,
    }))

  /**
   * Resolves the arrivals due for a player, then dispatches the outbox. Any read of the
   * fleet thus settles the raids whose deadline has passed, even if no dispatch ran.
   *
   * @param viewerId - Identifier of the reading player.
   * @returns Resolves once the due raids are settled.
   */
  async function settle(viewerId: string) {
    for (const raidId of await reader.dueRaids(viewerId, clock())) await resolveArrival(raidId)
    await dispatch()
  }

  /**
   * Runs a player command: the decision is recorded, then the outbox dispatched, so the
   * saga reaches its next stable state before the view is returned.
   *
   * @param raidId - Raid identifier.
   * @param viewerId - Identifier of the player issuing the command.
   * @param command - Builds the command from the loaded state.
   * @returns The updated view, or the domain error.
   */
  async function execute(
    raidId: string,
    viewerId: string,
    command: (state: RaidState) => Promise<RaidCommand>,
  ): Promise<CommandResult> {
    const decision = await process(raidId, command)
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await raidsRepo.load(raidId)
    const view = toView(state, viewerId)
    return view ? { ok: true, view } : { ok: false, error: { code: 'RAID_NOT_FOUND' } }
  }

  /**
   * Launches a raid on behalf of a player. The context of the launch (fleets out, target
   * village, daily treasure) is read from the read model, the domain decides on it.
   *
   * @param player - Attacker.
   * @param target - Targeted village or island.
   * @param ships - Number of triremes.
   * @param tactic - Tactic of the fleet.
   * @returns The new raid identifier and the command result.
   */
  async function launch(player: Player, target: TargetChoice, ships: number, tactic: Tactic) {
    const raidId = newId()
    const result = await execute(raidId, player.id, async () => {
      // DETTE TECHNIQUE DT-014 (docs/qualite/dette-technique.md): rule 3 is checked on the
      // read model, so two launches at the same instant may both see a single fleet out.
      const raidsOut = await reader.raidsOut(player.id)
      if (target.kind === 'pirates') {
        return {
          type: 'LaunchRaid',
          raidId,
          attackerId: player.id,
          attackerName: player.name,
          target,
          ships,
          tactic,
          context: {
            raidsOut,
            targetHasVillage: false,
            islandRaidDays: await reader.islandRaidDays(player.id, target.islandId),
          },
        }
      }
      const village = target.playerId === player.id ? null : await reader.village(target.playerId)
      return {
        type: 'LaunchRaid',
        raidId,
        attackerId: player.id,
        attackerName: player.name,
        target: { kind: 'village', playerId: target.playerId, name: village?.name ?? '' },
        ships,
        tactic,
        context: { raidsOut, targetHasVillage: village !== null, islandRaidDays: [] },
      }
    })
    return { raidId, result }
  }

  /**
   * Recalls a fleet on behalf of its attacker.
   *
   * @param raidId - Raid identifier.
   * @param playerId - Identifier of the player asking.
   * @returns The updated view, or the domain error.
   */
  const recall = (raidId: string, playerId: string) =>
    execute(raidId, playerId, async () => ({ type: 'RecallFleet', playerId }))

  /**
   * Reads a raid for a player, its arrival resolved first if due.
   *
   * @param raidId - Raid identifier.
   * @param viewerId - Identifier of the viewing player.
   * @returns The view, or null if the raid does not exist or does not concern the player.
   */
  async function getView(raidId: string, viewerId: string) {
    const loaded = await raidsRepo.load(raidId)
    if (!toView(loaded.state, viewerId)) return null
    if (loaded.state.status === 'at-sea' && clock() >= loaded.state.arrivesAt) {
      await resolveArrival(raidId)
    }
    await dispatch()
    return toView((await raidsRepo.load(raidId)).state, viewerId)
  }

  /**
   * Lists the raids of a player, once the due arrivals are settled.
   *
   * @param viewerId - Identifier of the viewing player.
   * @returns The list, with its log position.
   */
  async function list(viewerId: string) {
    await settle(viewerId)
    return reader.raids(viewerId)
  }

  /**
   * Lists the targets of a player.
   *
   * @param viewerId - Identifier of the viewing player.
   * @returns The targets, with their log position.
   */
  async function targets(viewerId: string) {
    await settle(viewerId)
    return reader.targets(viewerId, clock())
  }

  /**
   * Runs a command on a harbor.
   *
   * @param playerId - Owner of the harbor.
   * @param command - Harbor command.
   * @returns Resolves once the events are recorded.
   */
  const onHarbor = (playerId: string, command: HarborCommand) =>
    withOptimisticRetry(async () => {
      const { state, version } = await harborsRepo.load(playerId)
      const events = decideHarbor(state, command, clock())
      if (events.length > 0) await harborsRepo.save(playerId, version, events)
    })

  /**
   * Reads the harbor of a player.
   *
   * @param playerId - Owner of the harbor.
   * @returns The posture and the latest notices.
   */
  async function harbor(playerId: string): Promise<HarborView> {
    await dispatch()
    const { state, log } = await harborsRepo.load(playerId)
    return { posture: state.posture, holding: state.posture ?? DEFAULT_POSTURE, log }
  }

  /**
   * Chooses the posture of a player's own harbor.
   *
   * @param playerId - Owner of the harbor, the player asking.
   * @param posture - New posture.
   * @returns The harbor.
   */
  async function choosePosture(playerId: string, posture: Tactic) {
    await onHarbor(playerId, { type: 'ChoosePosture', posture })
    return harbor(playerId)
  }

  /**
   * Runs a saga step, triggered by a message. A domain error is an anomaly here, or an
   * arrival reminder delivered too early: it is thrown, so the message is retried.
   *
   * @param raidId - Raid identifier.
   * @param command - Saga command.
   * @returns Resolves once the step is recorded.
   * @throws Error if the domain rejects the command.
   */
  async function step(raidId: string, command: RaidCommand) {
    const decision = await process(raidId, async () => command)
    if (!decision.ok) throw new Error(`Raid ${raidId} : ${decision.error.code}`)
  }

  /**
   * Resolves the arrival of a fleet, triggered by its reminder message.
   *
   * @param raidId - Raid identifier.
   * @returns Resolves once the arrival is recorded.
   * @throws Error if the fleet has not arrived yet.
   */
  async function arrive(raidId: string) {
    const decision = await resolveArrival(raidId)
    if (!decision.ok) throw new Error(`Raid ${raidId} : ${decision.error.code}`)
  }

  /**
   * Records a notice in a player's harbor, triggered by a message.
   *
   * @param playerId - Owner of the harbor.
   * @param notice - Notice of a raid.
   * @returns Resolves once the notice is recorded; a duplicate records nothing.
   */
  const notify = (playerId: string, notice: HarborNotice) =>
    onHarbor(playerId, { type: 'RecordNotice', notice })

  return { launch, recall, getView, list, targets, harbor, choosePosture, step, arrive, notify }
}

/** Service type inferred from its factory. */
export type FleetService = ReturnType<typeof createFleetService>
