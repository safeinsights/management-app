import { CONTEXT_LABELS, CONTEXT_NAMES } from '@/lib/agent-context'
import { Routes } from '@/lib/routes/definitions'
import { expectNoA11yViolations, scanA11y } from './a11y.helpers'
import { authFileFor, expect, goto, test, TestingUsers, type Page } from './e2e.helpers'
import {
    ENCLAVE_SLUG,
    LAB_SLUG,
    seedCodeSubmitted,
    seedProposalPendingReview,
    seedStudyFor,
    storeSeededMainCode,
} from './e2e.seed'

const ORG_ADMIN_SLUG = 'reviewer-is-org-admin'

// These sections render their loading message on the first paint and `goto` waits for hydration,
// so once the message is gone the section's data has arrived.
const expectLoaded = (page: Page, loadingText: string | RegExp) => expect(page.getByText(loadingText)).toHaveCount(0)

// A DataTable shows no loading text. A loader overlay covers it while it fetches, and the overlay
// and the empty state fade by plain CSS, which reduced motion does not stop.
const expectTableLoaded = async (page: Page) => {
    const table = page.locator('.mantine-datatable')
    await expect(table).toBeVisible()
    await expect(table.locator('.mantine-datatable-loader')).toHaveCSS('opacity', '0')
    const rowOrEmptyState = table
        .locator('tbody tr:not(.mantine-datatable-empty-row)')
        .first()
        .or(table.locator('.mantine-datatable-empty-state[data-active]'))
    await expect(rowOrEmptyState).toHaveCSS('opacity', '1')
}

const expectHeading = (page: Page, name: string) =>
    expect(page.getByRole('heading', { name, exact: true })).toBeVisible()

test.describe('accessibility: signed out', () => {
    test('sign in', async ({ page }) => {
        await goto(page, Routes.accountSignin)
        await expect(page.getByLabel('email')).toBeVisible()
        await expectNoA11yViolations(page, 'sign in')
    })

    test('sign in with an error', async ({ page }) => {
        await goto(page, Routes.accountSignin)
        await page.getByLabel('email').fill(`nobody-${Date.now()}@example.com`)
        // The fake Clerk rejects only this password; any other one moves on to the MFA screen.
        await page.getByLabel('password').fill('wrong')
        await page.getByRole('button', { name: 'login' }).click()
        await expect(
            page.getByText('Invalid login credentials. Please double-check your email and password.'),
        ).toBeVisible()
        await expectNoA11yViolations(page, 'sign in error')
    })

    test('reset password', async ({ page }) => {
        await goto(page, Routes.accountResetPassword)
        await expect(page.getByLabel('Email')).toBeVisible()
        await expectNoA11yViolations(page, 'reset password')
    })

    test('about', async ({ page }) => {
        await goto(page, Routes.about)
        await expect(page.getByText('Release:', { exact: true })).toBeVisible()
        await expect(page.getByText('Infrastructure:', { exact: true })).toBeVisible()
        await expectNoA11yViolations(page, 'about')
    })
})

// My studies lists only studies the reviewer has acted on, which a submitted-code seed is.
const openMyStudies = async (page: Page, title: string) => {
    await seedCodeSubmitted(title)
    await goto(page, Routes.dashboard)
    await expectHeading(page, 'My studies')
    await expect(page.getByRole('table').getByText(title)).toBeVisible()
}

test.describe('accessibility: reviewer', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('my studies', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('a11y my studies')
        await openMyStudies(page, title)
        await expectNoA11yViolations(page, 'reviewer my studies', { onlyRowsWith: title })
    })

    test('account menu open', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('a11y account menu')
        await openMyStudies(page, title)
        await page.getByRole('button', { name: 'profile menu' }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectNoA11yViolations(page, 'account menu', { onlyRowsWith: title })
    })

    test('org dashboard', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('a11y dashboard')
        await seedProposalPendingReview(title)
        await goto(page, Routes.orgDashboard({ orgSlug: ENCLAVE_SLUG }))
        await expect(page.getByRole('table').getByText(title)).toBeVisible()
        await expectNoA11yViolations(page, 'reviewer org dashboard', { onlyRowsWith: title })
    })

    test('proposal review', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('a11y proposal review')
        const { studyId } = await seedProposalPendingReview(title)
        await goto(page, Routes.studyReview({ orgSlug: ENCLAVE_SLUG, studyId }))
        await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
        await expectNoA11yViolations(page, 'proposal review')
    })

    test('code review', async ({ page, studyFeatures }) => {
        const { studyId, jobId } = await seedCodeSubmitted(studyFeatures.uniqueTitle('a11y code review'))
        await storeSeededMainCode(studyId, jobId)
        await goto(page, Routes.studyReview({ orgSlug: ENCLAVE_SLUG, studyId }))
        await expect(page.getByTestId('code-review-section')).toBeVisible()
        await expect(page.getByTestId('study-code-body')).toBeVisible()
        await expectNoA11yViolations(page, 'code review')
    })

    test('org settings', async ({ page }) => {
        await goto(page, Routes.adminSettings({ orgSlug: ORG_ADMIN_SLUG }))
        await expectHeading(page, 'Settings')
        await expectLoaded(page, 'Loading code environments')
        await expectLoaded(page, 'Loading data sources')
        await expectLoaded(page, 'Loading test labs')
        await expectNoA11yViolations(page, 'org settings')
    })

    test('org team', async ({ page }) => {
        await goto(page, Routes.adminTeam({ orgSlug: ORG_ADMIN_SLUG }))
        await expect(page.getByRole('cell', { name: TestingUsers.reviewer.identifier })).toBeVisible()
        await expectTableLoaded(page)
        await expectNoA11yViolations(page, 'org team')
    })

    test('org legal center', async ({ page }) => {
        await goto(page, Routes.adminLegal({ orgSlug: ORG_ADMIN_SLUG }))
        await expectHeading(page, 'Legal center')
        await expectTableLoaded(page)
        await expectNoA11yViolations(page, 'org legal center')
    })

    test('security key', async ({ page }) => {
        await goto(page, Routes.userKey)
        await expectHeading(page, 'Security key')
        await expectNoA11yViolations(page, 'security key')
    })

    test('mfa setup', async ({ page }) => {
        await goto(page, `${Routes.accountMfa}?TESTING_FORCE_NO_MFA=1`)
        await expect(page.getByRole('link', { name: 'SMS Verification' })).toBeVisible()
        await expectNoA11yViolations(page, 'mfa setup')
    })

    test('user legal', async ({ page }) => {
        await goto(page, Routes.legal)
        await expectHeading(page, 'Legal')
        await expectTableLoaded(page)
        await expectNoA11yViolations(page, 'user legal')
    })

    test('not found', async ({ page }) => {
        await goto(page, Routes.notFound)
        await expectHeading(page, 'Page Not Found')
        await expectNoA11yViolations(page, 'not found')
    })
})

