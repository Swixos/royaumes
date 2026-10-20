/** Hono environment shared by the API routes. */
export interface AppEnv {
  /**
   * Context variables set by the `requireUser` middleware once the player is
   * identified: `userId` and `userName` of the signed-in player.
   */
  Variables: { userId: string; userName: string }
}
