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

test('AI video with Veo: animate my photos, or one character in every scene', async ({ page }) => {
  test.skip(process.env.QA_CONTENT_AI !== '1', 'set QA_CONTENT_AI=1 — the script is written by the real model')
  test.setTimeout(240_000)
  const { email } = await newAccount(page, 'aiveo')
  const accountId = sql(`select m."accountId" from "AccountMember" m join "User" u on u.id=m."userId" where u.email='${email}'`)
  sql(`update "Account" set plan='AGENCY', "paidUntil"=now() + interval '30 days', "creditBalance"="creditBalance"+500 where id='${accountId}'`)
  // Photos in the library (from a template) and a character.
  await page.goto('/app/studio?tab=video')
  await page.getByRole('button', { name: 'Use video template Meet the agent' }).click()
  await page.waitForURL(/\/app\/studio\/video\/[a-z0-9]+$/)
  const ws = sql(`select id from "Workspace" where "accountId"='${accountId}'`)
  const agent = sql(`select id from "Media" where "workspaceId"='${ws}' and prompt='Template photo: real-estate/agent'`)
  sql(`insert into "Character"(id,"workspaceId",name,"photoIds","consentAt","updatedAt") values ('ch-${Date.now()}','${ws}','Nino','{${agent}}',now(),now())`)

  const create = async (mode: 'Animate my photos' | 'With a character') => {
    await page.goto('/app/studio?tab=video')
    await page.getByRole('button', { name: 'Create video with AI' }).click()
    await page.getByPlaceholder(/Weekend custom cakes/).fill('[test] Bright 3-bedroom apartment in Vake for sale')
    await page.getByLabel('Scenes').selectOption('3')
    await page.getByRole('button', { name: /AI clips \(Veo\)/ }).click()
    await page.getByRole('radiogroup', { name: 'Clip source' }).getByRole('radio', { name: mode }).click()
    if (mode === 'Animate my photos') {
      await page.getByRole('button', { name: 'Pick photos to animate' }).click()
      await page.getByRole('button', { name: 'Select image' }).first().click()
      await page.getByRole('button', { name: 'Select image' }).nth(1).click()
      await page.getByRole('button', { name: /^Use .*selected$/ }).click()
    } else {
      await expect(page.getByRole('radiogroup', { name: 'Clip quality' }).getByRole('radio', { name: /Quick/ })).toBeDisabled()
    }
    await page.getByLabel('Voice-over').uncheck()
    await page.getByRole('button', { name: /^Create · up to/ }).click()
    await page.waitForURL(/\/app\/studio\/video\/[a-z0-9]+$/, { timeout: 180_000 })
    return page.url().split('/').pop()!
  }

  const v1 = await create('Animate my photos')
  expect(sql(`select count(*)||':'||count("imageId")||':'||min(seconds)||':'||min(quality) from "ClipJob" where "videoId"='${v1}'`)).toBe('3:3:4:quick')
  const v2 = await create('With a character')
  expect(sql(`select count(*)||':'||count("characterId")||':'||min(seconds)||':'||min(quality) from "ClipJob" where "videoId"='${v2}'`)).toBe('3:3:8:pro')
})

async function campaignWithPosts(page: import('@playwright/test').Page, prefix: string, n: number) {
  const { email } = await newAccount(page, prefix)
  const ws = sql(`select w.id from "Workspace" w join "AccountMember" m on m."accountId"=w."accountId" join "User" u on u.id=m."userId" where u.email='${email}'`)
  const user = sql(`select id from "User" where email='${email}'`)
  const id = `camp-${Date.now()}`
  sql(`insert into "Campaign"(id,"workspaceId",kind,name,brief,"startsOn","endsOn","postsPerWeek",tone,language,status,"updatedAt") values ('${id}','${ws}','SOCIAL','Open house week','Sell apartments in Vake',now(),now()+interval '7 days',3,'Friendly','English','ACTIVE',now())`)
  for (let i = 0; i < n; i++) {
    sql(`insert into "Post"(id,"workspaceId","campaignId",kind,title,content,channels,"mediaIds","scheduledAt","createdById","updatedAt") values ('${id}-p${i}','${ws}','${id}','SOCIAL','Angle ${i}','Bright 3-bedroom apartment in Vake with a terrace, post ${i}','{FACEBOOK}','{}',now()+interval '${i + 1} days','${user}',now())`)
  }
  return { id, ws }
}

