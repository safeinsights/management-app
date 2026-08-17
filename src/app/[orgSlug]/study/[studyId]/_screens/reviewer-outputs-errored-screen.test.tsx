import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useParams } from 'next/navigation'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import {
    actionResult,
    db,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    requireRawState,
    screen,
    type ScreenInputs,
    waitFor,
} from '@/tests/unit.helpers'
import type { FileType, StudyJobStatus } from '@/database/types'
import { getStudyAction } from '@/server/actions/study.actions'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ReviewerOutputsAvailableScreen } from './reviewer-outputs-available-screen'
import { ReviewerOutputsErroredScreen } from './reviewer-outputs-errored-screen'

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
// real key decrypts it, so the phase flip is driven by genuine decryption rather than a stub.
async function seedArtifact(jobId: string, files: { name: string; content: string }[], fileType: FileType) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    for (const file of files) await writer.addFile(file.name, toArrayBuffer(file.content))
    const zip = await writer.generate()

    const row = await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: jobId,
            name: 'encrypted-logs.zip',
            path: `test-org/${jobId}/results/encrypted-logs.zip`,
            fileType,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        studyJobFileId: row.id,
        fileType,
        name: 'encrypted-logs.zip',
        encryptedBody: await zip.arrayBuffer(),
        recipientKeys: {} as Record<string, string>,
    }
}

const setupErrored = async (jobStatus: StudyJobStatus = 'JOB-ERRORED') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const job = await latestJobForStudy(dbStudy.id)
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study, job, raw }
}

const renderScreen = async ({ study, raw }: ScreenInputs, orgSlug: string) =>
    renderWithProviders(await ReviewerOutputsErroredScreen({ study, raw, orgSlug }))

const unlock = async () => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: await readTestSupportFile('private_key.pem') } })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
}

// A job that carries an encrypted artifact, so the key gate applies. insertTestStudyJobData creates
// no studyJobFile rows, so without this the job is the OTTER-524 zero-artifact case instead.
const setupWithArtifact = async () => {
    const ctx = await setupErrored()
    vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
        await seedArtifact(ctx.job.id, [{ name: 'run.log', content: 'boom' }], 'ENCRYPTED-CODE-RUN-LOG'),
    ])
    // The screen reads job.files to decide whether a key is needed, so re-read it after seeding.
    return { ...ctx, job: await latestJobForStudy(ctx.study.id) }
}

