/**
 * Entrée publique « serveur » du module System.
 * Avec ui.tsx, c'est le seul fichier du module qui peut être importé
 * depuis l'extérieur.
 */
import { createSystemApi } from './api'

export function createSystemModule() {
  const startedAt = Date.now()
  return { api: createSystemApi(startedAt) }
}

export type { SystemApi } from './api'
