/**
 * Reproducible load test.
 *
 *   pnpm build && AUTH_RATE_LIMIT=off pnpm start     in a first terminal
 *   pnpm exec tsx scripts/load-test.ts [label]       in a second terminal
 *
 * The script runs in four steps:
 * 1. it prepares a data set through the API, as a player would: each player founds a
 *    village, opens an expedition, publishes an offer, writes a message and launches two
 *    raids, one against the village of another player and one against a pirate island, so
 *    the measures run on non-empty tables and log;
 * 2. it measures, for each scenario, the throughput and the latency percentiles. The
 *    scenarios are reads, the requests each player triggers the most, since every screen
 *    reads its view again on each real-time event. All measures use the first player's
 *    cookie: the measured reads do not depend on the player;
 * 3. it shows the results and records them in `perf/<label>.json`, to compare them from
 *    one measure to the next;
 * 4. it checks them against the performance budget set in `perf/budget.json`, and exits
 *    with an error if a scenario exceeds it.
 *
 * @packageDocumentation
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import autocannon from 'autocannon'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const label = process.argv[2] ?? 'mesure'
/** Number of players created for the measure. */
const PLAYERS = 20
/** Duration of each scenario, in seconds. */
const DURATION = 10
/** Performance budget: maximum p99 and number of errors, for a number of connections. */
const budget = JSON.parse(readFileSync('perf/budget.json', 'utf8')) as {
  connections: number
  maxP99Ms: number
  maxErrors: number
}
/** Number of simultaneous connections. */
const CONNECTIONS = budget.connections

/**
 * Sends a JSON request with a player's session cookie.
 *
 * @param path - Path of the API route.
 * @param method - HTTP method.
 * @param cookie - Session cookie of the player.
 * @param body - Request body, if any.
 * @returns The response.
 */
async function call(path: string, method: string, cookie: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: BASE, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/**
 * Creates a player.
 *
 * @param n - Number of the player.
 * @returns The session cookie of the player.
 * @throws Error if sign-up is refused, for instance by rate limiting.
 */
async function signUp(n: number) {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({
      name: `Charge ${n}`,
      email: `charge-${n}-${Date.now()}@example.com`,
      password: 'motdepasse-de-charge',
    }),
  })
  if (!res.ok) throw new Error(`Inscription refusée (${res.status}) : AUTH_RATE_LIMIT=off ?`)
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

const cookies: string[] = []
for (let n = 0; n < PLAYERS; n++) {
  const cookie = await signUp(n)
  cookies.push(cookie)
  await call('/api/realm/village', 'POST', cookie, { name: `Village ${n}` })
  await call('/api/dungeon/games', 'POST', cookie, { difficulty: 'easy' })
  await call('/api/market/offers', 'POST', cookie, { give: { wood: 10 }, want: { stone: 5 } })
  await call('/api/tavern/messages', 'POST', cookie, { body: `Bonjour de ${n}` })
  const targets = (await (await call('/api/fleet/targets', 'GET', cookie)).json()) as {
    villages: { playerId: string }[]
  }
  const raid = { ships: 1, tactic: 'ram' }
  if (targets.villages[0]) {
    const target = { kind: 'village', playerId: targets.villages[0].playerId }
    await call('/api/fleet/raids', 'POST', cookie, { ...raid, target })
  }
  await call('/api/fleet/raids', 'POST', cookie, {
    ...raid,
    target: { kind: 'pirates', islandId: 'misty-reef' },
  })
}

const scenarios = [
  { name: 'Village', path: '/api/realm/village' },
  { name: 'Expéditions ouvertes', path: '/api/dungeon/games' },
  { name: 'Classement', path: '/api/ranking/players' },
  { name: 'Marché', path: '/api/market/offers' },
  { name: 'Taverne', path: '/api/tavern/messages' },
  { name: 'Flotte - cibles', path: '/api/fleet/targets' },
  { name: 'Flotte - raids', path: '/api/fleet/raids' },
  { name: 'Flotte - port', path: '/api/fleet/harbor' },
]

const results = []
for (const scenario of scenarios) {
  const result = await autocannon({
    url: `${BASE}${scenario.path}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { cookie: cookies[0] },
  })
  results.push({
    scenario: scenario.name,
    requestsPerSecond: Math.round(result.requests.average),
    p50: result.latency.p50,
    p99: result.latency.p99,
    errors: result.errors + result.non2xx,
  })
}

console.table(results)
mkdirSync('perf', { recursive: true })
writeFileSync(`perf/${label}.json`, `${JSON.stringify(results, null, 2)}\n`)
console.log(`Résultats enregistrés dans perf/${label}.json`)

const over = results.filter((r) => r.p99 > budget.maxP99Ms || r.errors > budget.maxErrors)
for (const r of over) {
  console.error(`Budget dépassé : ${r.scenario} (p99 ${r.p99} ms, ${r.errors} erreur(s))`)
}
if (over.length > 0) process.exit(1)
console.log(`Budget respecté : p99 inférieur à ${budget.maxP99Ms} ms, sans erreur.`)
