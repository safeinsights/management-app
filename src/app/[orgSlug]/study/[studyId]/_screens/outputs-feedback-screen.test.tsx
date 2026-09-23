import {
    actionResult,
    describe,
    expect,
    faker,
    insertTestOrg,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    requireRawState,
    screen,
    userEvent,
    vi,
    waitForPendingMutations,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
import { db } from '@/database'
import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
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

const DATA_PARTNER = 'Riverside University'
const DASHBOARD_HREF = '/dashboard'

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
const renderScreen = async (
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
    returnTo?: 'org',
) => {
    const rendered = renderWithProviders(
        await OutputsFeedbackScreen({
            study,
            raw,
            ...screenNavProps('researcher', 'outputs-feedback', raw, {
                orgSlug,
                studyId: study.id,
                dashboardHref: DASHBOARD_HREF,
                returnTo,
            }),
        }),
    )
    await waitForPendingMutations()
    return rendered
}

const setupFeedbackOnly = async ({ withNote = false }: { withNote?: boolean } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })

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
    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'FILES-REJECTED', userId: user.id, createdAt: DECIDED_AT })
        .execute()
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
        await db
            .updateTable('studyJob')
            .set({ resubmissionNote: JSON.parse(lexicalJson('Adjusted the aggregation query.')), resubmissionRound: 1 })
            .where('id', '=', job.id)
            .execute()
    }

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, job }
}

// Errored run + "Share feedback only" (OTTER-697).
const setupErroredFeedbackOnly = async ({ withNote = false }: { withNote?: boolean } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })
    const dataPartner = await givenDataPartner(dbStudy.id)

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
    return { org, user, study, raw, job, dataPartner, commentId: comment.id }
}

// Two outputs decisions across two jobs, with a code resubmission note between them: the shape the
// card reported, where the code round had climbed to 2 before the first outputs decision was made.
const setupTwoOutputsRounds = async () => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job: firstJob } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })

    await db
        .insertInto('jobStatusChange')
        .values([
            { studyJobId: firstJob.id, status: 'CODE-CHANGES-REQUESTED', userId: user.id },
            { studyJobId: firstJob.id, status: 'CODE-SUBMITTED', userId: user.id },
            { studyJobId: firstJob.id, status: 'CODE-APPROVED', userId: user.id, createdAt: APPROVED_AT },
            { studyJobId: firstJob.id, status: 'RUN-COMPLETE' },
            { studyJobId: firstJob.id, status: 'FILES-REJECTED', userId: user.id, createdAt: FIRST_DECIDED_AT },
        ])
        .execute()
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
    const secondJob = await db
        .insertInto('studyJob')
        .values({
            studyId: dbStudy.id,
            resubmissionNote: JSON.parse(lexicalJson('Aggregated the counts as asked.')),
            resubmissionRound: 3,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values([
            { studyJobId: secondJob.id, status: 'CODE-SUBMITTED', userId: user.id, createdAt: SUBMITTED_AT },
            { studyJobId: secondJob.id, status: 'CODE-APPROVED', userId: user.id },
            { studyJobId: secondJob.id, status: 'RUN-COMPLETE' },
            { studyJobId: secondJob.id, status: 'FILES-REJECTED', userId: user.id, createdAt: DECIDED_AT },
        ])
        .execute()
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

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('STEP 4')
        expect(header).toHaveTextContent('Verify outputs')
        expect(header).not.toHaveTextContent(study.title!)
    })

    describe('clean run banner (OTTER-695)', () => {
        it('renders the action alert with feedback-available copy, data partner name, and decision date', async () => {
            const { org, study, raw } = await setupFeedbackOnly()
            await renderScreen(study, raw, org.slug)

            const copy = copyFor(false, displayOrgName(org.name))
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', copy.variant)
            expect(alert).toHaveTextContent(`${copy.title} • ${dayjs(DECIDED_AT).format('MMM DD, YYYY')}`)
            expect(alert).toHaveTextContent(copy.body)
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
                jobStatus: 'CODE-SUBMITTED',
            })
            await givenDataPartner(dbStudy.id)
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: job.id, status: 'CODE-APPROVED', userId: user.id })
                .execute()
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'JOB-ERRORED' }).execute()
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: job.id, status: 'FILES-REJECTED', userId: user.id, createdAt: DECIDED_AT })
                .execute()
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
            expect(alert).toHaveTextContent(copyFor(false, DATA_PARTNER).body)
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
            expect(alert).toHaveTextContent(copy.body)
            expect(alert).not.toHaveTextContent(displayOrgName(org.name))
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

    describe('feedback and notes (clean run)', () => {
        // OTTER-766: the note belongs to the code step, so it stays on the code screens.
        it("renders this study's outputs feedback and no resubmission note", async () => {
            const { org, user, study, raw } = await setupFeedbackOnly({ withNote: true })
            await renderScreen(study, raw, org.slug)

            const section = screen.getByTestId('feedback-and-notes-section')
            expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
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

    describe('feedback and notes (errored run)', () => {
        it("renders this study's outputs feedback and no resubmission note", async () => {
            const { org, user, study, raw } = await setupErroredFeedbackOnly({ withNote: true })
            await renderScreen(study, raw, org.slug)

            const section = screen.getByTestId('feedback-and-notes-section')
            expect(section).toHaveTextContent('Feedback and notes')
            expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
            expect(section).toHaveTextContent('The run timed out before the aggregation completed.')
            expect(section).not.toHaveTextContent('Resubmission note')
            expect(section).not.toHaveTextContent('Raised the timeout to 60s.')
            expect(section).toHaveTextContent(user.fullName)
            expect(section).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
            expect(screen.queryAllByTestId('entry-divider')).toHaveLength(0)
        })
    })

    // The card's own replication: two code rounds and two outputs rounds on one study.
    describe('feedback and notes across two outputs rounds (OTTER-766)', () => {
        it('numbers the outputs feedback v1.0 and v2.0, ignoring the code rounds', async () => {
            const { org, study, raw } = await setupTwoOutputsRounds()
            await renderScreen(study, raw, org.slug)

            const section = screen.getByTestId('feedback-and-notes-section')
            expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
            expect(section).toHaveTextContent('First round: remove the row-level output.')
            expect(section).toHaveTextContent('Reviewer feedback (v2.0)')
            expect(section).toHaveTextContent('Second round: the totals still disclose a cell count.')
            expect(section).not.toHaveTextContent('Resubmission note')
            expect(section).not.toHaveTextContent('Aggregated the counts as asked.')
            expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
        })

        it('expands the latest entry and lets the prior round toggle open', async () => {
            const { org, study, raw, firstCommentId, secondCommentId } = await setupTwoOutputsRounds()
            const spy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                await renderScreen(study, raw, org.slug)

                expect(screen.getByTestId(`feedback-toggle-${secondCommentId}`)).toHaveAttribute(
                    'aria-expanded',
                    'true',
                )
                const prior = screen.getByTestId(`feedback-toggle-${firstCommentId}`)
                expect(prior).toHaveAttribute('aria-expanded', 'false')
                await userEvent.click(prior)
                expect(prior).toHaveAttribute('aria-expanded', 'true')
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

        it('passes returnTo through to the Previous step link', async () => {
            const { org, study, raw } = await setupFeedbackOnly()
            await renderScreen(study, raw, org.slug, 'org')

            expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
                'href',
                Routes.studyViewCode({ orgSlug: org.slug, studyId: study.id, returnTo: 'org' }),
            )
        })
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
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-REJECTED' }).execute()
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
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
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
