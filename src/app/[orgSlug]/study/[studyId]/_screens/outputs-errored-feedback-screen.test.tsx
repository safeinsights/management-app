import {
    actionResult,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    requireRawState,
    screen,
    userEvent,
    vi,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { db } from '@/database'
import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import type { RawStudyState } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { OutputsErroredFeedbackScreen } from './outputs-errored-feedback-screen'
import type { ScreenComponentProps } from './types'

const APPROVED_AT = new Date('2026-06-20T12:00:00Z')
const SUBMITTED_AT = new Date('2026-07-01T12:00:00Z')
const ERRORED_AT = new Date('2026-07-15T12:00:00Z')
const DECIDED_AT = new Date('2026-08-05T12:00:00Z')
const DATA_PARTNER = 'Riverside University'

const renderScreen = async (
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
    returnTo?: 'org',
) => renderWithProviders(await OutputsErroredFeedbackScreen({ study, raw, orgSlug, returnTo }))

const setupErroredFeedbackOnly = async ({ withNote = false }: { withNote?: boolean } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    await db.updateTable('org').set({ name: DATA_PARTNER }).where('id', '=', org.id).execute()
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })

    // Pin timestamps: rows written in one test transaction tie on now().
    await db
        .updateTable('jobStatusChange')
        .set({ createdAt: SUBMITTED_AT })
        .where('studyJobId', '=', job.id)
        .where('status', '=', 'CODE-SUBMITTED')
        .execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'CODE-APPROVED', userId: user.id, createdAt: APPROVED_AT })
        .execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'JOB-ERRORED', createdAt: ERRORED_AT })
        .execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'FILES-REJECTED', userId: user.id, createdAt: DECIDED_AT })
        .execute()
    const comment = await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'NEEDS-CLARIFICATION',
            body: JSON.parse(lexicalJson('The run timed out before the aggregation completed.')),
            round: 1,
            createdAt: DECIDED_AT,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    if (withNote) {
        await db
            .updateTable('studyJob')
            .set({ resubmissionNote: JSON.parse(lexicalJson('Raised the timeout to 60s.')), resubmissionRound: 1 })
            .where('id', '=', job.id)
            .execute()
    }

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, job, commentId: comment.id }
}

