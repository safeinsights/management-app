import { ResultsWriter } from 'si-encryption/job-results/writer'
import { actionResult } from '@/lib/utils'
import { fetchResultsRecipientKeysAction } from '@/server/actions/study-job.actions'
import type { JobFileInfo, jobFileSchema } from '@/lib/types'
import type { z } from 'zod'

type ReEncryptedJobFile = z.infer<typeof jobFileSchema>

// Re-encrypt approved (already-decrypted) files for the study's reviewers + researchers,
// entirely client-side. The DO browser holds the plaintext from review; it wraps each
// file for every recipient via ResultsWriter so the server only ever stores ciphertext.
// Returned entries are jobFileSchema-shaped (contents = the re-encrypted zip bytes).
export async function reEncryptApprovedFiles(studyId: string, files: JobFileInfo[]): Promise<ReEncryptedJobFile[]> {
    const recipients = actionResult(await fetchResultsRecipientKeysAction({ studyId }))

    return Promise.all(
        files.map(async (file) => {
            const writer = new ResultsWriter(recipients)
            await writer.addFile(file.path, file.contents)
            const zip = await writer.generate()
            return {
                path: file.path,
                contents: await zip.arrayBuffer(),
                sourceId: file.sourceId,
                fileType: file.fileType,
            }
        }),
    )
}
