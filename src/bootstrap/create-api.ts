import { Hono } from 'hono'
import { createRealmModule } from '@/modules/realm'
import { createSystemModule } from '@/modules/system'
import { demoUser } from '@/platform/http/demo-user'
import type { AppEnv } from '@/platform/http/types'

/** Dépendances fournies à l'application par son point d'entrée. */
export interface ApiDeps {
  /** Horloge de référence ; l'heure réelle par défaut. Remplacée dans les tests. */
  clock?: () => number
}

/**
 * Racine de composition : le seul endroit du projet qui connaît à la fois
 * la plateforme technique et l'ensemble des modules.
 * Ajouter un module consiste à l'instancier ici, puis à monter son API.
 */
export function createApi({ clock }: ApiDeps = {}) {
  const system = createSystemModule()
  const realm = createRealmModule({ clock })

  const app = new Hono<AppEnv>().basePath('/api')

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  app.use('/realm/*', demoUser())

  return app.route('/system', system.api).route('/realm', realm.api)
}

/** Type de l'application complète, déduit de ses routes. */
export type Api = ReturnType<typeof createApi>
