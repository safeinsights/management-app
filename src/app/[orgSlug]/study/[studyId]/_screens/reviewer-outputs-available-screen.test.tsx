import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useParams } from 'next/navigation'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import dayjs from 'dayjs'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
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
import type { FileType, StudyJobStatus } from '@/database/types'
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

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// Encrypt an artifact the way the enclave would (whole-zip + embedded manifest) so the reviewer's
// real key decrypts it — the phase flip is driven by genuine decryption, not a stubbed callback.
// Results use ENCRYPTED-RESULT (not the errored screen's log type): this suite is also the proof
// that a completed run's artifacts flow through the same panel.
async function seedArtifact(jobId: string, files: { name: string; content: string }[]) {
    const fileType: FileType = 'ENCRYPTED-RESULT'
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    for (const file of files) await writer.addFile(file.name, toArrayBuffer(file.content))
    const zip = await writer.generate()

    const row = await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: jobId,
            name: 'encrypted-results.zip',
            path: `test-org/${jobId}/results/encrypted-results.zip`,
            fileType,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        studyJobFileId: row.id,
        fileType,
        name: 'encrypted-results.zip',
        encryptedBody: await zip.arrayBuffer(),
        recipientKeys: {} as Record<string, string>,
    }
}

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

// Like renderWithProviders, but with single-user editing on so the feedback editor (and the
// word counter in its footer) renders synchronously instead of holding a collaborative skeleton.
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

// Matches on an element's full textContent, so text split across child nodes (or differing
// whitespace) can never produce a false negative the way an exact-string matcher can.
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

        // The RUN-COMPLETE status row was just inserted, so the surfaced date is today.
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Outputs are available for review • ${dayjs().format('MMM DD, YYYY')}`)
        expect(alert).toHaveTextContent(
            `Enter your security key to decrypt the outputs, review them, and then share with ${study.submittingLabName}.`,
        )
    })

    // The two-part gate: RUN-COMPLETE alone must not surface the outputs. Only a validated key
    // does, which is why this screen is a client phase flip and not a route.
    it('asks for the security key and hides the review view until a key validates', async () => {
        const { org, study, raw } = await setupAvailable()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
        expect(screen.queryByTestId('outputs-submit-decision')).toBeNull()
    })

    // The empty-artifact refusal (a well-formed key with nothing to decrypt must not unlock) is
    // owned by security-key-form.test.tsx — the same form instance this screen embeds. Screen-level
    // gating is proven here by the wrong-key path below, which anchors on a visible error.
    it('keeps the outputs hidden when the key is wrong', async () => {
        const { org, study, job, raw } = await setupAvailable()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedArtifact(job.id, [{ name: 'results.csv', content: 'a,b\n1,2' }]),
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

    // This test and the next are defensive-only: reviewer-screen-rules (rule 1b) routes this
    // screen solely for a RUN-COMPLETE job with no files decision, so neither state can reach it
    // through the resolved flow. Rendering the component directly is what makes them reachable
    // here — they pin the guards, not a reviewer-visible state.
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

    // Pins the behavioral edge of the resultsDisplayStatus guard: a decided run (RUN-COMPLETE plus
    // a later FILES-APPROVED) routes to reviewer-study-results, so this screen must refuse it. The
    // old timestamp guard would have rendered the panel because a RUN-COMPLETE row still exists.
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
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([await seedArtifact(job.id, files)])
        await doRender({ study, raw }, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())
        await unlock()
        await waitFor(() => expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument())
        // Quiesce: the files table fires the last-activity query on mount. Waiting for its answer
        // here means no test ends with that DB query in flight — an in-flight query racing the
        // per-test transaction rollback closes the shared client and poisons every later test
        // (the deferred-callback race documented in tests/vitest.setup.ts, in query form).
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

    // The asterisk's meaning has to reach AT programmatically; visual proximity to the footnote
    // conveys nothing to a screen reader.
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
        // Waits for the activity query: the cell stays blank until the answer is in, so it never
        // claims "No activity yet" on the strength of an unresolved request.
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

    // OTTER-676: a completed run gets the 1500 cap, not the errored screen's 300. Rendered in
    // single-user mode so the editor footer (where the counter lives) exists synchronously.
    it('caps feedback at 1500 for a completed run', async () => {
        await setupDecrypted([{ name: 'results.csv', content: 'a,b\n1,2' }], renderScreenSingleUser)

        await waitFor(() => expect(screen.getByText(textIncludes('0/1500'))).toBeInTheDocument())
    })
})
