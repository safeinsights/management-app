import { describe, it, expect } from 'vitest'
import * as RouterMock from 'next-router-mock'
import {
    insertTestBaselineJob,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    userEvent,
    faker,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import StudyReviewPage from './page'
import { CodePostDecisionView } from './code-post-decision-view'
import { CodePostSubmissionView } from './code-post-submission-view'
import { ResearcherProposalView } from './researcher-proposal-view'
import { StudyDetailsResearcher } from './study-details-researcher'

const defaultSearchParams = Promise.resolve({})

describe('StudyViewPage', () => {
    it('renders CodePostSubmissionView when job has CODE-SUBMITTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })

        expect(page?.type).toBe(CodePostSubmissionView)
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
        await setTestStudyStatus(study.id, 'REJECTED')

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
        await setTestStudyStatus(study.id, 'CHANGE-REQUESTED')

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
        await setTestStudyStatus(study.id, 'DRAFT')

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

    const addJobStatus = async (studyId: string, status: StudyJobStatus) => {
        const job = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', studyId)
            .executeTakeFirstOrThrow()
        // Append strictly after the current latest so multi-status histories keep a stable order.
        const last = await db
            .selectFrom('jobStatusChange')
            .select('createdAt')
            .where('studyJobId', '=', job.id)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()
        const base = last?.createdAt ? new Date(last.createdAt).getTime() : Date.now()
        await db
            .insertInto('jobStatusChange')
            .values({ status, studyJobId: job.id, createdAt: new Date(base + 1000) })
            .execute()
    }

    const setupCrossOrgSubmittedCode = async ({
        studyStatus = 'APPROVED',
        jobStatus = 'CODE-SUBMITTED',
    }: {
        studyStatus?: StudyStatus
        jobStatus?: StudyJobStatus
    } = {}) => {
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { org: lab, user } = await mockSessionWithTestData({ orgSlug: faker.string.alpha(10), orgType: 'lab' })
        const submittedAt = studyStatus === 'DRAFT' ? null : new Date()
        const study = await db
            .insertInto('study')
            .values({
                orgId: enclave.id,
                submittedByOrgId: lab.id,
                containerLocation: 'test-container',
                title: 'cross-org code review study',
                researcherId: user.id,
                piName: 'test',
                status: studyStatus,
                submittedAt,
                dataSources: ['all'],
                outputMimeType: 'application/zip',
                language: 'R',
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const job = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db
            .insertInto('jobStatusChange')
            .values({ status: jobStatus, studyJobId: job.id, userId: user.id })
            .execute()

        return { enclave, lab, study, job, user }
    }

    describe('post-code-submission', () => {
        it('renders CodePostSubmissionView when latest status is CODE-SUBMITTED and study is PENDING-REVIEW', async () => {
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

            expect(page?.type).toBe(CodePostSubmissionView)
        })

        it('renders CodePostSubmissionView when latest status is CODE-SCANNED and study is PENDING-REVIEW', async () => {
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

            expect(page?.type).toBe(CodePostSubmissionView)
        })

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

        it('preserves dashboardHref when ?returnTo=org', async () => {
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

            expect(page?.type).toBe(CodePostSubmissionView)
            expect(page?.props.dashboardHref).toBe(`/${org.slug}/dashboard`)
        })

        it('renders CodePostSubmissionView when study is APPROVED but latest status is CODE-SUBMITTED (no PENDING-REVIEW gate)', async () => {
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

            expect(page?.type).toBe(CodePostSubmissionView)
        })
    })

    describe('post-code-decision (OTTER-556)', () => {
        const seedCodeReviewComment = async (
            studyId: string,
            authorId: string,
            decision: 'APPROVE' | 'REJECT' | 'NEEDS-CLARIFICATION',
        ) => {
            const job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', studyId)
                .executeTakeFirstOrThrow()
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId,
                    studyJobId: job.id,
                    authorId,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision,
                    body: { root: { type: 'root', children: [] } },
                })
                .execute()
        }

        it.each([
            ['CODE-APPROVED', 'APPROVE'],
            ['CODE-CHANGES-REQUESTED', 'NEEDS-CLARIFICATION'],
            ['CODE-REJECTED', 'REJECT'],
        ] as const)(
            'renders CodePostDecisionView when latest status is %s and review feedback exists',
            async (jobStatus, decision) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
                const { study } = await insertTestStudyJobData({
                    org,
                    researcherId: user.id,
                    studyStatus: jobStatus === 'CODE-APPROVED' ? 'APPROVED' : 'PENDING-REVIEW',
                    jobStatus: 'CODE-SUBMITTED',
                })
                await addJobStatus(study.id, jobStatus)
                await seedCodeReviewComment(study.id, user.id, decision)

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: defaultSearchParams,
                })

                expect(page?.type).toBe(CodePostDecisionView)
                // A plain code decision (not executing) still shows the submitted code listing.
                expect(page?.props.showStudyCode).toBe(true)
            },
        )

        it('renders CodePostDecisionView when latest status is a decision but no review feedback exists', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-APPROVED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(page?.props.entries).toEqual([])
            expect(page?.props.feedbackLoadError).toBe(false)
        })

        it('renders CodePostDecisionView without crashing for CODE-CHANGES-REQUESTED with empty feedback', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(() => renderWithProviders(page!)).not.toThrow()
        })
    })

    describe('execution window and late-scan race (OTTER-598)', () => {
        it.each(['JOB-PROVISIONING', 'JOB-PACKAGING', 'JOB-READY', 'JOB-RUNNING'] as const)(
            'renders CodePostDecisionView with effective CODE-APPROVED while %s',
            async (jobStatus) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
                const { study } = await insertTestStudyJobData({
                    org,
                    researcherId: user.id,
                    studyStatus: 'APPROVED',
                    jobStatus: 'CODE-SUBMITTED',
                })
                await addJobStatus(study.id, 'CODE-APPROVED')
                await addJobStatus(study.id, jobStatus)

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: defaultSearchParams,
                })

                expect(page?.type).toBe(CodePostDecisionView)
                expect(page?.props.latestJobStatus).toBe('CODE-APPROVED')
                // Execution window reads as "running / results pending": the code listing is hidden.
                expect(page?.props.showStudyCode).toBe(false)
            },
        )

        it('resolves a late CODE-SCANNED after JOB-READY to CodePostDecisionView (CODE-APPROVED), not under-review', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-APPROVED')
            await addJobStatus(study.id, 'JOB-READY')
            await addJobStatus(study.id, 'CODE-SCANNED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(page?.props.latestJobStatus).toBe('CODE-APPROVED')
            expect(page?.props.showStudyCode).toBe(false)
        })
    })

    describe('late CODE-SCANNED after a code decision (OTTER-556 reopen dead-end)', () => {
        // The scan result is an async webhook (job-scan-results/route.ts). When a reviewer records a
        // decision before the scan finishes, CODE-SCANNED is appended *after* the decision with a
        // later createdAt and becomes the job's latest status. Routing must derive the decision
        // order-independently (it stays live until a real resubmission); otherwise the researcher
        // lands on CodePostSubmissionView with no way to resubmit — the dead end QA re-reported in
        // OTTER-556 comment 43432 ("open once correct, reopen wrong").
        it.each(['CODE-CHANGES-REQUESTED', 'CODE-REJECTED', 'CODE-APPROVED'] as const)(
            'keeps CodePostDecisionView for %s when a late CODE-SCANNED lands after the decision',
            async (decision) => {
                const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
                // All three code-review decisions leave the study at APPROVED (the proposal was
                // approved; only the job carries the code decision — OTTER-603). A routing
                // fall-through here resolves to the wrong post-submission/proposal flow.
                const { study } = await insertTestStudyJobData({
                    org,
                    researcherId: user.id,
                    studyStatus: 'APPROVED',
                    jobStatus: 'CODE-SUBMITTED',
                })
                await addJobStatus(study.id, decision)
                await addJobStatus(study.id, 'CODE-SCANNED')

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: defaultSearchParams,
                })

                expect(page?.type).toBe(CodePostDecisionView)
                expect(page?.props.latestJobStatus).toBe(decision)
            },
        )

        it('still shows the decision page on reopen after a late scan (OTTER-556 comment 43432)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')

            // First open, before the scan webhook arrives: the decision page renders correctly.
            const firstOpen = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })
            expect(firstOpen?.type).toBe(CodePostDecisionView)

            // The async scan completes and appends CODE-SCANNED after the decision.
            await addJobStatus(study.id, 'CODE-SCANNED')

            // Reopen / refresh: must still land on the decision page, not the under-review page.
            const reopen = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })
            expect(reopen?.type).toBe(CodePostDecisionView)
            expect(reopen?.props.latestJobStatus).toBe('CODE-CHANGES-REQUESTED')
        })

        it('replays the production lab/enclave split and keeps the RL resubmit CTA after a late scan', async () => {
            const { lab, study } = await setupCrossOrgSubmittedCode()
            await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')
            await addJobStatus(study.id, 'CODE-SCANNED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: lab.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(page?.props.latestJobStatus).toBe('CODE-CHANGES-REQUESTED')

            renderWithProviders(page!)
            expect(screen.getByTestId('cta-edit-and-resubmit')).toHaveTextContent('Edit and resubmit')
        })

        it('returns to CodePostSubmissionView when the round is resubmitted after changes requested', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
            })
            // Legacy same-job resubmission shape: a new CODE-SUBMITTED after the decision reopens
            // review, so the decision is no longer live and the under-review page is correct.
            await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')
            await addJobStatus(study.id, 'CODE-SUBMITTED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostSubmissionView)
        })
    })

    describe('baseline-job masking (OTTER-556 refresh dead-end)', () => {
        // A fresh baseline job (IDE launch / file upload, status only INITIATED) landing on top of
        // the reviewed submission must not mask the code decision. Routing anchors on the latest
        // *submitted* job, so the researcher keeps reaching the decision page instead of being
        // bounced to the proposal / post-submission page on the next view.
        it('renders CodePostDecisionView for CODE-CHANGES-REQUESTED even when a newer baseline job exists', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() + 60_000) })

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
        })

        it('renders CodePostDecisionView for CODE-APPROVED even when a newer baseline job exists', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-APPROVED')
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() + 60_000) })

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
        })
    })

    describe('study-details redesign (OTTER-538)', () => {
        it.each(['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED', 'JOB-ERRORED'] as const)(
            'renders StudyDetailsResearcher when latest job status is %s',
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

                expect(page?.type).toBe(StudyDetailsResearcher)
            },
        )

        it.each(['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED', 'JOB-ERRORED'] as const)(
            'renders CodePostSubmissionView with the banner hidden when from=code-submission at %s',
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
                    searchParams: Promise.resolve({ from: 'code-submission' }),
                })

                expect(page?.type).toBe(CodePostSubmissionView)
                expect(page?.props.isUnderReview).toBe(false)
            },
        )

        it('threads returnTo=org to StudyDetailsResearcher at a results status', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'RUN-COMPLETE')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({ returnTo: 'org' }),
            })

            expect(page?.type).toBe(StudyDetailsResearcher)
            expect(page?.props.returnTo).toBe('org')
        })

        // Fix 2 (PR #759): the from=code-submission branch is gated on isStudyResultsStatus, so a
        // stray ?from=code-submission at a code-decision status falls through to CodePostDecisionView
        // instead of short-circuiting to the post-submission view.
        it('falls through to CodePostDecisionView when from=code-submission arrives at CODE-APPROVED', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-APPROVED')
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
                })
                .execute()

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({ from: 'code-submission' }),
            })

            expect(page?.type).toBe(CodePostDecisionView)
        })
    })
})
