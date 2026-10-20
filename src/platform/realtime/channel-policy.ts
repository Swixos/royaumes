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
}

/**
 * Tells whether a player may listen to a channel. A channel no rule covers is
 * refused: access is closed by default.
 *
 * @param policies - Rules declared by the modules.
 * @param channel - Channel name.
 * @param userId - Player identifier.
 * @returns True if the first rule matching the channel prefix allows it.
 */
export async function isAllowed(
  policies: ChannelPolicy[],
  channel: string,
  userId: string,
): Promise<boolean> {
  const policy = policies.find((p) => channel.startsWith(p.prefix))
  return policy ? policy.canSubscribe(channel, userId) : false
}
