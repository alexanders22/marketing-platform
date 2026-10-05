import { expect, test } from '@playwright/test'
import { newAccount, sql } from './helpers'

test('real estate video template: scenes with photos copied into the workspace, opens the editor', async ({ page }) => {
  await newAccount(page, 'vtpl')
  await page.goto('/app/studio?tab=video')
  await page.getByLabel('Template format').selectOption('4:5')
  await page.getByRole('button', { name: 'Use video template Property tour' }).click()
  await page.waitForURL(/\/app\/studio\/video\/[a-z0-9]+$/)
  const id = page.url().split('/').pop()!
  const row = JSON.parse(sql(`select json_build_object('name',name,'format',format,'data',data,'ws',"workspaceId") from "Video" where id='${id}'`))
  expect(row.name).toBe('Property tour')
  expect(row.format).toBe('4:5')
  expect(row.data.scenes).toHaveLength(5)
  expect(row.data.scenes[0].text).toBe('New listing in Vake')
  expect(row.data.scenes[0].voice).toBe('Welcome to your next home in Vake.')
  for (const s of row.data.scenes) {
    expect(sql(`select "workspaceId" from "Media" where id='${s.media.id}'`)).toBe(row.ws)
  }
  // The same photo used twice (here: once per scene) is stored once per workspace.
  expect(sql(`select count(*) from "Media" where "workspaceId"='${row.ws}' and prompt like 'Template photo:%'`)).toBe('5')
  await expect(page.getByText('New listing in Vake').first()).toBeVisible()

  // A second template reuses the photos already copied.
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'Use video template Just listed' }).click()
  await page.waitForURL(/\/app\/studio\/video\/[a-z0-9]+$/)
  expect(sql(`select count(*) from "Media" where "workspaceId"='${row.ws}' and prompt like 'Template photo:%'`)).toBe('5')
})

test('a character keeps its look in AI clips: Pro/Cinema, 8 s, photos sent with the job', async ({ page }) => {
  const { email } = await newAccount(page, 'chars')
  const accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
  sql(`update "Account" set "paidUntil"=now() + interval '30 days', "creditBalance"="creditBalance"+100 where id='${accountId}'`)
  // A template brings the agent photo into the library.
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'Use video template Meet the agent' }).click()
  await page.waitForURL(/\/app\/studio\/video\/[a-z0-9]+$/)
  const videoId = page.url().split('/').pop()!

  await page.goto('/app/studio/characters')
  await page.getByRole('button', { name: 'New character' }).click()
  await page.getByPlaceholder('e.g. Nino, our agent').fill('Nino')
  await page.getByRole('button', { name: 'Add photos' }).click()
  await page.getByRole('button', { name: 'Select image' }).first().click()
  await page.getByRole('button', { name: /^Use .*selected$/ }).click()
  // A real person needs the likeness confirmation.
  await page.getByRole('button', { name: 'Save character' }).click()
  await expect(page.getByText('Confirm you have permission to use this person’s likeness')).toBeVisible()
  await page.getByLabel(/I am this person or have their permission/).check()
  await page.getByRole('button', { name: 'Save character' }).click()
  await expect(page.getByRole('list', { name: 'Characters' }).getByText('Nino')).toBeVisible()
  const charId = sql(`select c.id from "Character" c join "Workspace" w on w.id=c."workspaceId" where w."accountId"='${accountId}'`)
  expect(sql(`select array_length("photoIds",1)||':'||("consentAt" is not null) from "Character" where id='${charId}'`)).toBe('1:true')

  await page.goto(`/app/studio/video/${videoId}`)
  await page.getByRole('button', { name: 'Animate photo or generate clip' }).click()
  await page.getByLabel('Character').selectOption({ label: 'Nino' })
  const quality = page.getByRole('radiogroup', { name: 'Clip quality' })
  await expect(quality.getByRole('radio', { name: /Quick/ })).toBeDisabled()
  await expect(quality.getByRole('radio', { name: /Pro/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radiogroup', { name: 'Clip length' }).getByRole('radio', { name: '8s' })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('Clip description').fill('[test] Nino opens the door of a bright apartment and smiles')
  await page.getByRole('button', { name: 'Generate · 32 credits' }).click()
  await expect(page.getByText(/Generating the AI clip/)).toBeVisible()
  expect(sql(`select "characterId"||':'||quality||':'||seconds||':'||("imageId" is null) from "ClipJob" where "videoId"='${videoId}'`)).toBe(`${charId}:pro:8:true`)
})
