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
} from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import StudyCodeUploadRoute from './page'

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
    return renderWithProviders(page!)
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

    // OTTER-727 hid Agreements, so an approved study's Previous walks back to the approved proposal.
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

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })
    })

    // The component tests drive the expanded/collapsed states off a prop; these own the part the
    // prop comes from — a per-user marker that has to outlive the render and not be per-study.
    describe('FAQ first-visit detection (OTTER-693)', () => {
        const faqControl = () => screen.getByRole('button', { name: /New to SafeInsights IDE/ })

        type TestOrg = NonNullable<Parameters<typeof insertTestStudyJobData>[0]>['org']

        const seedDraftStudy = async (org: TestOrg, userId: string) => {
            const { study } = await insertTestStudyJobData({ org, researcherId: userId, studyStatus: 'DRAFT' })
            return study
        }

        const faqSeenAt = async (userId: string) => {
            const row = await db
                .selectFrom('user')
                .select('submitCodeFaqSeenAt')
                .where('id', '=', userId)
                .executeTakeFirstOrThrow()
            return row.submitCodeFaqSeenAt
        }

        it('expands on a never-visited user and records the visit', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraftStudy(org, user.id)

            expect(await faqSeenAt(user.id)).toBeNull()

            await renderRoute(org.slug, study.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')

            // Written by the client on mount, so it lands after the render settles.
            await waitFor(async () => {
                expect(await faqSeenAt(user.id)).not.toBeNull()
            })
        })

        it('collapses once the marker is set, and does not move it', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraftStudy(org, user.id)

            const firstSeen = new Date('2026-01-01T00:00:00Z')
            await db.updateTable('user').set({ submitCodeFaqSeenAt: firstSeen }).where('id', '=', user.id).execute()

            await renderRoute(org.slug, study.id)

            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
            // Write-once: a return visit must not overwrite when they first saw it.
            expect(await faqSeenAt(user.id)).toEqual(firstSeen)
        })

        it('is scoped to the user, not the study', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const firstStudy = await seedDraftStudy(org, user.id)
            const secondStudy = await seedDraftStudy(org, user.id)

            const firstView = await renderRoute(org.slug, firstStudy.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')
            await waitFor(async () => {
                expect(await faqSeenAt(user.id)).not.toBeNull()
            })
            firstView.unmount()

            // A different study, same researcher: already seen it, so it stays shut.
            await renderRoute(org.slug, secondStudy.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
        })
    })
})
