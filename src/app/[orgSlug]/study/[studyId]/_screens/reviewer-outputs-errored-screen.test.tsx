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
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import type { FileType, StudyJobStatus } from '@/database/types'
import { getStudyAction } from '@/server/actions/study.actions'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ReviewerOutputsErroredScreen } from './reviewer-outputs-errored-screen'
import type { ScreenComponentProps } from './types'

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
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, study, job }
}

const renderScreen = async (study: ScreenComponentProps['study'], orgSlug: string) =>
    renderWithProviders(await ReviewerOutputsErroredScreen({ study, orgSlug }))

const unlock = async () => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: await readTestSupportFile('private_key.pem') } })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
}

describe('ReviewerOutputsErroredScreen before decryption', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    it('renders the shared page and section headers', async () => {
        const { org, study } = await setupErrored()
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 3')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Review outputs')
    })

    it('asks for the security key rather than showing the review view', async () => {
        const { org, study } = await setupErrored()
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.getByTestId('status-alert')).toHaveTextContent('Code errored')
    })

    // The two-part gate: JOB-ERRORED alone must not surface the outputs. Only a validated key
    // does, which is why this screen is a client phase flip and not a route.
    it('hides the outputs table, decision section and submit until a key validates', async () => {
        const { org, study } = await setupErrored()
        await renderScreen(study, org.slug)

        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
        expect(screen.queryByTestId('outputs-decision-section')).toBeNull()
        expect(screen.queryByTestId('outputs-submit-decision')).toBeNull()
    })

    it('keeps the outputs hidden when the key is wrong', async () => {
        const { org, study, job } = await setupErrored()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedArtifact(job.id, [{ name: 'run.log', content: 'boom' }], 'ENCRYPTED-CODE-RUN-LOG'),
        ])
        await renderScreen(study, org.slug)
        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-a-real-key' } })
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        expect(
            await screen.findByText('Invalid key. Check that you copied the full key and enter it again.'),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).toBeNull()
    })

    it('links Previous step to the read-only code page for this study', async () => {
        const { org, study } = await setupErrored()
        await renderScreen(study, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/review/code`,
        )
    })

    it('reports a missing error status rather than rendering the screen', async () => {
        const { org, study } = await setupErrored('JOB-RUNNING')
        await renderScreen(study, org.slug)

        expect(screen.getByText('No error found')).toBeInTheDocument()
    })
})

describe('ReviewerOutputsErroredScreen after decryption', () => {
    beforeEach(() => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
    })

    const setupDecrypted = async (files: { name: string; content: string }[]) => {
        const { org, study, job } = await setupErrored()
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedArtifact(job.id, files, 'ENCRYPTED-CODE-RUN-LOG'),
        ])
        await renderScreen(study, org.slug)
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
        expect(screen.getAllByText('No activity yet')).toHaveLength(2)
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
