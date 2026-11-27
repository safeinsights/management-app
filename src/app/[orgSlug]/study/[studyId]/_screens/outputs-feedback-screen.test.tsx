import {
    actionResult,
    describe,
    expect,
    faker,
    insertTestCodeResubmissionNote,
    insertTestJob,
    insertTestJobStatus,
    insertTestOrg,
    insertTestStudyJobData,
    it,
    type PriorCodeRunOptions,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    requireRawState,
    screen,
    userEvent,
    vi,
    fireEvent,
    waitFor,
    waitForPendingMutations,
    within,
    nodeText,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { type FC, type ReactElement, useState } from 'react'
import dayjs from 'dayjs'
import { db } from '@/database'
import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import { researcherOutputsFeedbackBanner } from '@/lib/study-banners'
import type { RawStudyState } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { OutputsFeedbackScreen } from './outputs-feedback-screen'
import { screenNavProps } from './render-screen'
import type { ScreenComponentProps } from './types'

const APPROVED_AT = new Date('2026-06-20T12:00:00Z')
const SUBMITTED_AT = new Date('2026-07-01T12:00:00Z')
const ERRORED_AT = new Date('2026-07-15T12:00:00Z')
const FIRST_DECIDED_AT = new Date('2026-07-20T12:00:00Z')
const DECIDED_AT = new Date('2026-08-05T12:00:00Z')
const VIEWED_AT = new Date('2026-09-10T12:00:00Z')
const EARLIER_RUN_AT = new Date('2026-04-01T12:00:00Z')
const NO_OUTPUTS_TEXT = 'No output files were shared for this code run.'

const formatDate = (date: Date) => dayjs(date).format('MMM DD, YYYY')
const card = () => screen.getByTestId('code-run-card')
const isBefore = (first: Element, second: Element) =>
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
// The status writer replays rows by date, so every row of a dated history carries one.
const daysBefore = (date: Date, days: number) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000)

const DATA_PARTNER = 'Riverside University'
// The shared helpers point study.orgId at the user's own org, so a banner reading the wrong org
// would still match.
const givenDataPartner = async (studyId: string) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave', name: DATA_PARTNER })
    await db.updateTable('study').set({ orgId: dataPartner.id }).where('id', '=', studyId).execute()
    return dataPartner
}

const copyFor = (runErrored: boolean, dataPartner = 'Any Data Partner') =>
    researcherOutputsFeedbackBanner({ runErrored }, { dataPartner })

// The screen records the lab's view on mount; that write has to land before the teardown check.
const renderScreen = async (study: ScreenComponentProps['study'], raw: RawStudyState, orgSlug: string) => {
    const rendered = renderWithProviders(
        await OutputsFeedbackScreen({
            study,
            raw,
            ...screenNavProps('researcher', 'outputs-feedback', raw, {
                orgSlug,
                studyId: study.id,
            }),
        }),
    )
    await waitForPendingMutations()
    return rendered
}

type SetupOptions = {
    withNote?: boolean
    /** Earlier, already-decided runs; written before the latest one, as the fixture requires. */
    priorRuns?: (authorId: string) => PriorCodeRunOptions[]
}

const setupFeedbackOnly = async ({ withNote = false, priorRuns }: SetupOptions = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'INITIATED',
        priorRuns: priorRuns?.(user.id),
    })

    await insertTestJobStatus(job.id, 'CODE-SUBMITTED', { at: SUBMITTED_AT, userId: user.id })
    await insertTestJobStatus(job.id, 'CODE-APPROVED', { at: APPROVED_AT, userId: user.id })
    await insertTestJobStatus(job.id, 'RUN-COMPLETE', { at: daysBefore(DECIDED_AT, 1) })
    await insertTestJobStatus(job.id, 'FILES-REJECTED', { at: DECIDED_AT, userId: user.id })
    await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'NEEDS-CLARIFICATION',
            body: JSON.parse(lexicalJson('Remove the row-level output before resharing.')),
            round: 1,
            createdAt: DECIDED_AT,
        })
        .execute()
    if (withNote) {
        await insertTestCodeResubmissionNote({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            round: 1,
            text: 'Adjusted the aggregation query.',
        })
    }

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, job }
}

