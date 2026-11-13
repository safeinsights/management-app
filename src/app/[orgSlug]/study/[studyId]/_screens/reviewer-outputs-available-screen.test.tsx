import { describe, expect, it, type Mock } from 'vitest'
import { useParams } from 'next/navigation'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import dayjs from 'dayjs'
import { OUTPUTS_FEEDBACK_MAX_CHARACTERS } from '@/lib/outputs-review'
import {
    actionResult,
    createTestQueryClient,
    fireEvent,
    insertTestJobStatuses,
    insertTestLaterJob,
    insertTestJobStatus,
    insertTestStudyJobData,
    mockSessionWithTestData,
    QueryClientProvider,
    readTestSupportFile,
    render,
    renderWithProviders,
    requireRawState,
    screen,
    type PriorCodeRunOptions,
    type ScreenInputs,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { theme } from '@/theme'
import type { StudyJobStatus } from '@/database/types'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { getStudyAction } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { screenNavProps } from './render-screen'
import { ReviewerOutputsAvailableScreen } from './reviewer-outputs-available-screen'

const setupAvailable = async (jobStatus: StudyJobStatus = 'RUN-COMPLETE', priorRuns: PriorCodeRunOptions[] = []) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus, priorRuns })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const job = await latestJobForStudy(dbStudy.id)
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study, job, raw }
}

const renderScreen = async ({ study, raw }: ScreenInputs, orgSlug: string) =>
    renderWithProviders(
        await ReviewerOutputsAvailableScreen({
            study,
            raw,
            orgSlug,
            ...screenNavProps('reviewer', 'reviewer-outputs-available', raw, {
                orgSlug,
                studyId: study.id,
            }),
        }),
    )

// Single-user editing so the feedback editor renders synchronously instead of a collaborative
// skeleton.
const renderScreenSingleUser = async ({ study, raw }: ScreenInputs, orgSlug: string) =>
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <MantineProvider theme={theme}>
                <YjsWebsocketProvider singleUserEditing>
                    <ModalsProvider>
                        {await ReviewerOutputsAvailableScreen({
                            study,
                            raw,
                            orgSlug,
                            ...screenNavProps('reviewer', 'reviewer-outputs-available', raw, {
                                orgSlug,
                                studyId: study.id,
                            }),
                        })}
                    </ModalsProvider>
                </YjsWebsocketProvider>
            </MantineProvider>
        </QueryClientProvider>,
    )

const unlock = async () => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: await readTestSupportFile('private_key.pem') } })
    fireEvent.click(screen.getByRole('button', { name: 'View files' }))
}

const textIncludes = (needle: string) => (_: string, element: Element | null) =>
    !!element && element.children.length === 0 && (element.textContent ?? '').includes(needle)

describe('ReviewerOutputsAvailableScreen before decryption', () => {
    it('renders the shared page and section headers', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)

        expect(
            screen.getByRole('heading', { level: 1, name: `${study.title} — Step 3: Review outputs` }),
        ).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Step 3')
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

        expect(screen.getByRole('heading', { name: /^code run /i })).toBeInTheDocument()
        expect(
            screen.getByText(
                'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.',
            ),
        ).toBeInTheDocument()
        expect(await screen.findByRole('button', { name: 'View files' })).toBeInTheDocument()
        expect(screen.queryByTestId('code-run-outputs')).toBeNull()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
        expect(screen.queryByTestId('outputs-submit-decision')).toBeNull()
    })

    // The empty-artifact refusal is covered by security-key-form.test.tsx, the same form this
    // screen embeds.
    it('keeps the outputs hidden when the key is wrong', async () => {
        const { org, study, job, raw } = await setupAvailable()
        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'results.csv', content: 'a,b\n1,2' }],
        })
        await renderScreen({ study, raw }, org.slug)
        await screen.findByRole('button', { name: 'View files' })

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-a-real-key' } })
        fireEvent.click(screen.getByRole('button', { name: 'View files' }))

        expect(await screen.findByText(textIncludes('Invalid key. Check that you copied'))).toBeInTheDocument()
        expect(screen.queryByTestId('code-run-outputs')).toBeNull()
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
        await insertTestJobStatus(job.id, 'FILES-APPROVED')
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })
})