test.describe('accessibility: researcher', () => {
    test.use({ storageState: authFileFor('researcher') })

    test('lab dashboard', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('a11y lab dashboard')
        await seedProposalPendingReview(title)
        await goto(page, Routes.orgDashboard({ orgSlug: LAB_SLUG }))
        await expect(page.getByRole('table').getByText(title)).toBeVisible()
        await expectNoA11yViolations(page, 'lab dashboard', { onlyRowsWith: title })
    })

    test('study setup', async ({ page }) => {
        await goto(page, Routes.studyRequest({ orgSlug: LAB_SLUG }))
        await expect(page.getByLabel('Study Title')).toBeVisible()
        await expectNoA11yViolations(page, 'study setup')
    })

    test('submitted proposal', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('a11y submitted')
        const { studyId } = await seedProposalPendingReview(title)
        await goto(page, Routes.studySubmitted({ orgSlug: LAB_SLUG, studyId }))
        await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
        await expectNoA11yViolations(page, 'submitted proposal')
    })

    test('researcher profile', async ({ page }) => {
        await goto(page, Routes.researcherProfile)
        await expectHeading(page, 'Researcher profile')
        await expect(page.getByText(TestingUsers.researcher.identifier)).toBeVisible()
        await expectNoA11yViolations(page, 'researcher profile')
    })

    test('proposal editor', async ({ page, studyFeatures }) => {
        const { studyId } = await seedStudyFor({ title: studyFeatures.uniqueTitle('a11y draft'), status: 'DRAFT' })
        await goto(page, Routes.studyProposal({ orgSlug: LAB_SLUG, studyId }))
        await expect(page.locator('[aria-label="Research question(s)"]')).toBeVisible()
        await expectNoA11yViolations(page, 'proposal editor')
    })
})

test.describe('accessibility: SafeInsights admin', () => {
    test.use({ storageState: authFileFor('admin') })

    test('organizations', async ({ page }) => {
        await goto(page, Routes.adminSafeinsights)
        await expect(page.getByRole('cell', { name: ENCLAVE_SLUG, exact: true })).toBeVisible()
        await expectTableLoaded(page)
        for (const name of CONTEXT_NAMES) {
            await expect(page.getByLabel(CONTEXT_LABELS[name].label)).toBeVisible()
        }
        await expectNoA11yViolations(page, 'organizations')
    })

    test('safeinsights legal', async ({ page }) => {
        await goto(page, Routes.adminSafeinsightsLegal)
        await expectHeading(page, 'SafeInsights Legal')
        await expectTableLoaded(page)
        await expectNoA11yViolations(page, 'safeinsights legal')
    })
})

// Static pages, so a broken tag filter or a removed assertion cannot let the gate pass silently.
test.describe('accessibility gate self-test', () => {
    test('a WCAG violation is reported and fails the check', async ({ page }) => {
        await page.setContent('<main><img src="data:,"></main>')
        const { wcag } = await scanA11y(page, 'selftest wcag violation')
        expect(wcag.map((violation) => violation.id)).toContain('image-alt')
        await expect(expectNoA11yViolations(page, 'selftest wcag violation enforced')).rejects.toThrow()
    })

    test('a best-practice finding is reported but does not fail the check', async ({ page }) => {
        await page.setContent('<html lang="en"><head><title>x</title></head><body><main><p>x</p></main></body></html>')
        const { wcag, bestPractice } = await scanA11y(page, 'selftest best practice')
        expect(wcag).toEqual([])
        expect(bestPractice.map((violation) => violation.id)).toContain('page-has-heading-one')
        await expectNoA11yViolations(page, 'selftest best practice enforced')
    })
})
