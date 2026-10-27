import { confirmStep1, fillStep1 } from '../../flows/proposal.flows'
import { expect, test } from '../fixtures'

// The collaborative editor is a separate service behind CloudFront's /ws* behavior. Opening a
// proposal upgrades a websocket to it and receives the document's first sync.

test('the proposal editor connects to the editor service', async ({ roleContext, studyTracker, target }) => {
    test.skip(!target.hasEditor, 'PR previews run the editor in single-user mode')
    test.skip(
        target.isProdLike && process.env.E2E_SMOKE_MUTATE !== '1',
        'no writes on production or demo without E2E_SMOKE_MUTATE=1',
    )
    const { page } = await roleContext('researcher')
    const title = `E2E smoke editor ${target.name} ${Date.now().toString(36)}`

    await page.goto(`/${process.env.E2E_LAB_SLUG ?? 'openstax-lab'}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(page, title, new RegExp(process.env.E2E_DATA_PARTNER_NAME ?? 'openstax', 'i'))
    const socket = page.waitForEvent('websocket', (ws) => ws.url().includes('/ws'))
    await confirmStep1(page)
    await page.waitForURL(/\/proposal$/)
    studyTracker.track(page.url().match(/\/study\/([^/]+)/)![1])

    const ws = await socket
    expect(ws.url()).toMatch(/^wss:/)
    await ws.waitForEvent('framereceived')
})
