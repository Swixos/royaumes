/**
 * Authentication port of the platform. The rest of the application only
 * depends on this contract, never on the library implementing it: Better Auth
 * is one adapter, tests provide another.
 */
export interface AuthPort {
  /**
   * Handles authentication requests (`/api/auth/*`): sign-up, sign-in, sign-out.
   *
   * @param request - Incoming request.
   * @returns The authentication response.
   */
  handler(request: Request): Promise<Response>

  /**
   * Finds the signed-in user behind a request.
   *
   * @param headers - Request headers, carrying the session cookie.
   * @returns The user, or `null` if nobody is signed in.
   */
  getUser(headers: Headers): Promise<AuthUser | null>
}

/** What the application knows about a signed-in user. */
export interface AuthUser {
  /** User identifier. */
  id: string
  /** Display name. */
  name: string
}
