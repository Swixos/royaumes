/** Hono environment shared by the API routes. */
export interface AppEnv {
  /** Context variables: `userId` identifies the player behind the request. */
  Variables: { userId: string }
}
