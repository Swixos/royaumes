import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'

/** Suffix making the e-mail addresses of a run unique. */
const RUN = Date.now()

/** Browser contexts opened by the current test, closed once it ends. */
const contexts: BrowserContext[] = []

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

/**
 * Creates a player through the interface, then founds their village. The guide of the
 * tutorial is paused first, as a player can do from the quests window: these tests are
 * about the fleet, and the advisor would introduce the game over it.
 *
 * @param browser - Browser of the test.
 * @param name - Name of the player.
 * @returns The page of the signed-in player, on their village.
 */
async function newPlayer(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext()
  contexts.push(context)
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByText('Pas de compte ? En créer un').click()
  await page.fill('input[name=name]', name)
  await page.fill('input[name=email]', `${name.toLowerCase()}-${RUN}@example.com`)
  await page.fill('input[name=password]', 'motdepasse-solide')
  await page.click('button[type=submit]')
  await page.waitForURL('**/village')
  await page.request.post('/api/tutorial/pause')
  await page.fill('#name', `Port ${name} ${RUN}`)
  await page.getByText('Fonder').click()
  await expect(page.getByRole('region', { name: 'Bâtiments' })).toBeVisible()
  return page
}

/**
 * Opens the fleet screen from the navigation, and waits for the harbor lookout.
 *
 * @param page - Page of a signed-in player.
 */
async function openFleet(page: Page) {
  await page.getByRole('link', { name: /Flotte/ }).click()
  await expect(page.getByText('Vigie en poste')).toBeVisible({ timeout: 20_000 })
}

/**
 * Opens a menu of the fleet screen, such as the logbook or the harbor, unless it is open.
 *
 * @param page - Page of a signed-in player, on the fleet screen.
 * @param name - Name of the menu.
 */
async function openMenu(page: Page, name: string) {
  const button = page.getByRole('navigation', { name: 'Menus de la flotte' }).getByRole('button', {
    name,
  })
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click()
}

/**
 * Looks for a harbor by its name, so it shows on the sea map whatever its distance. The
 * targets come from a projection, consistent in time: like a player, the test looks again
 * until the newly founded village shows.
 *
 * @param page - Page of a signed-in player, on the fleet screen.
 * @param name - Name of the village to look for.
 */
async function searchHarbor(page: Page, name: string) {
  await page.getByLabel('Rechercher un port').fill(name)
  await expect(async () => {
    await page.getByRole('button', { name: "Scruter l'horizon" }).click()
    await expect(page.getByRole('button', { name: `Cibler ${name}` })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 20_000 })
}

test('prévoit un raid contre une île pirate : sa garnison, et le port à armer', async ({
  browser,
}) => {
  const page = await newPlayer(browser, 'Vigie')
  await openFleet(page)
  await expect(page.locator('dd').filter({ hasText: /^0$/ })).toHaveCount(2)

  await page.getByRole('button', { name: 'Cibler Récif des Brumes' }).click({ delay: 150 })
  await expect(page.getByRole('heading', { name: 'Conseil de guerre' })).toBeVisible()
  await expect(page.getByText('traversée 3 min')).toBeVisible()
  await expect(page.getByText(/Garnison/)).toBeVisible()
  await expect(page.getByText(/Aucune unité au village/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hisser les voiles' })).toBeDisabled()

  await openMenu(page, 'Votre port')
  const harbor = page.locator('section', { has: page.getByRole('heading', { name: /Votre port/ }) })
  await expect(harbor.getByText('aucune unité')).toBeVisible()
  await expect(harbor.getByText(/niveau 0/)).toBeVisible()
})

test("vise le port d'un autre joueur : son rempart, et ses troupes inconnues", async ({
  browser,
}) => {
  const page = await newPlayer(browser, 'Amirale')
  await newPlayer(browser, 'Gardien')
  await openFleet(page)
  await searchHarbor(page, `Port Gardien ${RUN}`)
  await page.getByRole('button', { name: `Cibler Port Gardien ${RUN}` }).click({ delay: 150 })
  await expect(page.getByText(/Rempart niveau 0/)).toBeVisible()
  await expect(page.getByText(/Les troupes du défenseur restent inconnues/)).toBeVisible()
})

test('montre la population que nourrit la ferme, et la garnison du village', async ({
  browser,
}) => {
  const page = await newPlayer(browser, 'Fermier')
  await page.locator('[data-guide="building-farm"]').click()
  await expect(page.getByRole('region', { name: 'Garnison' })).toBeVisible()
  await expect(page.getByText(/Aucune troupe/)).toBeVisible()
})

test('corrige le nom du joueur, repris par la navigation', async ({ browser }) => {
  const page = await newPlayer(browser, 'Typo')
  await page.getByRole('link', { name: 'Mes données' }).click()
  await page.fill('#new-name', `Corsaire ${RUN}`)
  await page.getByRole('button', { name: 'Corriger' }).click()
  await expect(page.getByRole('banner').getByText(`Corsaire ${RUN}`)).toBeVisible({
    timeout: 15_000,
  })
})
