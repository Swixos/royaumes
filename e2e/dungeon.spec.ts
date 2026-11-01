import { expect, test } from '@playwright/test'

/** Suffix making the e-mail addresses of a run unique. */
const RUN = Date.now()

test("mène un groupe dans les Profondeurs, jusqu'au premier combat", async ({ page }) => {
  test.slow()
  await page.goto('/login')
  await page.getByText('Pas de compte ? En créer un').click()
  await page.fill('input[name=name]', 'Prêtresse')
  await page.fill('input[name=email]', `pretresse-${RUN}@example.com`)
  await page.fill('input[name=password]', 'motdepasse-solide')
  await page.click('button[type=submit]')
  await page.waitForURL('**/village')
  await page.request.post('/api/tutorial/pause')

  await page.goto('/dungeon')
  await page.locator('[data-guide="class-cleric"]').click()
  await expect(page.locator('[data-guide="class-cleric"]')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-guide="open-expedition"]').click()
  await page.waitForURL('**/dungeon/*')

  await page.getByRole('button', { name: /Ajouter un compagnon/ }).click()
  await expect(page.getByText(/Guerrier · compagnon/)).toBeVisible()
  await page.getByRole('button', { name: 'Entrer dans le donjon' }).click()
  await expect(page.getByRole('list', { name: 'Carte du donjon' })).toBeVisible()

  await expect(async () => {
    const door = page.getByRole('button', { name: /Pousser la porte|Affronter le gardien/ })
    if (await door.isVisible()) await door.click()
    await expect(page.getByRole('region', { name: 'Combat' })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })

  await expect(page.getByTitle('Attaque annoncée').first()).toBeVisible()
  await page.getByRole('button', { name: /Se défendre/ }).click()
  await expect(page.getByText(/Votre choix/).or(page.getByText(/Manche/).first())).toBeVisible()
})
