import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
    db,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { type FileType } from '@/database/types'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { tamper } from 'si-encryption/testing/archive'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { SecurityKeyForm } from './security-key-form'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// Encrypts one artifact the way TOA would. The reviewer is a manifest recipient, so
// recipientKeys is empty and they decrypt with their own key.
async function seedArtifact(
    jobId: string,
    { fileType, files }: { fileType: FileType; files: { name: string; content: string }[] },
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }], { jobId })
    for (const f of files) await writer.addFile(f.name, toArrayBuffer(f.content))
    const zip = await writer.generate()

    // A unique index allows one row per artifact slot, so re-seeding replaces the row rather
    // than adding a second, mirroring storeJobFile.
    const path = `test-org/${jobId}/results/encrypted-logs/encrypted-results.zip`
    const inserted = await db
        .insertInto('studyJobFile')
        .values({ studyJobId: jobId, name: 'encrypted-results.zip', path, fileType })
        .onConflict((oc) => oc.doNothing())
        .returning('id')
        .executeTakeFirst()

    const row =
        inserted ??
        (await db
            .selectFrom('studyJobFile')
            .select('id')
            .where('studyJobId', '=', jobId)
            .where('path', '=', path)
            .where('fileType', '=', fileType)
            .executeTakeFirstOrThrow())

    return {
        studyJobFileId: row.id,
        fileType,
        name: 'encrypted-results.zip',
        encryptedBody: await zip.arrayBuffer(),
        recipientKeys: {} as Record<string, string>,
    }
}

const EMPTY_ERROR = 'Enter your security key to decrypt the outputs.'
const INVALID_ERROR = 'Invalid key. Check that you copied the full key and enter it again.'
const NO_FILES_ERROR = 'No encrypted outputs available to decrypt.'
const INTEGRITY_ERROR = 'These results failed verification and may have been altered. Contact your administrator.'

const enterKey = (value: string) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } })
}

const clickView = () => {
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
}

const blurInput = () => {
    screen.getByRole('textbox').blur()
}

describe('SecurityKeyForm', () => {
    let org: Org
    let job: LatestJobForStudy
    let onDecrypted: Mock

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        job = await latestJobForStudy(study.id)
        onDecrypted = vi.fn()

        const artifact = await seedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'log output' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])
    })

    it('renders the key-entry section with a required indicator and body copy', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.getByLabelText('required')).toHaveTextContent('*')
        expect(
            screen.getByText('This key is required to access the outputs. It was issued to you during sign-up.'),
        ).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off')
        expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /lost your key/i })).toBeInTheDocument()
    })

    // the post-decision page reuses this form with different header/body copy.
    it('renders caller-supplied title and description overrides', async () => {
        renderWithProviders(
            <SecurityKeyForm
                job={job}
                type="reviewer"
                onDecrypted={onDecrypted}
                title="View outputs again"
                description="The outputs are encrypted. Enter your security key to view them again."
            />,
        )

        await screen.findByRole('button', { name: 'View' })

        expect(screen.getByRole('heading', { name: /view outputs again/i })).toBeInTheDocument()
        expect(
            screen.getByText('The outputs are encrypted. Enter your security key to view them again.'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: /security key/i })).not.toBeInTheDocument()
    })

    // A reviewer holds no re-wrapped per-file keys, so asking as a researcher returns [] and
    // strands the outputs step on the locked phase.
    it.each(['reviewer', 'researcher'] as const)('requests the %s key set when acting as one', async (type) => {
        renderWithProviders(<SecurityKeyForm job={job} type={type} onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        expect(fetchEncryptedJobFilesAction).toHaveBeenCalledWith({ jobId: job.id, type })
    })

    it('focuses the input on mount', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        expect(screen.getByRole('textbox')).toHaveFocus()
    })

    it('shows the empty-field error and focuses the input when submitted blank', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        blurInput()
        clickView()

        expect(await screen.findByText(EMPTY_ERROR)).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveFocus()
    })

    it('shows the invalid-key error, re-enables controls, and returns focus to the input', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey('not-a-real-key')
        blurInput()
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeEnabled()
        expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
        await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('disables the button and input on submit to prevent double submission', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey('not-a-real-key')
        clickView()

        expect(screen.getByRole('button', { name: /decrypting/i })).toBeDisabled()
        expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('replaces the empty-field error with the invalid-key error on retry', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        clickView()
        expect(await screen.findByText(EMPTY_ERROR)).toBeInTheDocument()

        enterKey('not-a-real-key')
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(EMPTY_ERROR)).toBeNull()
    })

    // With nothing to decrypt the parse step accepts any syntactically valid PEM, so neither
    // case may hand the caller a decrypted set (OTTER-675). Same for both roles: an empty
    // answer is not a bad key
    describe.each(['reviewer', 'researcher'] as const)('as a %s with no files', (type) => {
        it('shows a no-files error when the fetch returns an empty list', async () => {
            vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])

            renderWithProviders(<SecurityKeyForm job={job} type={type} onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })

            enterKey('some-key')
            clickView()

            expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
            expect(onDecrypted).not.toHaveBeenCalled()
        })

        it('shows a no-files error when the fetch rejects', async () => {
            vi.mocked(fetchEncryptedJobFilesAction).mockRejectedValue(new Error('network error'))

            renderWithProviders(<SecurityKeyForm job={job} type={type} onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })

            enterKey('some-key')
            clickView()

            expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
            expect(onDecrypted).not.toHaveBeenCalled()
        })
    })

    it('hands the decrypted files to the caller when the key is valid', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        await waitFor(() => expect(onDecrypted).toHaveBeenCalled())
        const files = onDecrypted.mock.calls[0][0]
        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('run.log')
        expect(screen.queryByText(INVALID_ERROR)).toBeNull()
        expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
    })

    // A well-formed key the archive was not encrypted for is a wrong key, not a tampered archive.
    it('reports a key that is not a recipient as invalid', async () => {
        const { privateKeyString } = await generateKeyPair()
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey(privateKeyString)
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(INTEGRITY_ERROR)).toBeNull()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    // OTTER-675: an archive holding no files decrypts "successfully" with any syntactically valid
    // PEM, so accepting it would present an unopened job as reviewed.
    it('rejects a key that opened nothing rather than reporting an empty review', async () => {
        const artifact = await seedArtifact(job.id, { fileType: 'ENCRYPTED-CODE-RUN-LOG', files: [] })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])

        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('blames the archive, not the key, when a file has been dropped from it', async () => {
        const artifact = await seedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'log output' }],
        })
        const altered = await tamper(new Blob([artifact.encryptedBody]), { drop: ['run.log'] })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            { ...artifact, encryptedBody: await altered.arrayBuffer() },
        ])

        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        expect(await screen.findByText(INTEGRITY_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(INVALID_ERROR)).toBeNull()
        expect(onDecrypted).not.toHaveBeenCalled()
    })
})
