import {
    actionResult,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
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
) => renderWithProviders(await OutputsPendingScreen({ study, orgSlug, dashboardHref, returnTo }))

const setupExecuting = async (jobStatus: StudyJobStatus) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study, job }
}

describe('OutputsPendingScreen', () => {
    it('renders STEP 4 "Verify outputs" heading with the study title', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 4')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Verify outputs')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent(study.title!)
    })

    it('wires Previous to the code step page and Back to the researcher dashboard', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug)

        const previous = screen.getByRole('link', { name: /previous step/i })
        expect(previous).toHaveAttribute('href', `/${org.slug}/study/${study.id}/view/code`)
        expect(previous).toHaveAttribute('data-variant', 'subtle')

        const back = screen.getByRole('link', { name: /back to my studies/i })
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

    it('uses CODE-APPROVED timestamp when present', async () => {
        const approvedDate = new Date('2026-06-15T12:00:00Z')
        const { org, study, job } = await setupExecuting('JOB-READY')
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'CODE-APPROVED', createdAt: approvedDate })
            .execute()
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(dayjs(approvedDate).format('MMM DD, YYYY'))
    })

    it('falls back to stage startedAt when CODE-APPROVED is missing', async () => {
        const { org, study, job } = await setupExecuting('JOB-READY')
        const statusChange = await db
            .selectFrom('jobStatusChange')
            .select('createdAt')
            .where('studyJobId', '=', job.id)
            .where('status', '=', 'JOB-READY')
            .executeTakeFirstOrThrow()
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(
            dayjs(statusChange.createdAt).format('MMM DD, YYYY'),
        )
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })
})
