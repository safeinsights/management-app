import { describe, it, expect } from 'vitest'
import {
    insertTestBaselineJob,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    faker,
    userEvent,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import StudyReviewPage from './page'
import { CodePostDecisionView } from './code-post-decision-view'
import { CodePostSubmissionView } from './code-post-submission-view'

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

    // OTTER-614: APPROVED-no-code resolves to proposal-feedback, which renders the same
    // ProposalSubmitted page as /submitted (toggle, feedback/notes, status-driven forward).
    it('renders the ProposalSubmitted page with a Proceed-to-step-3 link for APPROVED study without code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('View full initial request')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Initial request')
        expect(screen.getByRole('link', { name: /proceed to step 3/i })).toBeInTheDocument()
    })

    it('renders the ProposalSubmitted page for a REJECTED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'REJECTED')

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('View full initial request')
        expect(screen.getByTestId('status-banner-REJECTED')).toBeInTheDocument()
    })

    it('renders the ProposalSubmitted page with an Edit-and-resubmit link for a CHANGE-REQUESTED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await setTestStudyStatus(study.id, 'CHANGE-REQUESTED')

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: defaultSearchParams,
        })
        renderWithProviders(page!)

        expect(screen.getByTestId('status-banner-CHANGE-REQUESTED')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /edit and resubmit/i })).toBeInTheDocument()
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

    const addMainCodeFile = async (studyId: string) => {
        const job = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', studyId)
            .executeTakeFirstOrThrow()
        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'main.R',
                path: `studies/${studyId}/${job.id}/main.R`,
                fileType: 'MAIN-CODE',
            })
            .execute()
    }

    const expectSubmittedCodeCanExpand = async () => {
        const toggle = screen.getByTestId('study-code-toggle')
        expect(toggle).toHaveTextContent('View submitted study code')
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByTestId('cta-proceed-to-results')).not.toBeInTheDocument()

        await userEvent.setup().click(toggle)

        expect(await screen.findByTestId('submitted-code-table')).toBeInTheDocument()
        expect(screen.getByText('main.R')).toBeInTheDocument()
        expect(screen.getByTestId('study-code-toggle-collapse')).toHaveTextContent('Hide submitted study code')
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
                renderWithProviders(page!)
                expect(screen.getByTestId('study-code-toggle')).toHaveTextContent('View submitted study code')
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

    describe('execution window and late-scan race (OTTER-598, OTTER-640)', () => {
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
                await addMainCodeFile(study.id)

                const page = await StudyReviewPage({
                    params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                    searchParams: defaultSearchParams,
                })

                expect(page?.type).toBe(CodePostDecisionView)
                expect(page?.props.latestJobStatus).toBe('CODE-APPROVED')
                renderWithProviders(page!)
                expect(screen.getByTestId('decision-banner-code-approved')).toBeInTheDocument()
                await expectSubmittedCodeCanExpand()
            },
        )

        it('holds on CodePostDecisionView when the run errors before any reviewer files decision (OTTER-598, 43898)', async () => {
            // Code approved, ran, then JOB-ERRORED — but the reviewer has not recorded FILES-APPROVED
            // /FILES-REJECTED. The pill still reads "Code approved", so the page must NOT jump to the
            // results/Study Details screen; it stays on the post-code-approval page.
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-APPROVED')
            await addJobStatus(study.id, 'JOB-RUNNING')
            await addJobStatus(study.id, 'JOB-ERRORED')
            await addMainCodeFile(study.id)

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(page?.props.latestJobStatus).toBe('CODE-APPROVED')
            expect(page?.props.resultsHref).toBeUndefined()
            renderWithProviders(page!)
            expect(screen.getByTestId('decision-banner-code-approved')).not.toHaveTextContent(/error/i)
            await expectSubmittedCodeCanExpand()
        })

        it('keeps submitted code accessible when a packaging error is hidden from the researcher', async () => {
            // Packaging-stage failure: the containerizer posts JOB-ERRORED with no execution substatus,
            // so isExecuting is false. The error is still hidden from the researcher, so the page must
            // hold on the post-code-approval view without disclosing the failure.
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-APPROVED')
            await addJobStatus(study.id, 'JOB-ERRORED')
            await addMainCodeFile(study.id)

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(page?.props.latestJobStatus).toBe('CODE-APPROVED')
            expect(page?.props.resultsHref).toBeUndefined()
            renderWithProviders(page!)
            expect(screen.getByTestId('decision-banner-code-approved')).not.toHaveTextContent(/error/i)
            await expectSubmittedCodeCanExpand()
        })

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
            await addMainCodeFile(study.id)

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: defaultSearchParams,
            })

            expect(page?.type).toBe(CodePostDecisionView)
            expect(page?.props.latestJobStatus).toBe('CODE-APPROVED')
            renderWithProviders(page!)
            await expectSubmittedCodeCanExpand()
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

        it('keeps the resubmit CTA on the decision page after a late scan (CODE-CHANGES-REQUESTED)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addJobStatus(study.id, 'CODE-CHANGES-REQUESTED')
            await addJobStatus(study.id, 'CODE-SCANNED')

            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
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
            // Same-job resubmit shape produced by the round-boundary fix + round-aware markCodeSubmitted:
            // the CR opens a new round and the resubmit appends a second CODE-SUBMITTED on the same job,
            // so the prior decision is no longer live and the under-review page is correct.
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
        // JOB-ERRORED is intentionally excluded here: a bare error stays hidden from the researcher
        // until a reviewer records a FILES-* decision, so it holds on the code-approved page instead
        // (see the execution-window describe block / OTTER-598 comment 43898).
        it.each(['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED'] as const)(
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

                renderWithProviders(page!)
                expect(screen.getByText('Study Status')).toBeInTheDocument()
                expect(screen.getByText('Study Details')).toBeInTheDocument()
                // OTTER-614: results is no longer terminal — "Previous" walks back to the
                // post-decision code step at its own route (/view/code).
                expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
                    'href',
                    `/${org.slug}/study/${study.id}/view/code`,
                )
            },
        )

        it('threads returnTo=org to the results screen via dashboardHref', async () => {
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

            // returnTo=org is baked into dashboardHref by the page dispatch before the screen
            // is called (ResearcherBreadcrumbs is mocked to null in tests, so we verify via props).
            expect(page?.props.dashboardHref).toBe(`/${org.slug}/dashboard`)
            renderWithProviders(page!)
            expect(screen.getByText('Study Status')).toBeInTheDocument()
        })

        // /view resolves purely on state — query params are ignored. A CODE-APPROVED study (no
        // results yet) resolves to the code-approved screen → CodePostDecisionView, even if a stray
        // legacy ?from= rides along.
        it('routes a CODE-APPROVED study to CodePostDecisionView regardless of query params', async () => {
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

            // Arbitrary leftover query param proves /view ignores the URL and resolves on state.
            const page = await StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({ from: 'anything' }),
            })

            expect(page?.type).toBe(CodePostDecisionView)
        })
    })
})
