import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { actionResult } from '@/lib/utils'
import { fetchLabPublicKeysAction } from '@/server/actions/study-job.actions'
import type { JobFileInfo } from '@/lib/types'

export type SharedFileBox = { fingerprint: string; crypt: string }
export type SharedFile = { studyJobFileId: string; boxes: SharedFileBox[] }

/**
 * Re-wrap (not re-encrypt) approved files for the study's lab researchers, client-side.
 *
 * The reviewer's browser already holds each file's raw AES key from decrypting to review.
 * For every researcher public key we wrap that same key into a new "PO box" (`crypt`); the
 * file ciphertext is never touched. The server only ever receives wrapped keys — never the
 * raw AES key or plaintext.
 */
export async function buildSharedFiles(studyId: string, files: JobFileInfo[]): Promise<SharedFile[]> {
    const labKeys = actionResult(await fetchLabPublicKeysAction({ studyId }))

    return Promise.all(
        files.map(async (file) => {
            if (!file.rawAesKey) throw new Error(`missing raw AES key for file ${file.sourceId}`)
            const rawAesKey = file.rawAesKey
            const boxes = await Promise.all(
                labKeys.map(async (key) => ({
                    fingerprint: key.fingerprint,
                    crypt: await wrapAesKey(rawAesKey, key.publicKey),
                })),
            )
            return { studyJobFileId: file.sourceId, boxes }
        }),
    )
}
