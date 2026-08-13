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
import { type FileType } from '@/database/types'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { ReDecryptOutputs } from './re-decrypt-outputs'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

vi.mock('@/server/actions/study-job-file-activity.actions', () => ({
    fetchJobFileActivityAction: vi.fn(() => []),
    recordJobFileActivityAction: vi.fn(() => ({})),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

async function seedArtifact(
    jobId: string,
    { fileType, files }: { fileType: FileType; files: { name: string; content: string }[] },
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    for (const f of files) await writer.addFile(f.name, toArrayBuffer(f.content))
    const zip = await writer.generate()

    const path = `test-org/${jobId}/results/encrypted-results/encrypted-results.zip`
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

describe('ReDecryptOutputs', () => {
    let org: Org
    let job: NonNullable<LatestJobForStudy>

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        job = (await latestJobForStudy(study.id))!

        const { fetchEncryptedJobFilesAction } = await import('@/server/actions/study-job.actions')
        const artifact = await seedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'summary.csv', content: 'a,b\n1,2' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])
    })

    it('renders the View outputs again security-key copy (OTTER-677 overrides)', async () => {
        renderWithProviders(<ReDecryptOutputs job={job} />)

        await screen.findByRole('button', { name: 'View' })

        expect(screen.getByRole('heading', { name: /view outputs again/i })).toBeInTheDocument()
        expect(
            screen.getByText('The outputs are encrypted. Enter your security key to view them again.'),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).not.toBeInTheDocument()
    })

    it('replaces the form with the output files table after a successful decrypt', async () => {
        const privateKeyPem = await readTestSupportFile('private_key.pem')
        renderWithProviders(<ReDecryptOutputs job={job} />)

        await screen.findByRole('button', { name: 'View' })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: privateKeyPem } })
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument()
        })
        expect(screen.queryByRole('heading', { name: /view outputs again/i })).not.toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
        expect(screen.getByText('summary.csv')).toBeInTheDocument()
    })
})
