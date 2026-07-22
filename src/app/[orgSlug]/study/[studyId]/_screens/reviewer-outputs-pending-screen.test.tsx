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
import { useParams } from 'next/navigation'
import type { StudyJobStatus } from '@/database/types'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { ReviewerOutputsPendingScreen } from './reviewer-outputs-pending-screen'
import type { ScreenComponentProps } from './types'

const renderScreen = async (study: ScreenComponentProps['study'], orgSlug: string) =>
    renderWithProviders(await ReviewerOutputsPendingScreen({ study, orgSlug }))

const setupExecuting = async (jobStatus: StudyJobStatus) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study }
}

describe('ReviewerOutputsPendingScreen', () => {
    it('wires Previous to the read-only code page and Back to the org dashboard', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/review/code`,
        )
        expect(screen.getByRole('link', { name: /back to my studies/i })).toHaveAttribute(
            'href',
            `/${org.slug}/dashboard`,
        )
    })

    it('resolves JOB-READY to the queued alert', async () => {
        const { org, study } = await setupExecuting('JOB-READY')
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(/code queued .* ago/)
    })

    it('resolves JOB-RUNNING to the processing alert', async () => {
        const { org, study } = await setupExecuting('JOB-RUNNING')
        await renderScreen(study, org.slug)
        expect(screen.getByTestId('status-alert')).toHaveTextContent(/code processing started .* ago/)
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })
})