// Errored run + "Share feedback only" (OTTER-697).
const setupErroredFeedbackOnly = async ({ withNote = false, priorRuns }: SetupOptions = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'INITIATED',
        priorRuns: priorRuns?.(user.id),
    })
    const dataPartner = await givenDataPartner(dbStudy.id)

    await insertTestJobStatus(job.id, 'CODE-SUBMITTED', { at: SUBMITTED_AT, userId: user.id })
    await insertTestJobStatus(job.id, 'CODE-APPROVED', { at: APPROVED_AT, userId: user.id })
    await insertTestJobStatus(job.id, 'JOB-ERRORED', { at: ERRORED_AT })
    await insertTestJobStatus(job.id, 'FILES-REJECTED', { at: DECIDED_AT, userId: user.id })
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
        await insertTestCodeResubmissionNote({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            round: 1,
            text: 'Raised the timeout to 60s.',
        })
    }

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, job, dataPartner, commentId: comment.id }
}

// The researcher has opened the decision, so the status reads "outputs reviewed".
const setupViewedFeedbackOnly = async (options: SetupOptions = {}) => {
    const setup = await setupFeedbackOnly(options)
    await insertTestJobStatus(setup.job.id, 'RESULTS-VIEWED', { at: VIEWED_AT })
    return { ...setup, raw: await requireRawState(setup.study.id) }
}

// The three researcher statuses the card names: outputs need review, outputs reviewed, code errored.
const RESEARCHER_STATUSES = [
    ['outputs need review', setupFeedbackOnly],
    ['outputs reviewed', setupViewedFeedbackOnly],
    ['code errored', setupErroredFeedbackOnly],
] as const

// Two outputs decisions across two jobs, with a code resubmission note between them: the shape the
// card reported, where the code round had climbed to 2 before the first outputs decision was made.
const setupTwoOutputsRounds = async () => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job: firstJob } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })

    await insertTestJobStatus(firstJob.id, 'CODE-CHANGES-REQUESTED', {
        at: daysBefore(APPROVED_AT, 2),
        userId: user.id,
    })
    await insertTestJobStatus(firstJob.id, 'CODE-SUBMITTED', { at: daysBefore(APPROVED_AT, 1), userId: user.id })
    await insertTestJobStatus(firstJob.id, 'CODE-APPROVED', { at: APPROVED_AT, userId: user.id })
    await insertTestJobStatus(firstJob.id, 'RUN-COMPLETE', { at: daysBefore(FIRST_DECIDED_AT, 1) })
    await insertTestJobStatus(firstJob.id, 'FILES-REJECTED', { at: FIRST_DECIDED_AT, userId: user.id })
    const firstComment = await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: firstJob.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'NEEDS-CLARIFICATION',
            body: JSON.parse(lexicalJson('First round: remove the row-level output.')),
            round: 1,
            createdAt: FIRST_DECIDED_AT,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    // Created second, so its v7 id sorts above the first and latestJob picks it.
    const secondJob = await insertTestJob(dbStudy.id)
    await insertTestCodeResubmissionNote({
        studyId: dbStudy.id,
        studyJobId: secondJob.id,
        authorId: user.id,
        round: 3,
        text: 'Aggregated the counts as asked.',
        createdAt: SUBMITTED_AT,
    })
    await insertTestJobStatus(secondJob.id, 'CODE-SUBMITTED', { at: SUBMITTED_AT, userId: user.id })
    await insertTestJobStatus(secondJob.id, 'CODE-APPROVED', { at: daysBefore(DECIDED_AT, 2), userId: user.id })
    await insertTestJobStatus(secondJob.id, 'RUN-COMPLETE', { at: daysBefore(DECIDED_AT, 1) })
    await insertTestJobStatus(secondJob.id, 'FILES-REJECTED', { at: DECIDED_AT, userId: user.id })
    const secondComment = await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: secondJob.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'NEEDS-CLARIFICATION',
            body: JSON.parse(lexicalJson('Second round: the totals still disclose a cell count.')),
            round: 2,
            createdAt: DECIDED_AT,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, firstCommentId: firstComment.id, secondCommentId: secondComment.id }
}

