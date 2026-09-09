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
import type { Route } from 'next'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
import { db } from '@/database'
import type { StudyJobStatus } from '@/database/types'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { OutputsPendingScreen } from './outputs-pending-screen'
import type { ScreenComponentProps } from './types'

const DASHBOARD_HREF: Route = '/dashboard'

const renderScreen = async (
    study: ScreenComponentProps['study'],
    orgSlug: string,
    dashboardHref = DASHBOARD_HREF,
    returnTo?: 'org',
) =>
    renderWithProviders(
        await OutputsPendingScreen({ study, raw: await requireRawState(study.id), orgSlug, dashboardHref, returnTo }),
    )

// Every execution stage follows a CODE-APPROVED row in practice, and the banner is dated from it.
const setupExecuting = async (jobStatus: StudyJobStatus, { approved = true }: { approved?: boolean } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    if (approved) {
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'CODE-APPROVED' }).execute()
    }
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study, job }
}

describe('OutputsPendingScreen', () => {
    it('renders STEP 4 "Verify outputs" without the study title', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 4')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Verify outputs')
        expect(screen.getByTestId('proposal-section-header')).not.toHaveTextContent(study.title!)
    })

    it('wires Previous to the code step page and Back to the researcher dashboard', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug)

        expect(screen.getByTestId('step-navigation')).toBeInTheDocument()
        const previous = screen.getByTestId('cta-previous-step')
        expect(previous).toHaveAttribute('href', `/${org.slug}/study/${study.id}/view/code`)
        expect(previous).toHaveAttribute('data-variant', 'subtle')

        const back = screen.getByTestId('cta-back-to-my-studies')
        expect(back).toHaveAttribute('href', DASHBOARD_HREF)
        expect(back).toHaveAttribute('data-variant', 'filled')
    })

    it('passes returnTo through to the Previous step link', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug, `/dashboard`, 'org')

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code?returnTo=org`,
        )
    })

    it.each(['JOB-READY', 'JOB-RUNNING', 'JOB-PACKAGING', 'JOB-PROVISIONING'] as const)(
        'shows the same processing banner regardless of stage (%s)',
        async (jobStatus) => {
            const { org, study } = await setupExecuting(jobStatus)
            await renderScreen(study, org.slug)
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent(/Outputs not ready, code processing started/)
            expect(alert).toHaveTextContent(/\w{3} \d{2}, \d{4}/)
            expect(alert).toHaveTextContent(/Your code is running in the secure enclave/)
        },
    )

    it('dates the banner from the CODE-APPROVED row', async () => {
        const approvedDate = new Date('2026-06-15T12:00:00Z')
        const { org, study, job } = await setupExecuting('JOB-READY', { approved: false })
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'CODE-APPROVED', createdAt: approvedDate })
            .execute()
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(dayjs(approvedDate).format('MMM DD, YYYY'))
    })

    it('renders an undated banner when the job carries no CODE-APPROVED row', async () => {
        const { org, study } = await setupExecuting('JOB-READY', { approved: false })
        await renderScreen(study, org.slug)
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Outputs not ready, code processing started')
        expect(alert).not.toHaveTextContent('•')
    })

    // A packaging failure awaiting the reviewer's files decision routes here too. The error stays
    // undisclosed (OTTER-598), but the copy must not claim the code is still running.
    it('says the run is awaiting review, not still running, for an undecided JOB-ERRORED', async () => {
        const { org, study, job } = await setupExecuting('CODE-SUBMITTED')
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'JOB-ERRORED' }).execute()
        await renderScreen(study, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Outputs not ready, awaiting review')
        expect(alert).toHaveTextContent(/with the data partner for review/)
        expect(alert).not.toHaveTextContent(/running in the secure enclave/)
        expect(alert).not.toHaveTextContent(/error|fail/i)
    })

    // Routed from CODE-APPROVED onward (OTTER-673), so it must render before the enclave reports a stage.
    it('renders the processing banner dated from CODE-APPROVED when no execution stage exists yet', async () => {
        const approvedDate = new Date('2026-06-15T12:00:00Z')
        const { org, study, job } = await setupExecuting('CODE-SUBMITTED', { approved: false })
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'CODE-APPROVED', createdAt: approvedDate })
            .execute()
        await renderScreen(study, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(/code processing started/i)
        expect(alert).toHaveTextContent(dayjs(approvedDate).format('MMM DD, YYYY'))
        expect(screen.getByTestId('cta-back-to-my-studies')).toBeInTheDocument()
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })
})
