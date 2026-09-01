import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useParams } from 'next/navigation'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import dayjs from 'dayjs'
import { OUTPUTS_FEEDBACK_MAX_CHARACTERS } from '@/lib/outputs-review'
import {
    actionResult,
    createTestQueryClient,
    db,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    QueryClientProvider,
    readTestSupportFile,
    render,
    renderWithProviders,
    requireRawState,
    screen,
    type ScreenInputs,
    waitFor,
} from '@/tests/unit.helpers'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { theme } from '@/theme'
import type { StudyJobStatus } from '@/database/types'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { getStudyAction } from '@/server/actions/study.actions'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { ReviewerOutputsAvailableScreen } from './reviewer-outputs-available-screen'

vi.mock('@/server/actions/study-job.actions', async () => {
    const actual = await vi.importActual<typeof import('@/server/actions/study-job.actions')>(
        '@/server/actions/study-job.actions',
    )
    return { ...actual, fetchEncryptedJobFilesAction: vi.fn(async () => []) }
})

const setupAvailable = async (jobStatus: StudyJobStatus = 'RUN-COMPLETE') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const job = await latestJobForStudy(dbStudy.id)
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study, job, raw }
}

const renderScreen = async ({ study, raw }: ScreenInputs, orgSlug: string) =>
    renderWithProviders(await ReviewerOutputsAvailableScreen({ study, raw, orgSlug }))

// Single-user editing so the feedback editor renders synchronously instead of a collaborative
// skeleton.
const renderScreenSingleUser = async ({ study, raw }: ScreenInputs, orgSlug: string) =>
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <MantineProvider theme={theme}>
                <YjsWebsocketProvider singleUserEditing>
                    <ModalsProvider>{await ReviewerOutputsAvailableScreen({ study, raw, orgSlug })}</ModalsProvider>
                </YjsWebsocketProvider>
            </MantineProvider>
        </QueryClientProvider>,
    )

const unlock = async () => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: await readTestSupportFile('private_key.pem') } })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
}

const textIncludes = (needle: string) => (_: string, element: Element | null) =>
    !!element && element.children.length === 0 && (element.textContent ?? '').includes(needle)

describe('ReviewerOutputsAvailableScreen before decryption', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    it('renders the shared page and section headers', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 3')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Review outputs')
    })

    it('shows the outputs-available banner with the run-complete date, addressed to the lab', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Outputs are available for review • ${dayjs().format('MMM DD, YYYY')}`)
        expect(alert).toHaveTextContent(
            `Enter your security key to decrypt the outputs, review them, and then share with ${study.submittingLabName}.`,
        )
    })

    it('asks for the security key and hides the review view until a key validates', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
        expect(screen.queryByTestId('outputs-submit-decision')).toBeNull()
    })

    // The empty-artifact refusal is covered by security-key-form.test.tsx, the same form this
    // screen embeds.
    it('keeps the outputs hidden when the key is wrong', async () => {
        const { org, study, job, raw } = await setupAvailable()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedEncryptedArtifact(job.id, {
                fileType: 'ENCRYPTED-RESULT',
                files: [{ name: 'results.csv', content: 'a,b\n1,2' }],
            }),
        ])
        await renderScreen({ study, raw }, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-a-real-key' } })
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        expect(await screen.findByText(textIncludes('Invalid key. Check that you copied'))).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
    })

    it('links Previous step to the read-only code page for this study', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/review/code`,
        )
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave', createJob: false })
        const raw = await requireRawState(study.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen({ study, raw }, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    it('shows a not-found alert when the job has not completed a run', async () => {
        const { org, study, raw } = await setupAvailable('JOB-RUNNING')
        await renderScreen({ study, raw }, org.slug)
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })

    it('shows a not-found alert when the run already has a files decision', async () => {
        const { org, study, job } = await setupAvailable()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })
})

describe('ReviewerOutputsAvailableScreen after decryption', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    const setupDecrypted = async (
        files: { name: string; content: string }[],
        doRender: typeof renderScreen = renderScreen,
    ) => {
        const { org, study, job, raw } = await setupAvailable()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedEncryptedArtifact(job.id, { fileType: 'ENCRYPTED-RESULT', files: files }),
        ])
        await doRender({ study, raw }, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())
        await unlock()
        await waitFor(() => expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument())
        // A DB query still in flight at test end races the per-test transaction rollback and
        // poisons every later test, so wait for the activity query to settle.
        await waitFor(() => expect(screen.getAllByText('No activity yet').length).toBeGreaterThan(0))
        return { org, study, job }
    }

    it('swaps the key form for the outputs table, decision section and submit button', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])

        expect(screen.queryByRole('heading', { name: /security key/i })).toBeNull()
        expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument()
        expect(screen.getByTestId('outputs-decision-section')).toBeInTheDocument()
        expect(screen.getByTestId('outputs-submit-decision')).toBeInTheDocument()
    })

    it('replaces the available banner with the review-before-sharing warning', async () => {
        const { study } = await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])
        const labName = study.submittingLabName ?? study.submittedByOrgSlug

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Review the outputs before sharing')
        expect(alert).not.toHaveTextContent('Outputs are available for review')
        expect(alert).toHaveTextContent(
            `As the reviewer, you are responsible for checking the outputs for sensitive or restricted information* before they are shared with ${labName}.`,
        )
        expect(alert).toHaveTextContent(
            '*Sensitive data could cause harm if disclosed, such as personally identifiable information (PII). Restricted data is limited by a data use agreement or policy.',
        )
        expect(alert).toHaveAttribute('data-variant', 'action')
    })

    it('associates the footnote with the asterisked sentence via aria-describedby', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])

        const described = screen
            .getByTestId('status-alert')
            .querySelector('[aria-describedby="outputs-sensitive-data-footnote"]')
        expect(described).not.toBeNull()
        expect(document.getElementById('outputs-sensitive-data-footnote')).toHaveTextContent(
            /Sensitive data could cause harm if disclosed/,
        )
    })

    it('lists every decrypted result file with an empty activity state', async () => {
        await setupDecrypted([
            { name: 'results.csv', content: 'a,b\n1,2' },
            { name: 'summary.txt', content: 'all good' },
        ])

        expect(screen.getByRole('button', { name: 'results.csv' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'summary.txt' })).toBeInTheDocument()
        await waitFor(() => expect(screen.getAllByText('No activity yet')).toHaveLength(2))
    })

    it('keeps Submit decision enabled on arrival', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])

        expect(screen.getByTestId('outputs-submit-decision')).toBeEnabled()
    })

    it('flags both empty fields and opens no modal on a blank submit', async () => {
        const { study } = await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])
        const labName = study.submittingLabName ?? study.submittedByOrgSlug

        fireEvent.click(screen.getByTestId('outputs-submit-decision'))

        expect(await screen.findByText(textIncludes(`Enter your feedback for ${labName}`))).toBeInTheDocument()
        expect(screen.getByText('Select an option before submitting')).toBeInTheDocument()
        expect(screen.queryByText('Submit your decision?')).toBeNull()
    })

    // OTTER-737: one cap for both run outcomes.
    it('caps feedback at 1800 characters', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }], renderScreenSingleUser)

        await waitFor(() =>
            expect(screen.getByText(textIncludes(`0/${OUTPUTS_FEEDBACK_MAX_CHARACTERS}`))).toBeInTheDocument(),
        )
    })
})
