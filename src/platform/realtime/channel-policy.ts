import type { StoredEvent } from '../event-store/event-store'

/**
 * Source of a channel that does not read the log, provided by the module declaring it.
 * Its items are presented as events, identified by their position, so the interface
 * receives them like those of the other channels.
 */
export interface ChannelSource {
  /**
   * Reads the items after a position.
   *
   * @param after - Position of the last item already sent.
   * @returns The later items, in increasing position order.
   */
  read(after: number): Promise<StoredEvent[]>
  /**
   * Gives the starting position of a subscriber that provides none.
   *
   * @returns The position to read after.
   */
  start(): Promise<number>
}

/**
 * Access rule for the real-time channels of a module. Each module declares who
 * may listen to its channels; the platform, which knows no module, receives
 * these rules from the composition root.
 */
export interface ChannelPolicy {
  /** Prefix of the channels covered, such as `village-`. */
  prefix: string
  /**
   * Tells whether a player may listen to a channel with this prefix.
   *
   * @param channel - Channel name.
   * @param userId - Player identifier.
   * @returns True if the player may subscribe.
   */
  canSubscribe(channel: string, userId: string): boolean | Promise<boolean>
  /**
   * Discreet channel: the stream only sends the type and version of each event,
   * never its data. Each subscriber then rereads its own view from the API.
   */
  redact?: boolean
  /**
   * Global channel: it matches no stream, but follows the events of some types across
   * the whole log. Its events are identified by their position rather than their
   * version, and it only sends the events recorded after it opens.
   */
  global?: { types: string[] }
  /**
   * Channel fed by a source of the module rather than by the log: for instance a table,
   * for a module that records no events.
   */
  source?: ChannelSource
}

/**
 * Finds the rule allowing a player to listen to a channel. A channel no rule
 * covers is refused: access is closed by default.
 *
 * @param policies - Rules declared by the modules.
 * @param channel - Channel name.
 * @param userId - Player identifier.
 * @returns The matching rule if it allows the player, `null` otherwise.
 */
export async function authorize(
  policies: ChannelPolicy[],
  channel: string,
  userId: string,
): Promise<ChannelPolicy | null> {
  const policy = policies.find((p) => channel.startsWith(p.prefix))
  if (!policy) return null
  return (await policy.canSubscribe(channel, userId)) ? policy : null
}