describe('ReviewerOutputsErroredScreen before decryption', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    it('renders the shared page and section headers', async () => {
        const { org, study, raw } = await setupErrored()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 3')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Review outputs')
    })

    it('asks for the security key rather than showing the review view', async () => {
        const { org, study, raw } = await setupWithArtifact()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.getByTestId('status-alert')).toHaveTextContent('Code errored')
    })

    // The two-part gate: JOB-ERRORED alone must not surface the outputs. Only a validated key
    // does, which is why this screen is a client phase flip and not a route.
    it('hides the outputs table, decision section and submit until a key validates', async () => {
        const { org, study, raw } = await setupWithArtifact()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
        expect(screen.queryByTestId('outputs-submit-decision')).toBeNull()
    })

    it('keeps the outputs hidden when the key is wrong', async () => {
        const { org, study, job, raw } = await setupErrored()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedArtifact(job.id, [{ name: 'run.log', content: 'boom' }], 'ENCRYPTED-CODE-RUN-LOG'),
        ])
        await renderScreen({ study, raw }, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-a-real-key' } })
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        expect(
            await screen.findByText('Invalid key. Check that you copied the full key and enter it again.'),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
    })

    // The job HAS an artifact but the action hands back nothing, which is what happens when this
    // reviewer has no registered public key or the fetch failed. A well-formed key must not unlock
    // the review view against nothing (OTTER-675), and it must not fall through to the
    // no-artifacts path either: that would let a keyless reviewer decide on outputs they never saw.
    it('does not unlock the review view when the artifacts cannot be fetched', async () => {
        const { org, study, job, raw } = await setupErrored()
        await seedArtifact(job.id, [{ name: 'run.log', content: 'boom' }], 'ENCRYPTED-CODE-RUN-LOG')
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
        await renderScreen({ study, raw }, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        await unlock()

        expect(await screen.findByText('No encrypted outputs available to decrypt.')).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
    })

    it('links Previous step to the read-only code page for this study', async () => {
        const { org, study, raw } = await setupWithArtifact()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/review/code`,
        )
    })

    it('reports a missing error status rather than rendering the screen', async () => {
        const { org, study, raw } = await setupErrored('JOB-RUNNING')
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByText('No error found')).toBeInTheDocument()
    })

    // Pins the behavioral edge of the awaitingFilesDecisionOnError guard: a decided errored run
    // (JOB-ERRORED plus FILES-APPROVED) routes to reviewer-outputs-decided, so this screen must
    // refuse it. The old timestamp guard would have rendered the panel because a JOB-ERRORED row
    // still exists.
    it('shows a not-found alert when the errored run already has a files decision', async () => {
        const { org, study, job } = await setupErrored()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByText('No error found')).toBeInTheDocument()
    })
})

// OTTER-524. Two independent problems live here. The banner used to promise error logs whatever the
// job actually held, and a run that produced no artifact at all left the reviewer at a key form with
// nothing to open and no way to record a decision, which in turn stranded the researcher on
// "code is running" forever.
describe('ReviewerOutputsErroredScreen with no error log', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    const addStatus = async (jobId: string, status: StudyJobStatus) => {
        await db.insertInto('jobStatusChange').values({ studyJobId: jobId, status }).execute()
    }

    // A file row with no encrypted counterpart, which is what the containerizer stores on its own
    // when the org has no key holders for encryptAndStoreLog to encrypt to.
    const seedPlaintextFile = async (jobId: string, fileType: FileType, name: string) => {
        await db
            .insertInto('studyJobFile')
            .values({ studyJobId: jobId, name, path: `test-org/${jobId}/results/${name}`, fileType })
            .execute()
    }

    // The reported case: the source scan succeeded so a security scan log exists, but packaging
    // failed and produced nothing. The old copy told the reviewer to go and read error logs.
    //
    // Asserts the banner AND the gate together. Fixing only the copy left the key form rendering
    // under a banner that no longer mentioned it, and left "share outputs" enabled on a run whose
    // only artifact is a submission-time scan log.
    it('offers neither a key form nor sharing when the only artifact is a security scan log', async () => {
        const { org, study, job } = await setupErrored()
        await seedArtifact(job.id, [{ name: 'security-scan-log.txt', content: 'clean' }], 'ENCRYPTED-SECURITY-SCAN-LOG')
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('There is no error log for this run.')
        expect(alert).not.toHaveTextContent('see what went wrong')
        expect(alert).not.toHaveTextContent('security key')
        expect(screen.queryByRole('heading', { name: /security key/i })).toBeNull()
        const [shareOutputs] = screen.getAllByRole('radio')
        expect(shareOutputs).toBeDisabled()
    })

    // An error log that exists but that no key can open. Denying it exists would be false; telling
    // the reviewer to enter a key would point at a form this screen does not render.
    it('neither denies nor promises a key for a plaintext-only error log', async () => {
        const { org, study, job } = await setupErrored()
        await seedPlaintextFile(job.id, 'PACKAGING-ERROR-LOG', 'packaging-error-log.txt')
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('An error log was recorded for this run, but it cannot be displayed here.')
        expect(alert).not.toHaveTextContent('security key')
        expect(screen.queryByRole('heading', { name: /security key/i })).toBeNull()
    })

    // A run that errored after producing results. No error log to read, but the results still have to
    // be decrypted and reviewed, so the key gate stays (OTTER-675) and the banner has to say so.
    it('still requires a key for an errored run that produced results', async () => {
        const { org, study, job } = await setupErrored()
        await seedArtifact(job.id, [{ name: 'results.csv', content: 'a,b\n1,2' }], 'ENCRYPTED-RESULT')
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('There is no error log for this run.')
        expect(alert).toHaveTextContent('Enter your security key below')
        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
    })

    it('names packaging as the failed stage when the job never reached JOB-READY', async () => {
        const { org, study, job } = await setupErrored()
        await addStatus(job.id, 'JOB-PACKAGING')
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByTestId('status-alert')).toHaveTextContent('The code environment image could not be prepared')
    })

    it('says the code ran when the job reached JOB-RUNNING', async () => {
        const { org, study, job } = await setupErrored()
        await addStatus(job.id, 'JOB-RUNNING')
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByTestId('status-alert')).toHaveTextContent('The code ran in the secure enclave')
    })

    // OTTER-524: a classified failure class replaces the derived stage sentence, in our own wording.
    it('explains a recorded failure class in place of the stage sentence', async () => {
        const { org, study, job } = await setupErrored()
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'JOB-ERRORED', message: 'BASE_IMAGE_UNAVAILABLE' })
            .execute()
        const raw = await requireRawState(study.id)
        await renderScreen({ study, raw }, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('could not be found or could not be accessed')
        expect(alert).toHaveTextContent('Code Environments page')
    })

    // The guard that keeps AWS detail off this screen whichever service wrote the row. The enclave
    // writes a raw thrown error into this same column, so it must never reach the reviewer.
    it('never renders raw service text recorded against the status', async () => {
        const { org, study, job } = await setupErrored()
        const raw = 'Command "aws s3 sync s3://si-secret-bucket/studies/x/code" exited with code 1'
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'JOB-ERRORED', message: raw })
            .execute()
        const rawState = await requireRawState(study.id)
        await renderScreen({ study, raw: rawState }, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).not.toHaveTextContent('s3://')
        expect(alert).not.toHaveTextContent('si-secret-bucket')
        expect(alert).toHaveTextContent('The code environment image could not be prepared')
    })

    it('asks for no key when the run produced nothing to decrypt', async () => {
        const { org, study, raw } = await setupErrored()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.queryByRole('heading', { name: /security key/i })).toBeNull()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
    })

    // The escape hatch. Without it the round can never be closed and the researcher is never told.
    it('lets the reviewer record a decision without a key', async () => {
        const { org, study, raw } = await setupErrored()
        await renderScreen({ study, raw }, org.slug)

        expect(screen.getByTestId('outputs-decision-section')).toBeInTheDocument()
        expect(screen.getByTestId('outputs-submit-decision')).toBeEnabled()
    })

    it('offers only share-feedback-only, with sharing disabled and explained', async () => {
        const { org, study, raw } = await setupErrored()
        await renderScreen({ study, raw }, org.slug)

        // Both options stay rendered so the reviewer can see why only one is selectable; the radios
        // are read by role because Mantine puts the test id on the wrapper, not the input.
        const [shareOutputs, feedbackOnly] = screen.getAllByRole('radio')
        expect(shareOutputs).toBeDisabled()
        expect(feedbackOnly).toBeEnabled()
        expect(screen.getByTestId('outputs-decision-section')).toHaveTextContent(
            'There are no output files for this run, so there is nothing to share.',
        )
    })

    // The bypass is opt-in per screen. A completed run with no artifacts means delivery went wrong,
    // not that there is nothing to review, so the outputs-available screen must keep its key gate.
    // Pinned here because both screens share OutputsReviewPanel.
    it('does not leak the bypass into the outputs-available screen', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'RUN-COMPLETE',
        })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await ReviewerOutputsAvailableScreen({ study, raw, orgSlug: org.slug }))

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
    })

    it('keeps the decision unselected on arrival so closing the round stays deliberate', async () => {
        const { org, study, raw } = await setupErrored()
        await renderScreen({ study, raw }, org.slug)

        for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
    })
})

describe('ReviewerOutputsErroredScreen after decryption', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    const setupDecrypted = async (files: { name: string; content: string }[]) => {
        const { org, study, job, raw } = await setupErrored()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedArtifact(job.id, files, 'ENCRYPTED-CODE-RUN-LOG'),
        ])
        await renderScreen({ study, raw }, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())
        await unlock()
        await waitFor(() => expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument())
        return { org, study, job }
    }

    it('swaps the key form for the outputs table and decision section', async () => {
        await setupDecrypted([{ name: 'run.log', content: 'boom' }])

        expect(screen.queryByRole('heading', { name: /security key/i })).toBeNull()
        expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument()
        expect(screen.getByTestId('outputs-decision-section')).toBeInTheDocument()
        expect(screen.getByTestId('outputs-submit-decision')).toBeInTheDocument()
    })

    it('replaces the errored banner with the review-before-sharing warning', async () => {
        const { study } = await setupDecrypted([{ name: 'run.log', content: 'boom' }])
        const labName = study.submittingLabName ?? study.submittedByOrgSlug

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Review the outputs before sharing')
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
        await setupDecrypted([{ name: 'run.log', content: 'boom' }])

        const described = screen
            .getByTestId('status-alert')
            .querySelector('[aria-describedby="outputs-sensitive-data-footnote"]')
        expect(described).not.toBeNull()
        expect(document.getElementById('outputs-sensitive-data-footnote')).toHaveTextContent(
            /Sensitive data could cause harm if disclosed/,
        )
    })

    it('lists every decrypted file with an empty activity state', async () => {
        await setupDecrypted([
            { name: 'run.log', content: 'boom' },
            { name: 'results.csv', content: 'a,b\n1,2' },
        ])

        expect(screen.getByRole('button', { name: 'run.log' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'results.csv' })).toBeInTheDocument()
        // Waits for the activity query: the cell stays blank until the answer is in, so it never
        // claims "No activity yet" on the strength of an unresolved request.
        await waitFor(() => expect(screen.getAllByText('No activity yet')).toHaveLength(2))
    })

    it('offers Download all once two files are present', async () => {
        await setupDecrypted([
            { name: 'run.log', content: 'boom' },
            { name: 'results.csv', content: 'a,b\n1,2' },
        ])

        expect(screen.getByRole('button', { name: 'Download all' })).toBeInTheDocument()
    })

    it('omits Download all for a single file', async () => {
        await setupDecrypted([{ name: 'run.log', content: 'boom' }])

        expect(screen.queryByRole('button', { name: 'Download all' })).toBeNull()
    })

    it('keeps Submit decision enabled on arrival', async () => {
        await setupDecrypted([{ name: 'run.log', content: 'boom' }])

        expect(screen.getByTestId('outputs-submit-decision')).toBeEnabled()
    })

    it('flags both empty fields and opens no modal on a blank submit', async () => {
        const { study } = await setupDecrypted([{ name: 'run.log', content: 'boom' }])
        const labName = study.submittingLabName ?? study.submittedByOrgSlug

        fireEvent.click(screen.getByTestId('outputs-submit-decision'))

        expect(await screen.findByText(`Enter your feedback for ${labName} before submitting.`)).toBeInTheDocument()
        expect(screen.getByText('Select an option before submitting')).toBeInTheDocument()
        expect(screen.queryByText('Submit your decision?')).toBeNull()
    })

    it('records a view against the file when its name is clicked', async () => {
        const { job } = await setupDecrypted([{ name: 'run.log', content: 'boom' }])

        fireEvent.click(screen.getByRole('button', { name: 'run.log' }))

        await waitFor(async () => {
            const rows = await db
                .selectFrom('studyJobFileActivity')
                .innerJoin('studyJobFile', 'studyJobFile.id', 'studyJobFileActivity.studyJobFileId')
                .where('studyJobFile.studyJobId', '=', job.id)
                .selectAll('studyJobFileActivity')
                .execute()
            expect(rows).toHaveLength(1)
            expect(rows[0].action).toBe('VIEWED')
            expect(rows[0].filePath).toBe('run.log')
        })
    })
})
