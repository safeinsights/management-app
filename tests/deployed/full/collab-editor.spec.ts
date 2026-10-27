import { fillStep1, confirmStep1 } from '../../flows/proposal.flows'
import { fillLexicalField } from '../../flows/lexical'
import { expect, test } from '../fixtures'
import { dataPartnerName, labSlug } from '../lifecycle'

// The Hocuspocus editor service behind CloudFront's /ws* behavior: two sessions of the same
// account on one draft proposal see each other's typing.

test('two sessions co-edit a proposal through the editor service', async ({ roleContext, studyTracker, target }) => {
    test.skip(!target.hasEditor, 'PR previews run the editor in single-user mode')
    const first = await roleContext('researcher')
    const title = `E2E collab ${target.name} ${Date.now().toString(36)}`
    await first.page.goto(`/${labSlug()}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(first.page, title, dataPartnerName())
    const firstSocket = first.page.waitForEvent('websocket', (ws) => ws.url().includes('/ws'))
    await confirmStep1(first.page)
    await first.page.waitForURL(/\/proposal$/)
    const studyId = first.page.url().match(/\/study\/([^/]+)/)![1]
    studyTracker.track(studyId)
    expect((await firstSocket).url()).toMatch(/^wss:/)

    const second = await roleContext('researcher')
    const secondSocket = second.page.waitForEvent('websocket', (ws) => ws.url().includes('/ws'))
    await second.page.goto(`/${labSlug()}/study/${studyId}/proposal`, { waitUntil: 'domcontentloaded' })
    await (await secondSocket).waitForEvent('framereceived')

    const sentence = `Typed in another session at ${Date.now().toString(36)}.`
    await fillLexicalField(first.page, 'Research question(s)', sentence)
    await expect(second.page.locator('[aria-label="Research question(s)"]')).toContainText(sentence)
})
