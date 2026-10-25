import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'

/** Suffix making the e-mail addresses of a run unique. */
const RUN = Date.now()

/** Browser contexts opened by the current test, closed once it ends. */
const contexts: BrowserContext[] = []

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close()
})

/**
 * Creates a player through the interface, then founds their village.
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

test('lance un raid, alerte le défenseur en temps réel, puis rappelle la flotte', async ({
  browser,
}) => {
  const alice = await newPlayer(browser, 'Amirale')
  const bob = await newPlayer(browser, 'Gardien')
  await openFleet(alice)
  await openFleet(bob)

  await searchHarbor(alice, `Port Gardien ${RUN}`)
  await alice.getByRole('button', { name: `Cibler Port Gardien ${RUN}` }).click({ delay: 150 })
  await expect(alice.getByText('Conseil de guerre')).toBeVisible()
  await alice.getByRole('button', { name: '2 trirèmes' }).click()
  await alice
    .getByRole('button', { name: /Abordage/ })
    .first()
    .click()
  await alice.getByRole('button', { name: 'Hisser les voiles' }).click()
  await expect(
    alice.getByText(`La flotte a hissé les voiles vers Port Gardien ${RUN}.`),
  ).toBeVisible()

  await expect(bob.getByText('Flotte ennemie en approche')).toBeVisible({ timeout: 15_000 })
  await expect(bob.getByText(/Amirale lance 2 trirèmes sur votre port/)).toBeVisible()

  await alice.getByRole('button', { name: 'Rappeler' }).click()
  await expect(alice.getByText("Demi-tour ! L'équipement rentre au village.")).toBeVisible()
  await expect(bob.getByText('Flotte ennemie en approche')).toBeHidden({ timeout: 15_000 })
  await expect(bob.getByText('Demi-tour')).toBeVisible()
})

test('choisit la posture du port, et prévoit la bataille contre une île pirate', async ({
  browser,
}) => {
  const page = await newPlayer(browser, 'Vigie')
  await openFleet(page)

  const harbor = page.locator('section', { has: page.getByRole('heading', { name: /Votre port/ }) })
  await harbor.getByRole('button', { name: /Éperonnage/ }).click()
  await expect(page.locator('dd').filter({ hasText: 'Éperonnage' })).toBeVisible()

  await page.getByRole('button', { name: 'Cibler Récif des Brumes' }).click({ delay: 150 })
  await expect(page.getByText('Défense 25 · traversée 3 min')).toBeVisible()
  await page.getByRole('button', { name: '1 trirème', exact: true }).click()
  await expect(page.locator('dd').filter({ hasText: /Bois\s*15/ })).toBeVisible()
})

test("corrige le nom du joueur, repris par la navigation et par les raids qu'il lance", async ({
  browser,
}) => {
  const page = await newPlayer(browser, 'Typo')
  const other = await newPlayer(browser, 'Cible')
  await page.getByRole('link', { name: 'Mes données' }).click()
  await page.fill('#new-name', `Corsaire ${RUN}`)
  await page.getByRole('button', { name: 'Corriger' }).click()
  await expect(page.getByRole('banner').getByText(`Corsaire ${RUN}`)).toBeVisible({
    timeout: 15_000,
  })

  await openFleet(page)
  await openFleet(other)
  await searchHarbor(page, `Port Cible ${RUN}`)
  await page.getByRole('button', { name: `Cibler Port Cible ${RUN}` }).click({ delay: 150 })
  await page.getByRole('button', { name: 'Hisser les voiles' }).click()
  await expect(other.getByText(new RegExp(`Corsaire ${RUN} lance 3 trirèmes`))).toBeVisible({
    timeout: 15_000,
  })
})
