import { expect, test } from '@playwright/test'

test("présente le jeu, puis guide le joueur jusqu'au chantier de sa première quête", async ({
  page,
}) => {
  test.slow()
  const run = Date.now()
  await page.goto('/login')
  await page.getByText('Pas de compte ? En créer un').click()
  await page.fill('input[name=name]', 'Apprenti')
  await page.fill('input[name=email]', `apprenti-${run}@example.com`)
  await page.fill('input[name=password]', 'motdepasse-solide')
  await page.click('button[type=submit]')
  await page.waitForURL('**/village')
  await page.fill('#name', `Port Apprenti ${run}`)
  await page.getByText('Fonder').click()

  const intro = page.getByRole('dialog', { name: 'Bienvenue, seigneur !' })
  await expect(intro).toBeVisible({ timeout: 20_000 })
  for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
    await page.getByRole('button', { name: 'Suivant' }).click()
  }
  await page.getByRole('button', { name: 'Commencer' }).click()

  const quest = page.getByRole('region', { name: 'Quête en cours' })
  await expect(quest.getByText('Les premières planches')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Touchez la Scierie' })).toBeVisible()

  await page.locator('[data-guide="building-sawmill"]').click()
  await expect(page.getByRole('status').filter({ hasText: 'Lancez le chantier' })).toBeVisible()
  await page.locator('[data-guide="upgrade-sawmill"]').click()
  await page.getByRole('button', { name: 'Fermer la fenêtre' }).click()
  await expect(quest.getByText('Chantier en cours…')).toBeVisible({ timeout: 15_000 })
})
