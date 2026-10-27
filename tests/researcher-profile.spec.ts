import { authFileFor, expect, goto, reload, test, TestingUsers, withRole, type Page } from './e2e.helpers'
import { resolveUserId, seedProposalPendingReview } from './e2e.seed'

// The researcher's professional profile, written by its owner and read by a reviewer from a study.

test.use({ storageState: authFileFor('researcher') })

// A section is its card. It opens for editing on its own while incomplete, or through its Edit button.
function section(page: Page, heading: string) {
    return page
        .locator('.mantine-Paper-root')
        .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

async function openSection(page: Page, heading: string) {
    const card = section(page, heading)
    if ((await card.locator('form').count()) === 0) await card.getByRole('button', { name: 'Edit' }).click()
    return card.locator('form')
}

test('Researcher fills in their professional profile', async ({ page }) => {
    const stamp = Date.now().toString(36)
    await goto(page, '/researcher/profile')
    await expect(page.getByRole('heading', { name: 'Researcher profile', level: 1 })).toBeVisible()

    // Personal information is the account's own name; read here rather than changed, because other
    // workers' assertions carry the fixture's name.
    await expect(section(page, 'Personal information')).toContainText(TestingUsers.researcher.identifier)

    const education = await openSection(page, 'Highest level of education')
    await education.locator('#educationalInstitution').fill(`Rice University ${stamp}`)
    // Picking the option already chosen would deselect it (Mantine's allowDeselect), so only choose
    // the degree when an earlier run has not.
    const degree = "Master's degree (M.A., M.S., M.Ed.)"
    if ((await education.locator('#degree').inputValue()) !== degree) {
        await education.locator('#degree').click()
        await page.getByRole('option', { name: degree }).click()
    }
    await education.locator('#fieldOfStudy').fill('Learning sciences')
    await education.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Education updated')).toBeVisible()

    const positions = section(page, 'Current institutional information')
    if ((await positions.locator('#affiliation').count()) === 0) {
        await positions.getByText('+ Add another current position').click()
    }
    await positions.locator('#affiliation').fill(`OpenStax ${stamp}`)
    await positions.locator('#position').fill('Research scientist')
    await positions.locator('#profileUrl').fill('https://example.com/profile')
    await positions.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Current institutional information updated')).toBeVisible()
    await expect(positions.getByRole('row').filter({ hasText: `OpenStax ${stamp}` })).toBeVisible()

    const research = await openSection(page, 'Research details')
    // At most five interests, and an earlier run may have left one; the URL is what changes per run.
    if ((await research.locator('.mantine-Pill-root').count()) === 0) {
        await research.locator('#researchInterests').fill('Learning analytics')
        await research.locator('#researchInterests').press('Enter')
    }
    await research.locator('#detailedPublicationsUrl').fill(`https://example.com/publications/${stamp}`)
    await research.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Research details updated')).toBeVisible()

    await reload(page)
    await expect(page.getByText(`Rice University ${stamp}`)).toBeVisible()
    await expect(page.getByText(`OpenStax ${stamp}`)).toBeVisible()
    await expect(page.getByText(`https://example.com/publications/${stamp}`)).toBeVisible()
})

test('Reviewer reads the researcher profile from the study', async ({ browser, page, studyFeatures }) => {
    const { studyId } = await seedProposalPendingReview(studyFeatures.uniqueTitle('profile-view'))
    // The profile row is created on its owner's first visit.
    await goto(page, '/researcher/profile')
    const researcherId = await resolveUserId('researcher')

    await withRole(browser, 'reviewer', async (reviewer) => {
        await goto(reviewer, `/openstax/study/${studyId}/review`)
        const link = reviewer.getByRole('link', { name: 'Professional profile' }).first()
        await expect(link).toHaveAttribute(
            'href',
            `/openstax/study/${studyId}/researcher-profile?userId=${researcherId}`,
        )
        await expect(link).toHaveAttribute('target', '_blank')

        await goto(reviewer, `/openstax/study/${studyId}/researcher-profile?userId=${researcherId}`)
        await expect(reviewer.getByRole('heading', { name: 'Researcher Profile', level: 2 })).toBeVisible()
        await expect(reviewer.getByRole('link', { name: 'Back to study proposal' })).toBeVisible()
        await expect(reviewer.getByText('First name')).toBeVisible()
        await expect(reviewer.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    })
})
