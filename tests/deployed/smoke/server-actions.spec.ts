import { confirmStep1, fillStep1 } from '../../flows/proposal.flows'
import { expect, test } from '../fixtures'

// One real mutation at the live hostname. Next.js checks a Server Action's Origin against the
// X-Forwarded-Host the CloudFront origin sends; a slot deployed with the wrong one answers every
// mutation with a 500 the moment traffic moves (iac/management-app/RUNBOOK-slot-cutover.md).

test('a Server Action succeeds at this hostname', async ({ roleContext, studyTracker, target }) => {
    test.skip(
        target.isProdLike && process.env.E2E_SMOKE_MUTATE !== '1',
        'no writes on production or demo without E2E_SMOKE_MUTATE=1',
    )
    const { page } = await roleContext('researcher')
    const title = `E2E smoke draft ${target.name} ${Date.now().toString(36)}`

    await page.goto(`/${process.env.E2E_LAB_SLUG ?? 'openstax-lab'}/study/request`, { waitUntil: 'domcontentloaded' })
    await fillStep1(page, title, new RegExp(process.env.E2E_DATA_PARTNER_NAME ?? 'openstax', 'i'))
    await confirmStep1(page)
    await page.waitForURL(/\/proposal$/)

    const studyId = page.url().match(/\/study\/([^/]+)/)![1]
    studyTracker.track(studyId)
    await expect(page.getByText('Step 2', { exact: true })).toBeVisible()
})
