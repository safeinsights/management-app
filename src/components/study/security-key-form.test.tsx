import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { type Org } from '@/schema/org'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { SecurityKeyForm } from './security-key-form'

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
    let userId: string
    let job: LatestJobForStudy
    let onDecrypted: Mock

    const insertJob = async () => {
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        return latestJobForStudy(study.id)
    }

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
        userId = resp.user.id
        job = await insertJob()
        onDecrypted = vi.fn()

        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'log output' }],
        })
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

    // Shared with this user, the archive opens only through the wraps in the researcher key set,
    // so the key set the form asked for decides whether the key opens it.
    describe('with outputs shared to this user', () => {
        beforeEach(async () => {
            job = await insertJob()
            await seedEncryptedArtifact(job.id, {
                fileType: 'ENCRYPTED-RESULT',
                files: [{ name: 'summary.csv', content: 'a,b\n1,2' }],
                sharedWith: userId,
            })
        })

        it('requests the researcher key set when acting as a researcher', async () => {
            renderWithProviders(<SecurityKeyForm job={job} type="researcher" onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })
            enterKey(await readTestSupportFile('private_key.pem'))
            clickView()

            await waitFor(() => expect(onDecrypted).toHaveBeenCalled())
        })

        it('requests the reviewer key set when acting as a reviewer', async () => {
            renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })
            enterKey(await readTestSupportFile('private_key.pem'))
            clickView()

            expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
            expect(onDecrypted).not.toHaveBeenCalled()
        })
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

    // With nothing to decrypt the parse step accepts any syntactically valid PEM, so neither case
    // may hand the caller a decrypted set. A researcher is only sent outputs wrapped for their key,
    // so their empty list means the key opens nothing.
    describe.each([
        { type: 'reviewer', emptyListError: NO_FILES_ERROR },
        { type: 'researcher', emptyListError: INVALID_ERROR },
    ] as const)('as a $type with no files', ({ type, emptyListError }) => {
        it('shows an error without decrypting when the fetch returns an empty list', async () => {
            const emptyJob = await insertJob()
            renderWithProviders(<SecurityKeyForm job={emptyJob} type={type} onDecrypted={onDecrypted} />)

            await screen.findByRole('button', { name: 'View' })

            enterKey('some-key')
            clickView()

            expect(await screen.findByText(emptyListError)).toBeInTheDocument()
            expect(onDecrypted).not.toHaveBeenCalled()
        })

        it('shows a no-files error when the fetch rejects', async () => {
            // Another enclave's session may not view this job, so the fetch is refused.
            await mockSessionWithTestData()
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
        await seedEncryptedArtifact(job.id, { fileType: 'ENCRYPTED-CODE-RUN-LOG', files: [] })

        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        expect(await screen.findByText(INVALID_ERROR)).toBeInTheDocument()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('blames the archive, not the key, when a file has been dropped from it', async () => {
        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'log output' }],
            tamperWith: { drop: ['run.log'] },
        })

        renderWithProviders(<SecurityKeyForm job={job} type="reviewer" onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View' })

        enterKey(await readTestSupportFile('private_key.pem'))
        clickView()

        expect(await screen.findByText(INTEGRITY_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(INVALID_ERROR)).toBeNull()
        expect(onDecrypted).not.toHaveBeenCalled()
    })
})
