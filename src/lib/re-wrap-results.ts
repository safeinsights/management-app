import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { actionResult } from '@/lib/utils'
import { fetchLabPublicKeysAction } from '@/server/actions/study-job.actions'
import type { JobFileInfo, SharedFile } from '@/lib/types'

// Re-wraps rather than re-encrypts, and runs client-side, so the server only ever receives
// wrapped AES keys and never plaintext.
export async function buildSharedFiles(studyId: string, files: JobFileInfo[]): Promise<SharedFile[]> {
    const labKeys = actionResult(await fetchLabPublicKeysAction({ studyId }))

    return Promise.all(
        files.map(async (file) => {
            if (!file.rawAesKey) throw new Error(`missing raw AES key for file ${file.path}`)
            const rawAesKey = file.rawAesKey
            const keys = await Promise.all(
                labKeys.map(async (key) => ({
                    fingerprint: key.fingerprint,
                    crypt: await wrapAesKey(rawAesKey, key.publicKey),
                })),
            )
            return { studyJobFileId: file.sourceId, filePath: file.path, keys }
        }),
    )
}
