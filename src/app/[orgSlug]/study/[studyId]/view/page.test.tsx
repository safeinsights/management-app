import { describe, it, expect } from 'vitest'
import * as RouterMock from 'next-router-mock'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    faker,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import { PostCodeSubmissionFeatureFlag } from '@/components/openstax-feature-flag'
import StudyReviewPage from './page'
import { CodeOnlyView } from './code-only-view'
import { CodePostSubmissionView } from './code-post-submission-view'
import { ResearcherProposalView } from './researcher-proposal-view'

const defaultSearchParams = Promise.resolve({})

describe('StudyViewPage', () => {
    it('renders CodeOnlyView when job has CODE-SUBMITTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('Previous')).toBeInTheDocument()
    })

    it('renders ResearcherProposalView when code is submitted but from=agreements is set', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements' }),
        })
        renderWithProviders(page!)

        // Proposal view shows STEP 2 / "Study proposal" and the Proceed button back to agreements.
        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Proceed to Step 3' })).toBeInTheDocument()
    })

    it('renders ResearcherProposalView for APPROVED study without job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
        expect(screen.queryByText('No code has been uploaded yet.')).not.toBeInTheDocument()
    })

    it('renders ResearcherProposalView with agreementsHref when from=agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements' }),
        })
        renderWithProviders(page!)

        expect(screen.getByRole('button', { name: 'Proceed to Step 3' })).toBeInTheDocument()
    })

    it('agreementsHref preserves returnTo=org through the proposal view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements', returnTo: 'org' }),
        })
        renderWithProviders(page!)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'Proceed to Step 3' }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { asPath } = (RouterMock as any).memoryRouter
        expect(asPath).toContain(`/${org.slug}/study/${study.id}/agreements`)
        expect(asPath).toContain('returnTo=org')
    })

    it('renders ResearcherProposalView without agreementsHref when from is absent', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.queryByRole('button', { name: 'Proceed to Step 3' })).not.toBeInTheDocument()
    })

    it('renders ResearcherProposalView for REJECTED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'REJECTED' }).where('id', '=', study.id).execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
    })

    it('renders ResearcherProposalView for CHANGE-REQUESTED study without code placeholder content', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'CHANGE-REQUESTED' }).where('id', '=', study.id).execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('STEP 2')).toBeInTheDocument()
        expect(screen.getByText('Study proposal')).toBeInTheDocument()
        expect(screen.queryByText('No code has been uploaded yet.')).not.toBeInTheDocument()
        expect(screen.queryByText('Status will be available after code is uploaded.')).not.toBeInTheDocument()
    })

    it('renders generic layout for DRAFT study without job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'DRAFT' }).where('id', '=', study.id).execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByText('Study Details')).toBeInTheDocument()
        expect(screen.getByText('No code has been uploaded yet.')).toBeInTheDocument()
    })

    it('throws when study does not exist', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: 'test-org', studyId: faker.string.uuid() }),
                searchParams: defaultSearchParams,
            }),
        ).rejects.toThrow()
    })

    describe('post-code-submission flag swap (OTTER-537)', () => {
        const addJobStatus = async (studyId: string, status: 'CODE-SCANNED' | 'CODE-APPROVED' | 'CODE-REJECTED') => {
            const job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', studyId)
                .executeTakeFirstOrThrow()
            await db.insertInto('jobStatusChange').values({ status, studyJobId: job.id }).execute()
        }

        it('wraps CodeOnlyView in PostCodeSubmissionFeatureFlag when latest status is CODE-SUBMITTED and study is PENDING-REVIEW', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
            })

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(PostCodeSubmissionFeatureFlag)
            expect(page?.props.defaultContent.type).toBe(CodeOnlyView)
            expect(page?.props.optInContent.type).toBe(CodePostSubmissionView)
        })

        it('wraps CodeOnlyView in PostCodeSubmissionFeatureFlag when latest status is CODE-SCANNED and study is PENDING-REVIEW', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-SCANNED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(PostCodeSubmissionFeatureFlag)
            expect(page?.props.defaultContent.type).toBe(CodeOnlyView)
            expect(page?.props.optInContent.type).toBe(CodePostSubmissionView)
        })

        it.each(['CODE-APPROVED', 'CODE-REJECTED'] as const)(
            'renders CodeOnlyView directly (no flag swap) when latest job status is %s',
            async (jobStatus) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
                const { study } = await insertTestStudyJobData({
                    org,
                    researcherId: user.id,
                    studyStatus: 'APPROVED',
                    jobStatus: 'CODE-SUBMITTED',
                })
                await addJobStatus(study.id, jobStatus)

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: defaultSearchParams,
                })

                expect(page?.type).toBe(CodeOnlyView)
            },
        )

        it('renders ResearcherProposalView when ?from=agreements regardless of latest job status', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
            })

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({ from: 'agreements' }),
            })

            expect(page?.type).toBe(ResearcherProposalView)
        })

        it('preserves dashboardHref through to the flag swap when ?returnTo=org', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
            })

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({ returnTo: 'org' }),
            })

            expect(page?.type).toBe(PostCodeSubmissionFeatureFlag)
            expect(page?.props.defaultContent.props.dashboardHref).toBe(`/${org.slug}/dashboard`)
            expect(page?.props.optInContent.props.dashboardHref).toBe(`/${org.slug}/dashboard`)
        })

        it('renders CodeOnlyView directly when study is APPROVED but latest status is CODE-SUBMITTED (no PENDING-REVIEW)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodeOnlyView)
        })
    })
})
