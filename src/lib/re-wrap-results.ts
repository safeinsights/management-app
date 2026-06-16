import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { actionResult } from '@/lib/utils'
import { fetchLabPublicKeysAction } from '@/server/actions/study-job.actions'
import type { JobFileInfo, SharedFile } from '@/lib/types'

/**
 * Re-wrap (not re-encrypt) approved files — results and logs — for the study's lab researchers,
 * client-side.
 *
 * Each archive keeps the prod whole-zip format: one AES key PER inner file, embedded in the
 * manifest for the enclave recipients. While decrypting to review, the reviewer's browser
 * recovered each file's raw AES key (see use-decrypt-files). Here, for every researcher public
 * key, we wrap that file's raw key into a new wrapped key (`crypt`); the ciphertext is never
 * touched. The server only ever receives wrapped keys — never the raw AES key or plaintext.
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