describe('OutputsFeedbackScreen', () => {
    it('renders the page header and STEP 4 section header without the study title', async () => {
        const { org, study, raw } = await setupFeedbackOnly()
        await renderScreen(study, raw, org.slug)

        expect(
            screen.getByRole('heading', { level: 1, name: `${study.title} — Step 4: Verify outputs` }),
        ).toBeInTheDocument()
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('Step 4')
        expect(header).toHaveTextContent('Verify outputs')
        expect(header).not.toHaveTextContent(study.title!)
    })

    describe('clean run banner (OTTER-695)', () => {
        it('renders the action alert with feedback-available copy, data partner name, and decision date', async () => {
            const { org, study, raw } = await setupFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const copy = copyFor(false, org.name)
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', copy.variant)
            expect(alert).toHaveTextContent(`${copy.title} • ${dayjs(DECIDED_AT).format('MMM DD, YYYY')}`)
            expect(alert).toHaveTextContent(nodeText(copy.body))
        })

        it('dates the banner from the FILES-REJECTED decision, not code approval or today', async () => {
            const { org, study, raw } = await setupFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
            expect(alert).not.toHaveTextContent(dayjs(APPROVED_AT).format('MMM DD, YYYY'))
            expect(alert).not.toHaveTextContent(dayjs(new Date()).format('MMM DD, YYYY'))
        })

        it('degrades to an undated banner when the raw FILES-REJECTED row carries no timestamp', async () => {
            const { org, study, raw } = await setupFeedbackOnly()
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
            expect(alert).toHaveTextContent(copyFor(false).title)
            expect(alert).not.toHaveTextContent('•')
        })
        it('shows clean-run copy when JOB-ERRORED came from packaging but the run completed (RUN-COMPLETE present)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'INITIATED',
            })
            await givenDataPartner(dbStudy.id)
            await insertTestJobStatus(job.id, 'CODE-SUBMITTED', { at: SUBMITTED_AT, userId: user.id })
            await insertTestJobStatus(job.id, 'CODE-APPROVED', { at: daysBefore(DECIDED_AT, 3), userId: user.id })
            await insertTestJobStatus(job.id, 'JOB-ERRORED', { at: daysBefore(DECIDED_AT, 2) })
            await insertTestJobStatus(job.id, 'RUN-COMPLETE', { at: daysBefore(DECIDED_AT, 1) })
            await insertTestJobStatus(job.id, 'FILES-REJECTED', { at: DECIDED_AT, userId: user.id })
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId: dbStudy.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'RESULTS',
                    entryType: 'DECISION',
                    decision: 'NEEDS-CLARIFICATION',
                    body: JSON.parse(lexicalJson('PII found in results.')),
                    round: 1,
                    createdAt: DECIDED_AT,
                })
                .execute()

            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
            await renderScreen(study, raw, org.slug)

            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent(copyFor(false, DATA_PARTNER).title)
            expect(alert).toHaveTextContent(nodeText(copyFor(false, DATA_PARTNER).body))
            expect(alert).not.toHaveTextContent(copyFor(true).title)
        })
    })

    describe('errored run banner (OTTER-697)', () => {
        it('renders the resolve-error copy, data partner, and decision date', async () => {
            const { org, study, raw, dataPartner } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const copy = copyFor(true, dataPartner.name)
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', copy.variant)
            expect(alert).toHaveTextContent(`${copy.title} • ${dayjs(DECIDED_AT).format('MMM DD, YYYY')}`)
            expect(alert).toHaveTextContent(nodeText(copy.body))
            expect(alert).not.toHaveTextContent(org.name)
            expect(document.body).not.toHaveTextContent(copyFor(false).title)
        })

        it('dates the banner from the FILES-REJECTED decision, not the error or code approval', async () => {
            const { org, study, raw } = await setupErroredFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
            expect(alert).not.toHaveTextContent(dayjs(ERRORED_AT).format('MMM DD, YYYY'))
            expect(alert).not.toHaveTextContent(dayjs(APPROVED_AT).format('MMM DD, YYYY'))
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
            expect(alert).toHaveTextContent(copyFor(true).title)
            expect(alert).not.toHaveTextContent('•')
        })
    })

    describe.each(RESEARCHER_STATUSES)('code run card (%s)', (_label, setup) => {
        it('titles the card with the decision date and states that no outputs were shared', async () => {
            const { org, study, raw } = await setup()
            await renderScreen(study, raw, org.slug)

            expect(
                within(card()).getByRole('heading', { name: `Code run ${formatDate(DECIDED_AT)}` }),
            ).toBeInTheDocument()
            expect(within(card()).getByText('Output files')).toBeInTheDocument()
            expect(within(card()).getByText(NO_OUTPUTS_TEXT)).toBeInTheDocument()
            expect(screen.queryByText(/^Security key/)).toBeNull()
            expect(screen.queryByText(/Enter your security key/)).toBeNull()
            expect(screen.queryByRole('textbox', { name: 'Security key' })).toBeNull()
            expect(screen.queryByRole('button', { name: 'View files' })).toBeNull()
            expect(screen.queryByTestId('code-run-outputs')).toBeNull()
        })

        it("shows the latest run's reviewer feedback in the card, after the static text", async () => {
            const { org, user, study, raw } = await setup()
            await renderScreen(study, raw, org.slug)

            expect(screen.queryByText(/feedback and notes/i)).toBeNull()
            expect(screen.queryByTestId('feedback-and-notes-section')).toBeNull()
            const feedback = within(card()).getByTestId('latest-run-feedback')
            expect(isBefore(within(card()).getByText(NO_OUTPUTS_TEXT), feedback)).toBe(true)
            expect(feedback).toHaveTextContent('Reviewer feedback')
            expect(feedback).not.toHaveTextContent('(v')
            expect(feedback).toHaveTextContent(user.fullName)
            expect(feedback).toHaveTextContent(formatDate(DECIDED_AT))
            expect(screen.queryAllByTestId('entry-divider')).toHaveLength(0)
        })
    })

    it('follows the latest decision when an earlier run shared its outputs', async () => {
        const { org, study, raw } = await setupFeedbackOnly({
            priorRuns: (authorId) => [
                { ranAt: EARLIER_RUN_AT, feedback: { authorId, text: 'Outputs shared on the earlier run.' } },
            ],
        })
        await renderScreen(study, raw, org.slug)

        expect(within(card()).getByText(NO_OUTPUTS_TEXT)).toBeInTheDocument()
        expect(screen.queryByRole('textbox', { name: 'Security key' })).toBeNull()
        expect(within(card()).getByTestId('latest-run-feedback')).toHaveTextContent(
            'Remove the row-level output before resharing.',
        )
        expect(screen.queryByText('Outputs shared on the earlier run.')).toBeNull()
    })

    describe('reviewer feedback (clean run)', () => {
        // OTTER-766: the note belongs to the code step, so it stays on the code screens.
        it("renders this study's outputs feedback and no resubmission note", async () => {
            const { org, user, study, raw } = await setupFeedbackOnly({ withNote: true })
            await renderScreen(study, raw, org.slug)

            const section = screen.getByTestId('latest-run-feedback')
            expect(section).toHaveTextContent('Reviewer feedback')
            expect(section).toHaveTextContent('Remove the row-level output before resharing.')
            expect(section).not.toHaveTextContent('Resubmission note')
            expect(section).not.toHaveTextContent('Adjusted the aggregation query.')
            expect(section).toHaveTextContent(user.fullName)
            expect(screen.queryAllByTestId('entry-divider')).toHaveLength(0)
        })

        it("shows only this study's feedback, not another study's", async () => {
            const { org, user, study, raw } = await setupFeedbackOnly()
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

            expect(screen.getByText('Remove the row-level output before resharing.')).toBeInTheDocument()
            expect(screen.queryByText('Feedback that belongs to the other study.')).not.toBeInTheDocument()
        })

        it('does not surface code-review feedback in the outputs thread', async () => {
            const { org, user, study, raw, job } = await setupFeedbackOnly()
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

    describe('reviewer feedback (errored run)', () => {
        it("renders this study's outputs feedback and no resubmission note", async () => {
            const { org, user, study, raw } = await setupErroredFeedbackOnly({ withNote: true })
            await renderScreen(study, raw, org.slug)

            const section = screen.getByTestId('latest-run-feedback')
            expect(section).not.toHaveTextContent('Feedback and notes')
            expect(section).toHaveTextContent('Reviewer feedback')
            expect(section).toHaveTextContent('The run timed out before the aggregation completed.')
            expect(section).not.toHaveTextContent('Resubmission note')
            expect(section).not.toHaveTextContent('Raised the timeout to 60s.')
            expect(section).toHaveTextContent(user.fullName)
            expect(section).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
            expect(screen.queryAllByTestId('entry-divider')).toHaveLength(0)
        })
    })

    // Two code rounds and two outputs rounds on one study: the earlier round belongs to the code run
    // history (OTTER-1070), not this card.
    describe('reviewer feedback across two outputs rounds', () => {
        it("shows only the latest run's feedback", async () => {
            const { org, study, raw } = await setupTwoOutputsRounds()
            await renderScreen(study, raw, org.slug)

            const feedback = within(card()).getByTestId('latest-run-feedback')
            expect(feedback).toHaveTextContent('Reviewer feedback')
            expect(feedback).not.toHaveTextContent('(v')
            expect(feedback).toHaveTextContent('Second round: the totals still disclose a cell count.')
            expect(screen.queryByText('First round: remove the row-level output.')).toBeNull()
            expect(feedback).not.toHaveTextContent('Aggregated the counts as asked.')
            expect(screen.queryAllByTestId('entry-divider')).toHaveLength(0)
        })

        it('expands the latest entry and lets it collapse again', async () => {
            const { org, study, raw, firstCommentId, secondCommentId } = await setupTwoOutputsRounds()
            const spy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                await renderScreen(study, raw, org.slug)

                expect(screen.queryByTestId(`feedback-toggle-${firstCommentId}`)).toBeNull()
                const latest = screen.getByTestId(`feedback-toggle-${secondCommentId}`)
                expect(latest).toHaveAttribute('aria-expanded', 'true')
                await userEvent.click(latest)
                expect(latest).toHaveAttribute('aria-expanded', 'false')
            } finally {
                spy.mockRestore()
            }
        })
    })

    describe('navigation', () => {
        // Spec: feedback without outputs has no successful flow to conclude, so Edit code is the one
        // solid action (the QA rejection on PR #1001 caught it rendering outline, leaving a dead end).
        it.each([
            ['clean run', setupFeedbackOnly],
            ['errored run', setupErroredFeedbackOnly],
        ])(
            '%s: Previous step (subtle) to the code step and Edit code (solid) to resubmit, via the step nav',
            async (_label, setup) => {
                const { org, study, raw } = await setup()
                await renderScreen(study, raw, org.slug)

                expect(screen.getByTestId('step-navigation')).toBeInTheDocument()
                const previous = screen.getByTestId('cta-previous-step')
                expect(previous).toHaveAttribute('href', Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id }))
                expect(previous).toHaveAttribute('data-variant', 'subtle')

                const edit = screen.getByTestId('cta-edit-code')
                expect(edit).toHaveAttribute('href', Routes.studyResubmit({ orgSlug: org.slug, studyId: study.id }))
                expect(edit).toHaveAttribute('data-variant', 'filled')
                expect(edit).not.toHaveAttribute('data-disabled')
                expect(screen.queryByTestId('cta-back-to-my-studies')).not.toBeInTheDocument()
            },
        )
    })

    describe('guards', () => {
        it('short-circuits on the routing guard for a study with no job (no decision to show)', async () => {
            const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
            const raw = await requireRawState(study.id)
            await renderScreen(study, raw, org.slug)
            expect(screen.getByText('Feedback not found')).toBeInTheDocument()
        })

        it('shows the no-submission alert for a titleless draft even when its job carries the decision statuses', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'DRAFT',
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertTestJobStatus(job.id, 'RUN-COMPLETE')
            await insertTestJobStatus(job.id, 'FILES-REJECTED')
            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('No submission found')).toBeInTheDocument()
        })

        it('guards against rendering without a feedback-only decision (undecided clean run)', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                jobStatus: 'CODE-SUBMITTED',
            })
            await insertTestJobStatus(job.id, 'RUN-COMPLETE')
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
            await insertTestJobStatus(job.id, 'JOB-ERRORED')
            await insertTestJobStatus(job.id, 'FILES-APPROVED')
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
            await insertTestJobStatus(job.id, 'JOB-ERRORED')
            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const raw = await requireRawState(dbStudy.id)
            ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

            await renderScreen(study, raw, org.slug)

            expect(screen.getByText('Feedback not found')).toBeInTheDocument()
        })
    })
})

