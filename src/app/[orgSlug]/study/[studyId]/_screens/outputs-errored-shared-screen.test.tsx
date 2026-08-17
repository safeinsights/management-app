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
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
import { db } from '@/database'
import { lexicalJson } from '@/lib/lexical'
import { displayOrgName } from '@/lib/string'
import type { RawStudyState } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { OutputsErroredSharedScreen } from './outputs-errored-shared-screen'
import type { ScreenComponentProps } from './types'

const APPROVED_AT = new Date('2026-06-20T12:00:00Z')
const SUBMITTED_AT = new Date('2026-07-01T12:00:00Z')
const ERRORED_AT = new Date('2026-07-02T12:00:00Z')
const DECIDED_AT = new Date('2026-08-05T12:00:00Z')

const DASHBOARD_HREF = '/dashboard'

const BANNER_BODY = (dataPartner: string) =>
    `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`

const renderScreen = async (
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
    returnTo?: 'org',
) =>
    renderWithProviders(
        await OutputsErroredSharedScreen({ study, raw, orgSlug, dashboardHref: DASHBOARD_HREF, returnTo }),
    )

// Errored run + "Share outputs and feedback": JOB-ERRORED plus FILES-APPROVED and a RESULTS
// decision comment (OTTER-696).
const setupErroredShared = async ({ withNote = false }: { withNote?: boolean } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })

    // Pin timestamps: rows written in one test transaction tie on now(), which would make the
    // banner date and entry order non-deterministic.
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
        .values({ studyJobId: job.id, status: 'FILES-APPROVED', userId: user.id, createdAt: DECIDED_AT })
        .execute()
    await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'APPROVE',
            body: JSON.parse(lexicalJson('The run failed on the join; the logs are in the outputs.')),
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

describe('OutputsErroredSharedScreen', () => {
    it('renders the reused page header and STEP 4 "Verify outputs" section header with the study title', async () => {
        const { org, study, raw } = await setupErroredShared()
        await renderScreen(study, raw, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('STEP 4')
        expect(header).toHaveTextContent('Verify outputs')
        expect(header).toHaveTextContent(study.title!)
    })

    it('renders the reused action alert with the exact copy, data partner name, and decision date', async () => {
        const { org, study, raw } = await setupErroredShared()
        await renderScreen(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', 'action')
        expect(alert).toHaveTextContent(
            `Decrypt outputs to view code error • ${dayjs(DECIDED_AT).format('MMM DD, YYYY')}`,
        )
        expect(alert).toHaveTextContent(BANNER_BODY(displayOrgName(org.name)))
    })

    it('dates the banner from the FILES-APPROVED decision, not the error, code approval, or today', async () => {
        const { org, study, raw } = await setupErroredShared()
        await renderScreen(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(ERRORED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(APPROVED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(new Date()).format('MMM DD, YYYY'))
    })

    it('degrades to an undated banner when the payload job carries no FILES-APPROVED row', async () => {
        const { org, study, raw, job } = await setupErroredShared()
        // raw was captured before this delete, so routing still lands here; the payload lacks the date.
        await db
            .deleteFrom('jobStatusChange')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'FILES-APPROVED')
            .execute()
        await renderScreen(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Decrypt outputs to view code error')
        expect(alert).not.toHaveTextContent('•')
    })

    it("renders the reused feedback-and-notes section with this study's outputs feedback", async () => {
        const { org, user, study, raw } = await setupErroredShared({ withNote: true })
        await renderScreen(study, raw, org.slug)

        const section = screen.getByTestId('feedback-and-notes-section')
        expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
        expect(section).toHaveTextContent('The run failed on the join; the logs are in the outputs.')
        expect(section).toHaveTextContent('Resubmission note (v1.0)')
        expect(section).toHaveTextContent('Adjusted the aggregation query.')
        expect(section).toHaveTextContent(user.fullName)
        expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
    })

    it("shows only this study's feedback, not another study's", async () => {
        const { org, user, study, raw } = await setupErroredShared()
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
                decision: 'APPROVE',
                body: JSON.parse(lexicalJson('Feedback that belongs to the other study.')),
                round: 1,
            })
            .execute()

        await renderScreen(study, raw, org.slug)

        expect(screen.getByText('The run failed on the join; the logs are in the outputs.')).toBeInTheDocument()
        expect(screen.queryByText('Feedback that belongs to the other study.')).not.toBeInTheDocument()
    })

    it('does not surface code-review feedback in the outputs thread', async () => {
        const { org, user, study, raw, job } = await setupErroredShared()
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

    it('renders the security key gate and only the Previous step link before decryption', async () => {
        const { org, study, raw } = await setupErroredShared()
        await renderScreen(study, raw, org.slug)

        expect(await screen.findByTestId('security-key-form')).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).not.toBeInTheDocument()

        const previous = screen.getByRole('link', { name: /previous step/i })
        expect(previous).toHaveAttribute('href', `/${org.slug}/study/${study.id}/view/code`)
        expect(previous).toHaveAttribute('data-variant', 'subtle')
        expect(screen.queryByRole('link', { name: /edit code/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /back to my studies/i })).not.toBeInTheDocument()
    })

    it('passes returnTo through to the Previous step link', async () => {
        const { org, study, raw } = await setupErroredShared()
        await renderScreen(study, raw, org.slug, 'org')

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code?returnTo=org`,
        )
    })

    it('short-circuits on the routing guard for a study with no job (no shared outputs to show)', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        const raw = await requireRawState(study.id)
        await renderScreen(study, raw, org.slug)
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })

    it('shows the no-submission alert for a titleless draft even when its job carries the decision statuses', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
        const { study: dbStudy, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'JOB-ERRORED' }).execute()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderScreen(study, raw, org.slug)

        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    it('guards against rendering for an errored run still awaiting the reviewer files decision', async () => {
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

        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
    })

    it('guards against rendering for a clean approved run, which belongs to the results flow', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
        const { study: dbStudy, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderScreen(study, raw, org.slug)

        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })

    it('guards against rendering for an errored run decided feedback-only', async () => {
        const { org, study, job } = await setupErroredShared()
        await db
            .deleteFrom('jobStatusChange')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'FILES-APPROVED')
            .execute()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-REJECTED' }).execute()
        const feedbackOnlyRaw = await requireRawState(study.id)

        await renderScreen(study, feedbackOnlyRaw, org.slug)

        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })
})
