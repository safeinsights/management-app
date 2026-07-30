import { vi } from 'vitest'
import dayjs from 'dayjs'
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
import { ReviewerOutputsAvailableScreen } from './reviewer-outputs-available-screen'
import type { ScreenComponentProps } from './types'

// The screen embeds SecurityKeyForm, whose file query hits job-file storage; serve no artifacts so
// the static render under test stays hermetic (same approach as security-key-form.test.tsx).
vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

const renderScreen = async (study: ScreenComponentProps['study'], orgSlug: string) =>
    renderWithProviders(await ReviewerOutputsAvailableScreen({ study, orgSlug }))

const setupWithJobStatus = async (jobStatus: StudyJobStatus) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study }
}

describe('ReviewerOutputsAvailableScreen', () => {
    it('renders the outputs-available banner with the date the run completed', async () => {
        const { org, study } = await setupWithJobStatus('RUN-COMPLETE')
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        // The RUN-COMPLETE status row was just inserted, so the surfaced date is today.
        expect(screen.getByTestId('status-alert')).toHaveTextContent(
            `Outputs are available for review • ${dayjs().format('MMM DD, YYYY')}`,
        )
    })

    it('addresses the banner body to the submitting lab', async () => {
        const { org, study } = await setupWithJobStatus('RUN-COMPLETE')
        await renderScreen(study, org.slug)

        expect(screen.getByTestId('status-alert')).toHaveTextContent(
            `Enter your security key to decrypt the outputs, review them, and then share with ${study.submittingLabName}.`,
        )
    })

    it('renders the reused security key form', async () => {
        const { org, study } = await setupWithJobStatus('RUN-COMPLETE')
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
    })

    it('wires Previous step to the read-only code page', async () => {
        const { org, study } = await setupWithJobStatus('RUN-COMPLETE')
        await renderScreen(study, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/review/code`,
        )
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    it('shows a not-found alert when the job has not completed a run', async () => {
        const { org, study } = await setupWithJobStatus('JOB-RUNNING')
        await renderScreen(study, org.slug)
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })
})
