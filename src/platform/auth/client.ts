'use client'
import { createAuthClient } from 'better-auth/react'

/**
 * Browser authentication client. It calls the `/api/auth/*` routes of the
 * application on the same domain and holds no server code: it is the only part
 * of the platform client code may import.
 */
export const authClient = createAuthClient()