test('campaign pictures from template photos, spread over the posts in order', async ({ page }) => {
  const { id, ws } = await campaignWithPosts(page, 'cpics', 3)
  await page.goto(`/app/campaigns/${id}`)
  await expect(page.getByText('3 posts without a picture.')).toBeVisible()
  await page.getByRole('button', { name: 'Add pictures' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pictures for your posts' })
  await expect(dialog.getByRole('radio', { name: 'No pictures' })).toHaveCount(0)
  await dialog.getByRole('radio', { name: 'Choose photos' }).click()
  await dialog.getByRole('button', { name: 'Add template photo living' }).click()
  await dialog.getByRole('button', { name: 'Add template photo kitchen' }).click()
  await dialog.getByRole('button', { name: 'Add pictures' }).click()
  await expect(page.getByText(/posts? without a picture/)).toHaveCount(0)
  const media = sql(`select string_agg(m.prompt, '|' order by p."scheduledAt") from "Post" p join "Media" m on m.id = p."mediaIds"[1] where p."campaignId"='${id}'`)
  expect(media).toBe('Template photo: real-estate/living|Template photo: real-estate/kitchen|Template photo: real-estate/living')
  expect(sql(`select count(*) from "Media" where "workspaceId"='${ws}' and prompt like 'Template photo:%'`)).toBe('2')
})

test('campaign pictures made by AI in a chosen style, with progress, charged per picture', async ({ page }) => {
  test.skip(process.env.QA_CONTENT_AI !== '1', 'set QA_CONTENT_AI=1 — real image model')
  test.setTimeout(240_000)
  const { id } = await campaignWithPosts(page, 'cpicsai', 2)
  await page.goto(`/app/campaigns/${id}`)
  await page.getByRole('button', { name: 'Add pictures' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pictures for your posts' })
  await dialog.getByRole('radio', { name: 'Illustration' }).click()
  await dialog.getByRole('button', { name: 'Add pictures' }).click()
  await expect(page.getByText(/Making pictures for the posts · \d of 2/)).toBeVisible()
  await expect(page.getByText(/Making pictures for the posts/)).toHaveCount(0, { timeout: 200_000 })
  expect(sql(`select count(*) from "Post" where "campaignId"='${id}' and cardinality("mediaIds")=1`)).toBe('2')
  expect(sql(`select "imageStatus"||':'||"imagesDone"||':'||"imagesTotal" from "Campaign" where id='${id}'`)).toBe('DONE:2:2')
  expect(sql(`select count(*) from "CreditEntry" e join "Campaign" c on c.id='${id}' join "Workspace" w on w.id=c."workspaceId" where e."accountId"=w."accountId" and e.action='image'`)).toBe('2')
})

test('library videos are offered for a campaign and spread over its posts', async ({ page }) => {
  const { id, ws } = await campaignWithPosts(page, 'cvids', 6)
  for (const n of [1, 2]) {
    sql(`insert into "Media"(id,"workspaceId",kind,mime,path,bytes,prompt,"durationMs") values ('vid-${n}-${Date.now()}','${ws}','VIDEO','video/mp4','${ws}/clip${n}.mp4',1000,'Clip ${n}',8000)`)
  }
  await page.goto(`/app/campaigns/${id}`)
  await page.getByRole('button', { name: 'Add pictures' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pictures for your posts' })
  await expect(dialog.getByText(/You have 2 videos in your library/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Use them in this campaign' }).click()
  await dialog.getByRole('button', { name: 'Pick videos from my library' }).click()
  const pick = page.getByRole('button', { name: 'Select video' })
  await expect(pick).toHaveCount(2)
  await pick.nth(1).click()
  await expect(page.getByRole('button', { name: 'Deselect video' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Select video' }).first().click()
  await expect(page.getByRole('button', { name: 'Deselect video' })).toHaveCount(2)
  await page.getByRole('button', { name: /^Use .*selected$/ }).click()
  await dialog.getByRole('button', { name: 'Add pictures' }).click()
  await expect(page.getByText('4 posts without a picture.')).toBeVisible()
  // Evenly spaced: posts 1 and 4 of 6.
  const order = sql(`select string_agg(case when cardinality("mediaIds")>0 then 'V' else '-' end, '' order by "scheduledAt") from "Post" where "campaignId"='${id}'`)
  expect(order).toBe('V--V--')
  await expect(page.getByRole('link', { name: 'Make a Reel' })).toHaveAttribute('href', /\/app\/studio\?tab=video&ai=Sell/)
})