describe('OutputsErroredFeedbackScreen', () => {
    describe('page and section headers', () => {
        it('renders the reused page header and STEP 4 "Verify outputs" section header with the study title', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
            const header = screen.getByTestId('proposal-section-header')
            expect(header).toHaveTextContent('STEP 4')
            expect(header).toHaveTextContent('Verify outputs')
            expect(header).toHaveTextContent(study.title!)
            expect(header).toContainElement(screen.getByTestId('proposal-header-divider'))
        })
    })

    describe('alert', () => {
        it('renders the reused action alert with the exact copy, data partner, and decision date', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', 'action')
            expect(alert).toHaveTextContent('Resolve the code error to proceed • Aug 05, 2026')
            expect(alert).toHaveTextContent(
                'Riverside University has shared feedback on why the code run failed. The outputs are not available for this study. When you are ready, edit your code and resubmit.',
            )
            expect(screen.queryByText(/Feedback on outputs available/)).not.toBeInTheDocument()
        })

        it('dates the banner from the FILES-REJECTED decision, not the error or code approval', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent('Aug 05, 2026')
            expect(alert).not.toHaveTextContent('Jul 15, 2026')
            expect(alert).not.toHaveTextContent('Jun 20, 2026')
        })

        it('degrades to an undated banner when the FILES-REJECTED row has no timestamp', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            const undatedRaw: RawStudyState = {
                ...raw,
                jobs: raw.jobs.map((j) => ({
                    ...j,
                    statusChanges: j.statusChanges.map((c) =>
                        c.status === 'FILES-REJECTED' ? { status: c.status } : c,
                    ),
                })),
            }
            await renderScreen(study, undatedRaw, org.slug)

            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent('Resolve the code error to proceed')
            expect(alert).not.toHaveTextContent('•')
        })
    })

    describe('feedback and notes', () => {
        it("renders this study's outputs feedback and resubmission note in the reused section", async () => {
            const { org, user, study, raw } = await setupErroredFeedbackOnly({ withNote: true })
            await renderScreen(study, raw, org.slug)

            const section = screen.getByTestId('feedback-and-notes-section')
            expect(section).toHaveTextContent('Feedback and notes')
            expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
            expect(section).toHaveTextContent('The run timed out before the aggregation completed.')
            expect(section).toHaveTextContent('Resubmission note (v1.0)')
            expect(section).toHaveTextContent('Raised the timeout to 60s.')
            expect(section).toHaveTextContent(user.fullName)
            expect(section).toHaveTextContent('Aug 05, 2026')
            expect(section).toHaveTextContent('Jul 01, 2026')
            expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
        })

        it('expands the latest entry and lets a prior entry toggle open', async () => {
            const { org, study, raw, job, commentId } = await setupErroredFeedbackOnly({ withNote: true })
            const spy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                await renderScreen(study, raw, org.slug)

                expect(screen.getByTestId(`feedback-toggle-${commentId}`)).toHaveAttribute('aria-expanded', 'true')
                const prior = screen.getByTestId(`feedback-toggle-job-note-${job.id}`)
                expect(prior).toHaveAttribute('aria-expanded', 'false')
                await userEvent.click(prior)
                expect(prior).toHaveAttribute('aria-expanded', 'true')
            } finally {
                spy.mockRestore()
            }
        })

        it("shows only this study's feedback, not another study's", async () => {
            const { org, user, study, raw } = await setupErroredFeedbackOnly()
            const { study: otherStudy, job: otherJob } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId: otherStudy.id,
                    studyJobId: otherJob.id,
                    authorId: user.id,
                    reviewKind: 'RESULTS',
                    entryType: 'DECISION',
                    decision: 'NEEDS-CLARIFICATION',
                    body: JSON.parse(lexicalJson('Feedback that belongs to the other study.')),
                    round: 1,
                })
                .execute()

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('The run timed out before the aggregation completed.')).toBeInTheDocument()
            expect(screen.queryByText('Feedback that belongs to the other study.')).not.toBeInTheDocument()
        })

        it('does not surface code-review feedback in the outputs thread', async () => {
            const { org, user, study, raw, job } = await setupErroredFeedbackOnly()
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'CODE',
                    entryType: 'DECISION',
                    decision: 'APPROVE',
                    body: JSON.parse(lexicalJson('Code-step approval feedback.')),
                    round: 1,
                })
                .execute()

            await renderScreen(study, raw, org.slug)

            expect(screen.queryByText('Code-step approval feedback.')).not.toBeInTheDocument()
        })
    })

    describe('navigation', () => {
        it('wires Previous step (subtle) to the code-approved page and Edit code (outline, enabled) to resubmit', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const previous = screen.getByRole('link', { name: /previous step/i })
            expect(previous).toHaveAttribute('href', Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id }))
            expect(previous).toHaveAttribute('data-variant', 'subtle')

            const edit = screen.getByRole('link', { name: /edit code/i })
            expect(edit).toHaveAttribute('href', Routes.studyResubmit({ orgSlug: org.slug, studyId: study.id }))
            expect(edit).toHaveAttribute('data-variant', 'outline')
            expect(edit).not.toHaveAttribute('data-disabled')
        })

        it('passes returnTo through to the Previous step link', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug, 'org')

            expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
                'href',
                Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id, returnTo: 'org' }),
            )
        })
    })

    describe('guards', () => {
        it('short-circuits when there is no job', async () => {
            const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
            const raw = await requireRawState(study.id)
            await renderScreen(study, raw, org.slug)
            expect(screen.getByText('Feedback not found')).toBeInTheDocument()
        })

        it('short-circuits for a draft even when the job has the decision statuses', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'DRAFT',
                jobStatus: 'CODE-SUBMITTED',
            })
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'JOB-ERRORED' }).execute()
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-REJECTED' }).execute()
            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('No submission found')).toBeInTheDocument()
        })

        it('does not render for a clean-run FILES-REJECTED (the OTTER-695 screen)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-REJECTED' }).execute()
            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('Feedback not found')).toBeInTheDocument()
            expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
        })

        it('does not render when the reviewer shared the outputs (FILES-APPROVED)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'JOB-ERRORED' }).execute()
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('Feedback not found')).toBeInTheDocument()
        })

        it('does not render while an errored run is still awaiting a files decision', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'JOB-ERRORED' }).execute()
            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('Feedback not found')).toBeInTheDocument()
        })
    })
})
