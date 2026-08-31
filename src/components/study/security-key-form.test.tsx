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
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { SecurityKeyForm } from './security-key-form'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// Encrypt one artifact the way TOA would (whole-zip + embedded manifest) and return the entry the
// mocked fetchEncryptedJobFilesAction serves. The reviewer is a manifest recipient (empty
// recipientKeys) — they decrypt with their own key.
async function seedArtifact(
    jobId: string,
    { fileType, files }: { fileType: FileType; files: { name: string; content: string }[] },
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    for (const f of files) await writer.addFile(f.name, toArrayBuffer(f.content))
    const zip = await writer.generate()

    // One row per artifact slot (job + path + type), which the unique index enforces, so a test
    // seeding its own content over the one beforeEach already made reuses that row rather than
    // adding a second. Mirrors storeJobFile, where a repeat delivery replaces the object behind the
    // row it already has.
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

    // The two roles are served different key sets, and a reviewer holds no re-wrapped per-file
    // keys. Asking as a researcher returns [] for them, which strands the outputs step on the
    // locked phase, so the role has to reach the action rather than being assumed by the hook.
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

    // A key is only proven by ciphertext it actually opened, so neither of the next two cases may
    // hand the caller a decrypted set (OTTER-675): with nothing to decrypt, the parse step accepts
    // any syntactically valid PEM.
    it('shows a no-files error when the fetch returns an empty list', async () => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])

        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey('some-key')
        clickView()

        expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('shows a no-files error when the fetch rejects', async () => {
        vi.mocked(fetchEncryptedJobFilesAction).mockRejectedValue(new Error('network error'))

        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey('some-key')
        clickView()

        expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('hands the decrypted files to the caller when the key is valid', async () => {
        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        await waitFor(() => expect(onDecrypted).toHaveBeenCalled())
        const files = onDecrypted.mock.calls[0][0]
        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('run.log')
        expect(screen.queryByText(INVALID_ERROR)).toBeNull()
        expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
    })

    // OTTER-688. On the researcher path the action filters to artifacts wrapped for THIS user's
    // fingerprint, so an empty result means they hold no key — not that the Data Partner withheld
    // anything. Offering a form no key of theirs can satisfy, and then blaming the DP in its error,
    // is what this replaces.
    describe('researcher with no wrapped key', () => {
        it('replaces the form with an explanation instead of a form to nowhere', async () => {
            vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])

            renderWithProviders(<SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />)

            expect(await screen.findByTestId('security-key-no-access')).toBeInTheDocument()
            expect(
                screen.getByRole('heading', { name: 'Your security key cannot open these outputs' }),
            ).toBeInTheDocument()
            expect(
                screen.getByText(
                    'These outputs were encrypted for a different security key. Ask an organization administrator to re-share them with your current key.',
                ),
            ).toBeInTheDocument()

            // No form, and nothing that could imply the outputs themselves are missing.
            expect(screen.queryByTestId('security-key-form')).toBeNull()
            expect(screen.queryByRole('textbox')).toBeNull()
            expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
            expect(screen.queryByText(NO_FILES_ERROR)).toBeNull()
        })

        it('still renders the form when the researcher does hold a key', async () => {
            renderWithProviders(<SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })
            expect(screen.getByTestId('security-key-form')).toBeInTheDocument()
            expect(screen.queryByTestId('security-key-no-access')).toBeNull()
        })

        // A failed fetch also yields no files, but the cause is an outage, not the user's key. The
        // gate reads isSuccess so it cannot blame the key for it; the pre-existing error path stands.
        it('does not claim a missing key when the fetch itself failed', async () => {
            vi.mocked(fetchEncryptedJobFilesAction).mockRejectedValue(new Error('network error'))

            renderWithProviders(<SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })
            expect(screen.queryByTestId('security-key-no-access')).toBeNull()

            enterKey('some-key')
            clickView()
            expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
        })

        // Role-awareness is load-bearing: the action's reviewer branch returns every encrypted
        // artifact without consulting fingerprints, so an empty result there means the JOB produced
        // nothing — a reviewer-side state OTTER-524 handles by letting them close out the round.
        // This gate must not intercept it.
        it('leaves the reviewer path untouched on an empty result', async () => {
            vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])

            renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })
            expect(screen.getByTestId('security-key-form')).toBeInTheDocument()
            expect(screen.queryByTestId('security-key-no-access')).toBeNull()
        })
    })
})
