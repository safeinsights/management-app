import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'
import { CodeReview } from './code-review'
import { ProposalReviewFromAgreementsView } from './proposal-review-from-agreements-view'
import { PostFeedbackView } from './post-feedback-view'
import { ProposalReviewView } from './proposal-review-view'
import { StudyDetailsReviewer } from './study-details-reviewer'

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

    it('renders CodeReview for enclave with code submitted when coming from agreements', async () => {
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
        expect(page?.type).toBe(CodeReview)
    })

    it('renders ProposalReviewFromAgreementsView with agreementsHref when from=agreements and code submitted', async () => {
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
        expect(page?.type).toBe(ProposalReviewFromAgreementsView)
        expect(page?.props.agreementsHref).toContain('/agreements')
    })

    it('renders CodeReview when agreements already acknowledged (no redirect)', async () => {
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
        expect(page?.type).toBe(CodeReview)
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

    it('renders ProposalReviewView for enclave without code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        // insertTestStudyOnly defaults to APPROVED; reset to PENDING-REVIEW so this case
        // exercises the in-flight review flow rather than OTTER-501's post-decision view.
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })

        expect(page?.type).toBe(ProposalReviewView)
    })

    describe('post-feedback branch', () => {
        it.each(['APPROVED', 'REJECTED', 'CHANGE-REQUESTED'] as const)(
            'renders PostFeedbackView when status is %s',
            async (status) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
                const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
                await setTestStudyStatus(study.id, status)

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: Promise.resolve({}),
                })

                expect(page?.type).toBe(PostFeedbackView)
            },
        )
    })

    describe('code decision post-feedback (OTTER-552)', () => {
        it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
            'renders PostFeedbackView (kind=CODE) without a from param when latest job status is %s',
            async (jobStatus) => {
                // A DO opens the study from the dashboard "View" link, which carries no
                // `from` param. Once a code decision exists, they must land on the
                // post-feedback code page rather than the active code-review/decision page.
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
                    .insertInto('studyReviewComment')
                    .values({
                        studyId: study.id,
                        studyJobId: job.id,
                        authorId: user.id,
                        reviewKind: 'CODE',
                        entryType: 'DECISION',
                        decision: jobStatus === 'CODE-APPROVED' ? 'APPROVE' : 'REJECT',
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
                    searchParams: Promise.resolve({}),
                })

                expect(page?.type).toBe(PostFeedbackView)
                expect(page?.props.kind).toBe('CODE')
                expect(mockRedirect).not.toHaveBeenCalled()
            },
        )

        it('renders CodeReview (active review) when code was resubmitted after a change request', async () => {
            // CODE-CHANGES-REQUESTED followed by a fresh CODE-SUBMITTED means the researcher
            // resubmitted; the DO must return to active review, not the decision page. Gating
            // on the *latest* job status (not "any decision in history") is what makes this work.
            const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await db
                .insertInto('jobStatusChange')
                .values({
                    status: 'CODE-CHANGES-REQUESTED',
                    studyJobId: job.id,
                    createdAt: new Date(Date.now() + 1000),
                })
                .execute()
            await db
                .insertInto('jobStatusChange')
                .values({ status: 'CODE-SUBMITTED', studyJobId: job.id, createdAt: new Date(Date.now() + 2000) })
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

            expect(page?.type).toBe(CodeReview)
        })
    })

    describe('study-details redesign (OTTER-538)', () => {
        it.each(['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED', 'JOB-ERRORED'] as const)(
            'renders StudyDetailsReviewer when latest job status is %s',
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

                expect(page?.type).toBe(StudyDetailsReviewer)
            },
        )

        // OTTER-538 QA finding (DO): "Previous" from the results-stage Study Details page
        // navigates to /review?from=code-review. After OTTER-552 that param routes to the
        // post-code-feedback page. This proves the destination renders non-blank (the code
        // APPROVE decision is present), rather than a null PostFeedbackView, at a results status.
        it('renders the post-code-feedback page (kind=CODE, non-blank) when from=code-review at a results status', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await db
                .insertInto('jobStatusChange')
                .values({ status: 'RUN-COMPLETE', studyJobId: job.id, createdAt: new Date(Date.now() + 1000) })
                .execute()
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

        // Reachability tripwire for the latent blank-page path: PostFeedbackView returns null
        // when entries[0].decision is null, and getCodeReviewFeedbackAction sorts newest-first
        // with resubmission notes carrying decision: null. At a results status the approved job
        // can itself be a resubmission, so a note (dated at job creation) coexists with the later
        // APPROVE. This proves the APPROVE stays newest (entries[0]), so the page never blanks.
        // If the ordering invariant ever regresses, entries[0] becomes the note and this fails
        // (surfacing the OTTER-552-owned hardening rather than letting it silently break here).
        it('keeps the APPROVE newest (non-blank) when a resubmission note coexists at a results status', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })

            // The approved job is itself a resubmission: its note is dated at job creation and
            // the reviewer's APPROVE lands a day later, mirroring the real resubmit -> approve flow.
            await db
                .updateTable('studyJob')
                .set({
                    createdAt: new Date('2026-03-01T00:00:00Z'),
                    resubmissionNote: { root: { type: 'root', children: [{ text: 'fixed things' }] } },
                })
                .where('id', '=', job.id)
                .execute()
            await db
                .insertInto('jobStatusChange')
                .values({ status: 'RUN-COMPLETE', studyJobId: job.id, createdAt: new Date('2026-03-03T00:00:00Z') })
                .execute()
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
                    createdAt: new Date('2026-03-02T00:00:00Z'),
                })
                .execute()

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({ from: 'code-review' }),
            })

            expect(page?.type).toBe(PostFeedbackView)
            expect(page?.props.kind).toBe('CODE')
            // Newest-first: the APPROVE outranks the older note, so entries[0] is decision-bearing
            // and PostFeedbackView does not return null. The note is still present for history.
            expect(page?.props.entries[0].decision).toBe('APPROVE')
            expect(page?.props.entries.some((e: { entryType: string }) => e.entryType === 'RESUBMISSION-NOTE')).toBe(
                true,
            )
        })
    })
})
