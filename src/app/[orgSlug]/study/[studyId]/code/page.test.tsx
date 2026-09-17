import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    waitFor,
    waitForPendingMutations,
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import StudyCodeUploadRoute from './page'
import { SUBMIT_CODE_FAQ_SUBJECT } from '@/lib/audit-subjects'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    memoryRouter.setCurrentUrl('/')
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = async (orgSlug: string, studyId: string) => {
    const page = await StudyCodeUploadRoute({
        params: Promise.resolve({ orgSlug, studyId }),
    })
    const rendered = renderWithProviders(page!)
    // The FAQ records a first visit on mount, and teardown fails on a write still in flight.
    await waitForPendingMutations()
    return rendered
}

describe('StudyCodeUploadRoute', () => {
    it('renders code upload page for DRAFT study and previous links to edit', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(screen.getByText('STEP 3')).toBeInTheDocument()

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', expect.stringContaining('/edit'))
    })

    it('routes approved study previous button to the submitted proposal', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })

        await renderRoute(org.slug, study.id)

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', expect.stringContaining('/submitted'))
    })

    it('redirects to view for non-DRAFT/APPROVED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        await expect(
            StudyCodeUploadRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('shows empty state when no workspace files exist', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        // The submit button stays clickable; OTTER-693 validates on click instead of gating it.
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code for review/i })).toBeEnabled()
        })
    })

    // The component tests drive expanded/collapsed off a prop; these own where the prop comes from —
    // an audit record that has to outlive the render and belong to the researcher, not the study.
    describe('FAQ first-visit detection (OTTER-693)', () => {
        const faqControl = () => screen.getByRole('button', { name: /New to SafeInsights IDE/ })

        const viewedCount = async (userId: string) => {
            const rows = await db
                .selectFrom('audit')
                .select('id')
                .where('recordType', '=', 'USER')
                .where('eventType', '=', 'VIEWED')
                .where('recordId', '=', userId)
                .execute()
            return rows.length
        }

        type TestOrg = NonNullable<Parameters<typeof insertTestStudyJobData>[0]>['org']

        const seedDraft = async (org: TestOrg, userId: string) => {
            const { study } = await insertTestStudyJobData({ org, researcherId: userId, studyStatus: 'DRAFT' })
            return study
        }

        it('expands for a researcher who has never seen it, and records the view', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraft(org, user.id)

            expect(await viewedCount(user.id)).toBe(0)

            await renderRoute(org.slug, study.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')

            await waitFor(async () => expect(await viewedCount(user.id)).toBe(1))
        })

        it('collapses once the view has been recorded', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraft(org, user.id)
            await db
                .insertInto('audit')
                .values({
                    userId: user.id,
                    eventType: 'VIEWED',
                    recordType: 'USER',
                    recordId: user.id,
                    metadata: { subject: SUBMIT_CODE_FAQ_SUBJECT },
                })
                .execute()

            await renderRoute(org.slug, study.id)

            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
        })

        it('ignores a VIEWED event recorded for something else', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraft(org, user.id)
            // The event type is shared, so the subject is what keeps features apart.
            await db
                .insertInto('audit')
                .values({
                    userId: user.id,
                    eventType: 'VIEWED',
                    recordType: 'USER',
                    recordId: user.id,
                    metadata: { subject: 'SOMETHING_ELSE' },
                })
                .execute()

            await renderRoute(org.slug, study.id)

            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')
        })

        it('is scoped to the researcher, not the study', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const first = await seedDraft(org, user.id)
            const second = await seedDraft(org, user.id)

            const firstView = await renderRoute(org.slug, first.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')
            await waitFor(async () => expect(await viewedCount(user.id)).toBe(1))
            firstView.unmount()

            await renderRoute(org.slug, second.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
        })
    })
})
