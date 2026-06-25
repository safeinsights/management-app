import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { actionResult } from '@/lib/utils'
import { fetchLabPublicKeysAction } from '@/server/actions/study-job.actions'
import type { JobFileInfo, SharedFile } from '@/lib/types'

/**
 * Re-wrap (not re-encrypt) approved files for the study's lab researchers, client-side. Each inner
 * file has its own AES key; for every researcher key we wrap that raw key into a new `crypt`.
 * Ciphertext is untouched — the server only ever receives wrapped keys, never plaintext.
 */
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