describe('ReviewerOutputsAvailableScreen after decryption', () => {
    const setupDecrypted = async (
        files: { name: string; content: string }[],
        doRender: typeof renderScreen = renderScreen,
    ) => {
        const { org, study, job, raw } = await setupAvailable()
        await seedEncryptedArtifact(job.id, { fileType: 'ENCRYPTED-RESULT', files: files })
        await doRender({ study, raw }, org.slug)
        await screen.findByRole('button', { name: 'View files' })
        await unlock()
        await waitFor(() => expect(latestRunOutputs()).toBeInTheDocument())
        // A DB query still in flight at test end races the per-test transaction rollback and
        // poisons every later test, so wait for the activity query to settle.
        await waitFor(() => expect(screen.getAllByText('No activity yet').length).toBeGreaterThan(0))
        return { org, study, job }
    }

    it('swaps the key form for the outputs table, decision section and submit button', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])

        expect(screen.queryByRole('heading', { name: /security key/i })).toBeNull()
        expect(latestRunOutputs()).toBeInTheDocument()
        expect(screen.getByTestId('outputs-decision-section')).toBeInTheDocument()
        expect(screen.getByTestId('outputs-submit-decision')).toBeInTheDocument()
    })

    // OTTER-1062: the run's card keeps its header once the key form gives way to the outputs.
    it('keeps the Code run header above the decrypted outputs', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])

        const card = screen.getByTestId('code-run-card')
        expect(within(card).getByRole('heading', { name: /^code run /i })).toBeInTheDocument()
        expect(within(card).getByTestId('code-run-outputs')).toHaveTextContent('Output files')
    })

    it('puts Submit decision in the Decision card and leaves only Previous step in the navigation', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])

        const decision = screen.getByTestId('outputs-decision-section')
        expect(within(decision).getByTestId('outputs-submit-decision')).toHaveTextContent('Submit decision')
        const nav = screen.getByTestId('step-navigation')
        expect(within(nav).queryByTestId('outputs-submit-decision')).toBeNull()
        expect(within(nav).getByRole('link', { name: /Previous step/ })).toBeInTheDocument()
    })

    it('replaces the available banner with the review-before-sharing warning', async () => {
        const { study } = await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }])
        const labName = study.submittingLabName

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
        const labName = study.submittingLabName

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

describe('ReviewerOutputsAvailableScreen code run history', () => {
    it('is absent when the latest run is the only one', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)
        await within(screen.getByTestId('security-key-form')).findByRole('button', { name: 'View files' })

        expect(screen.queryByTestId('code-run-history')).toBeNull()
    })

    it('sits below the key card, then stays open below the Decision card once the outputs are decrypted', async () => {
        const { org, study, job, raw } = await setupAvailable('RUN-COMPLETE', [
            { ranAt: dayjs().subtract(3, 'day').toDate() },
            { ranAt: dayjs().subtract(6, 'day').toDate(), outcome: 'JOB-ERRORED', decision: 'FILES-REJECTED' },
        ])
        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'results.csv', content: 'a,b\n1,2' }],
        })
        await renderScreen({ study, raw }, org.slug)
        await within(screen.getByTestId('security-key-form')).findByRole('button', { name: 'View files' })

        const history = screen.getByTestId('code-run-history')
        expect(within(history).getByRole('heading', { name: 'Code run history (2)' })).toBeInTheDocument()
        expect(isBefore(screen.getByTestId('security-key-form'), history)).toBe(true)
        fireEvent.click(within(history).getByRole('button', { name: 'View code run history' }))

        await unlock()
        await waitFor(() => expect(latestRunOutputs()).toBeInTheDocument())
        await waitFor(() => expect(screen.getAllByText('No activity yet').length).toBeGreaterThan(0))

        // The table takes the focus the key form held, and one polite message covers every run.
        expect(within(latestRunOutputs()).getByText('Output files')).toHaveFocus()
        expect(await screen.findByText('Outputs decrypted.')).toBeInTheDocument()

        // The same node, still open: decrypting must not remount the history.
        expect(screen.getByTestId('code-run-history')).toBe(history)
        expect(within(history).getByRole('button', { name: 'Hide code run history' })).toBeInTheDocument()
        // OTTER-1062: Code run card, Decision card, history, then Previous step.
        expect(isBefore(screen.getByTestId('code-run-card'), screen.getByTestId('outputs-decision-section'))).toBe(true)
        expect(isBefore(screen.getByTestId('outputs-decision-section'), history)).toBe(true)
        expect(isBefore(history, screen.getByTestId('step-navigation'))).toBe(true)
    })
})

// History rows render their own outputs section, so look inside the latest run's card.
const latestRunOutputs = () => within(screen.getByTestId('code-run-card')).getByTestId('code-run-outputs')

const isBefore = (first: Element, second: Element) =>
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

// OTTER-882: the code run card shows the latest run alone. An earlier run's files, even one with the
// same name, belong to the code run history.
describe('ReviewerOutputsAvailableScreen with an earlier run', () => {
    it("lists only the latest run's files", async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study: dbStudy, job: earlierJob } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'RUN-COMPLETE',
        })
        await insertTestJobStatuses(earlierJob.id, ['FILES-REJECTED'])
        const latestJob = await insertTestLaterJob(dbStudy.id, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE'])
        await seedEncryptedArtifact(earlierJob.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [
                { name: 'earlier.csv', content: 'earlier' },
                { name: 'results.csv', content: 'earlier' },
            ],
        })
        await seedEncryptedArtifact(latestJob.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [
                { name: 'latest.csv', content: 'latest' },
                { name: 'results.csv', content: 'latest' },
            ],
        })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderScreen({ study, raw: await requireRawState(dbStudy.id) }, org.slug)
        await screen.findByRole('button', { name: 'View files' })
        await unlock()
        await waitFor(() => expect(latestRunOutputs()).toBeInTheDocument())
        await waitFor(() => expect(screen.getAllByText('No activity yet')).toHaveLength(2))

        expect(screen.getByRole('button', { name: 'latest.csv' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'results.csv' })).toHaveLength(1)
        expect(screen.queryByRole('button', { name: 'earlier.csv' })).toBeNull()
    })
})