// Stands in for client navigation: the second study's page replaces the first in the same tree.
const StudySwitcher: FC<{ first: ReactElement; second: ReactElement }> = ({ first, second }) => {
    const [showSecond, setShowSecond] = useState(false)
    return (
        <>
            <button onClick={() => setShowSecond(true)}>Open the second study</button>
            {showSecond ? second : first}
        </>
    )
}

const history = () => screen.getByTestId('code-run-history')
const openHistory = async () => {
    fireEvent.click(within(history()).getByRole('button', { name: 'View code run history' }))
    await waitFor(() => expect(within(history()).getAllByTestId('code-run-history-row')[0]).toBeVisible())
}

// OTTER-1070: when the latest run shared feedback only, earlier runs still open from the history,
// which then carries its own key input.
describe('OutputsFeedbackScreen code run history', () => {
    it.each(RESEARCHER_STATUSES)('lists the earlier runs below the card for %s', async (_status, setup) => {
        const { org, study, raw } = await setup({
            priorRuns: (authorId) => [
                { ranAt: EARLIER_RUN_AT, feedback: { authorId, text: 'Feedback on the earlier run.' } },
            ],
        })
        await renderScreen(study, raw, org.slug)

        expect(within(history()).getByRole('heading', { name: 'Code run history (1)' })).toBeInTheDocument()
        expect(isBefore(card(), history())).toBe(true)
        expect(isBefore(history(), screen.getByTestId('step-navigation'))).toBe(true)
        await openHistory()
        const [row] = within(history()).getAllByTestId('code-run-history-row')
        await userEvent.click(within(row).getByRole('button', { name: /^Code run / }))
        expect(await within(row).findByText('Feedback on the earlier run.')).toBeVisible()
        expect(within(row).getByText('Code files v1')).toBeVisible()
    })

    it('is absent when the latest run is the only one', async () => {
        const { org, study, raw } = await setupFeedbackOnly()
        await renderScreen(study, raw, org.slug)

        expect(screen.queryByTestId('code-run-history')).toBeNull()
    })

    it('offers a security key above the runs when an earlier run shared its outputs', async () => {
        const { org, study, raw } = await setupFeedbackOnly({
            priorRuns: () => [
                { ranAt: EARLIER_RUN_AT },
                { ranAt: daysBefore(EARLIER_RUN_AT, 10), decision: 'FILES-REJECTED' },
            ],
        })
        await renderScreen(study, raw, org.slug)
        await openHistory()

        const keyPanel = await within(history()).findByTestId('code-run-history-key')
        expect(within(keyPanel).getByRole('textbox', { name: 'Security key' })).toBeInTheDocument()
        expect(isBefore(keyPanel, within(history()).getAllByTestId('code-run-history-row')[0])).toBe(true)
    })

    it('offers no security key when every earlier run shared feedback only', async () => {
        const { org, study, raw } = await setupFeedbackOnly({
            priorRuns: () => [{ ranAt: EARLIER_RUN_AT, decision: 'FILES-REJECTED' }],
        })
        await renderScreen(study, raw, org.slug)
        await openHistory()

        expect(within(history()).queryByTestId('code-run-history-key')).toBeNull()
        expect(within(history()).queryByRole('textbox')).toBeNull()
    })

    it("does not carry one study's history state into another", async () => {
        const first = await setupFeedbackOnly({
            priorRuns: (authorId) => [{ ranAt: EARLIER_RUN_AT, feedback: { authorId, text: 'First study run.' } }],
        })
        const firstElement = await OutputsFeedbackScreen({
            study: first.study,
            raw: first.raw,
            ...screenNavProps('researcher', 'outputs-feedback', first.raw, {
                orgSlug: first.org.slug,
                studyId: first.study.id,
            }),
        })
        const second = await setupFeedbackOnly({
            priorRuns: (authorId) => [{ ranAt: EARLIER_RUN_AT, feedback: { authorId, text: 'Second study run.' } }],
        })
        const secondElement = await OutputsFeedbackScreen({
            study: second.study,
            raw: second.raw,
            ...screenNavProps('researcher', 'outputs-feedback', second.raw, {
                orgSlug: second.org.slug,
                studyId: second.study.id,
            }),
        })
        renderWithProviders(<StudySwitcher first={firstElement} second={secondElement} />)
        await waitForPendingMutations()
        await openHistory()
        fireEvent.change(within(history()).getByRole('textbox', { name: 'Security key' }), {
            target: { value: 'typed for the first study' },
        })

        fireEvent.click(screen.getByRole('button', { name: 'Open the second study' }))
        await waitForPendingMutations()

        expect(within(history()).getByRole('button', { name: 'View code run history' })).toBeInTheDocument()
        await openHistory()
        expect(within(history()).getByRole('textbox', { name: 'Security key' })).toHaveValue('')
        expect(screen.queryByText('First study run.')).toBeNull()
    })
})
