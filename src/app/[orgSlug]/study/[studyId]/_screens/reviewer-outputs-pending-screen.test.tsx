import {
    actionResult,
    db,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import type { StudyJobStatus } from '@/database/types'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { Routes } from '@/lib/routes'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { ReviewerOutputsPendingScreen } from './reviewer-outputs-pending-screen'
import { screenNavProps } from './render-screen'
import type { ScreenComponentProps } from './types'

const requireRawState = async (studyId: string) => {
    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) throw new Error('raw study state missing')
    return raw
}

const renderScreen = async (study: ScreenComponentProps['study'], orgSlug: string) => {
    const raw = await requireRawState(study.id)
    const ctx = { orgSlug, studyId: study.id, dashboardHref: Routes.dashboard }
    return renderWithProviders(
        await ReviewerOutputsPendingScreen({
            study,
            ...screenNavProps('reviewer', 'reviewer-outputs-pending', raw, ctx),
        }),
    )
}

const setupApproved = async (jobStatuses: StudyJobStatus[]) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
    const job = await db.selectFrom('studyJob').select('id').where('studyId', '=', dbStudy.id).executeTakeFirstOrThrow()
    const base = Date.now()
    for (const [i, status] of jobStatuses.entries()) {
        await db
            .insertInto('jobStatusChange')
            .values({ status, studyJobId: job.id, createdAt: new Date(base + (i + 1) * 1000) })
            .execute()
    }
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study }
}

describe('ReviewerOutputsPendingScreen', () => {
    it('wires Previous to the read-only code page and Back to my studies to the personal dashboard', async () => {
        const { org, study } = await setupApproved(['CODE-APPROVED', 'JOB-READY'])
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        const previous = screen.getByRole('link', { name: /previous step/i })
        expect(previous).toHaveAttribute('href', `/${org.slug}/study/${study.id}/review/code`)
        expect(previous).toHaveAttribute('data-variant', 'subtle')
        const exit = screen.getByRole('link', { name: /back to my studies/i })
        expect(exit).toHaveAttribute('href', Routes.dashboard)
        expect(exit).toHaveAttribute('data-variant', 'filled')
    })

    // Approval routes here before the containerizer reports a stage (OTTER-673), so the approval
    // itself is the stage.
    it('reports the approval as the stage when the enclave has not started yet', async () => {
        const { org, study } = await setupApproved(['CODE-APPROVED'])
        await renderScreen(study, org.slug)

        expect(screen.getByTestId('status-alert')).toHaveTextContent(/code approved .* ago/)
        expect(screen.getByRole('link', { name: /back to my studies/i })).toBeInTheDocument()
    })

    it('resolves JOB-READY to the queued alert', async () => {
        const { org, study } = await setupApproved(['CODE-APPROVED', 'JOB-READY'])
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(/code queued .* ago/)
    })

    it('resolves JOB-RUNNING to the running alert', async () => {
        const { org, study } = await setupApproved(['CODE-APPROVED', 'JOB-RUNNING'])
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(/code started running .* ago/)
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })
})
