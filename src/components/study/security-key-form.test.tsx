import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const SUCCESS_MESSAGE = 'Security key accepted.'

const enterKey = (value: string) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } })
}

const clickView = () => {
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
}

describe('SecurityKeyForm', () => {
    let org: Org
    let job: LatestJobForStudy

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        job = await latestJobForStudy(study.id)

        const artifact = await seedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'log output' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])
    })

    it('renders the key-entry section with a required indicator and body copy', async () => {
        renderWithProviders(<SecurityKeyForm job={job} />)

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

    it('shows the empty-field error and focuses the input when submitted blank', async () => {
        renderWithProviders(<SecurityKeyForm job={job} />)

        await screen.findByRole('button', { name: 'View' })

        clickView()

        expect(await screen.findByText(EMPTY_ERROR)).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveFocus()
    })

    it('shows the invalid-key error and re-enables both input and button for correction', async () => {
        renderWithProviders(<SecurityKeyForm job={job} />)

        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        enterKey('not-a-real-key')
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeEnabled()
        expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
    })

    it('disables the button and input on submit to prevent double submission', async () => {
        renderWithProviders(<SecurityKeyForm job={job} />)

        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        enterKey('not-a-real-key')
        clickView()

        expect(screen.getByRole('button', { name: /decrypting/i })).toBeDisabled()
        expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('replaces the empty-field error with the invalid-key error on retry', async () => {
        renderWithProviders(<SecurityKeyForm job={job} />)

        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())
        await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument())

        clickView()
        expect(await screen.findByText(EMPTY_ERROR)).toBeInTheDocument()

        enterKey('not-a-real-key')
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(EMPTY_ERROR)).toBeNull()
    })

    it('shows a no-files error when the fetch returns an empty list', async () => {
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])

        renderWithProviders(<SecurityKeyForm job={job} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey('some-key')
        clickView()

        expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(SUCCESS_MESSAGE)).toBeNull()
    })

    it('shows a no-files error when the fetch rejects', async () => {
        vi.mocked(fetchEncryptedJobFilesAction).mockRejectedValue(new Error('network error'))

        renderWithProviders(<SecurityKeyForm job={job} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey('some-key')
        clickView()

        expect(await screen.findByText(NO_FILES_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(SUCCESS_MESSAGE)).toBeNull()
    })

    it('shows a success message when the key decrypts the outputs', async () => {
        const artifact = await seedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'job started\nsomething went wrong' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])

        renderWithProviders(<SecurityKeyForm job={job} />)

        await waitFor(() => expect(vi.mocked(fetchEncryptedJobFilesAction)).toHaveBeenCalled())

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        expect(await screen.findByText(SUCCESS_MESSAGE)).toBeInTheDocument()
        expect(screen.queryByText(INVALID_ERROR)).toBeNull()
        expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
    })
})
