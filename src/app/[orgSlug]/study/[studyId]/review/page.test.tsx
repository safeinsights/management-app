import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect, useParams } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    type Mock,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'
import { CodeReviewRedesignView } from './code-review-redesign-view'
import { CodeReviewView } from './code-review-view'
import { LegacyProposalReviewView } from './legacy-proposal-review-view'
import {
    CodeReviewFeatureFlag,
    PostSubmissionFeatureFlag,
    ProposalReviewFeatureFlag,
    StudyDetailsRedesignFeatureFlag,
} from '@/components/openstax-feature-flag'
import { PostFeedbackView } from './post-feedback-view'
import { ProposalReviewView } from './proposal-review-view'
import { StudyDetailsRedesignView } from './study-details-redesign-view'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

describe('StudyReviewPage', () => {
    it('redirects lab org to /view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('redirects enclave to agreements page when code submitted and not coming from agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/agreements'))
    })

    it('renders CodeReviewFeatureFlag for enclave with code submitted when coming from agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements-proceed' }),
        })
        expect(page?.type).toBe(CodeReviewFeatureFlag)
        expect(page?.props.defaultContent.type).toBe(CodeReviewView)
        expect(page?.props.optInContent.type).toBe(CodeReviewRedesignView)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(
            await CodeReviewView(page!.props.defaultContent.props as Parameters<typeof CodeReviewView>[0]),
        )

        expect(screen.getByText('Study Code')).toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
            'href',
            expect.stringContaining('/agreements?from=previous'),
        )
    })

    it('renders LegacyProposalReviewView with agreementsHref when from=agreements and code submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements' }),
        })
        expect(page?.type).toBe(LegacyProposalReviewView)
        expect(page?.props.agreementsHref).toContain('/agreements')
    })

    it('renders CodeReviewFeatureFlag directly when agreements already acknowledged (no redirect)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        await db
            .updateTable('study')
            .set({ reviewerAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        expect(page?.type).toBe(CodeReviewFeatureFlag)
        expect(page?.props.defaultContent.type).toBe(CodeReviewView)
        expect(page?.props.optInContent.type).toBe(CodeReviewRedesignView)
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('renders PostFeedbackView when from=code-review and code submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'code-review' }),
        })
        expect(page?.type).toBe(PostFeedbackView)
        expect(page?.props.study.id).toBe(study.id)
        expect(Array.isArray(page?.props.entries)).toBe(true)
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('renders PostFeedbackView with kind=CODE when code-review entries exist', async () => {
        // studyHasJobStatus(study, 'CODE-SUBMITTED') is what gates the from=code-review
        // branch — it requires CODE-SUBMITTED in the job status history, not the latest
        // status. Use CODE-SUBMITTED so the branch fires, then insert the review row.
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                criteria: {
                    proposalAlignment: 'yes',
                    agreementCompliance: 'yes',
                    securityChecks: 'yes',
                    privacyProtection: 'yes',
                },
            })
            .execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'code-review' }),
        })
        expect(page?.type).toBe(PostFeedbackView)
        expect(page?.props.kind).toBe('CODE')
        expect(page?.props.entries).toHaveLength(1)
        expect(page?.props.entries[0].decision).toBe('APPROVE')
    })

    it('falls back to proposal entries (kind=PROPOSAL) when from=code-review but no code-review rows exist', async () => {
        // A reviewer is kicked out to the post-feedback view before any code-review row
        // has been committed; page.tsx fetches proposal entries instead so the user
        // lands on a meaningful page instead of an empty banner.
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db
            .insertInto('studyProposalComment')
            .values({
                studyId: study.id,
                authorId: user.id,
                authorRole: 'REVIEWER',
                entryType: 'REVIEWER-FEEDBACK',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                version: 1,
            })
            .execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'code-review' }),
        })
        expect(page?.type).toBe(PostFeedbackView)
        // No kind prop means it defaults to PROPOSAL in PostFeedbackView.
        expect(page?.props.kind).toBeUndefined()
        expect(page?.props.entries).toHaveLength(1)
        expect(page?.props.entries[0].authorRole).toBe('REVIEWER')
    })

    it('renders the proposal review feature flag swap for enclave without code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        // insertTestStudyOnly defaults to APPROVED; reset to PENDING-REVIEW so this case
        // exercises the in-flight review flow rather than OTTER-501's post-decision view.
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })

        expect(page?.type).toBe(ProposalReviewFeatureFlag)
        expect(page?.props.defaultContent.type).toBe(LegacyProposalReviewView)
        expect(page?.props.optInContent.type).toBe(ProposalReviewView)
    })

    it('renders the LegacyProposalReviewView for non-OpenStax enclave orgs by default', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        renderWithProviders(page!)

        expect(screen.getByText('Review Study')).toBeInTheDocument()
    })

    describe('post-feedback branch', () => {
        it.each(['APPROVED', 'REJECTED', 'CHANGE-REQUESTED'] as const)(
            'renders the post-submission feature flag swap when status is %s',
            async (status) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
                const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
                await setTestStudyStatus(study.id, status)

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: Promise.resolve({}),
                })

                expect(page?.type).toBe(PostSubmissionFeatureFlag)
                expect(page?.props.defaultContent.type).toBe(LegacyProposalReviewView)
                expect(page?.props.optInContent.type).toBe(PostFeedbackView)
            },
        )
    })

    describe('study-details redesign flag swap (OTTER-538)', () => {
        it.each(['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED', 'JOB-ERRORED'] as const)(
            'wraps CodeReviewView in StudyDetailsRedesignFeatureFlag when latest job status is %s',
            async (jobStatus) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
                const { study, job } = await insertTestStudyJobData({
                    org,
                    researcherId: user.id,
                    studyStatus: 'APPROVED',
                    jobStatus: 'CODE-SUBMITTED',
                })
                await db
                    .insertInto('jobStatusChange')
                    .values({ status: jobStatus, studyJobId: job.id, createdAt: new Date(Date.now() + 1000) })
                    .execute()
                await db
                    .updateTable('study')
                    .set({ reviewerAgreementsAckedAt: new Date() })
                    .where('id', '=', study.id)
                    .execute()

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: Promise.resolve({}),
                })

                expect(page?.type).toBe(StudyDetailsRedesignFeatureFlag)
                expect(page?.props.defaultContent.type).toBe(CodeReviewView)
                expect(page?.props.optInContent.type).toBe(StudyDetailsRedesignView)
            },
        )
    })
})
