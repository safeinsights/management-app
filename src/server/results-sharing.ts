import type { DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import type { SharedFile } from '@/lib/types'
import { getLabPublicKeysForJob } from '@/server/db/queries'

/**
 * Persist re-wrapped AES keys granting lab researchers access to a job's files. Each
 * `study_job_file_recipient_key` row holds a file's AES key wrapped to a recipient's public key. Validated
 * against the lab org's known keys so a client can't share to an arbitrary fingerprint. Idempotent
 * via the (study_job_file_id, file_path, fingerprint) unique constraint; ciphertext untouched.
 *
 * Revocation is prospective only: a researcher who already unwrapped a key keeps it.
 *
 * FOLLOW-UP (renewal re-wrap): today these rows are only written when a reviewer approves results,
 * so a recipient added/changed afterward has no access. The committed direction is a "renew
 * encryption" flow — any current recipient decrypts the artifact, re-wraps each file's AES key for
 * the up-to-date recipient set, and writes new rows here — to cover key rotation (fingerprint
 * changes, orphaning old rows), lost/compromised keys, new hires, and departed members without
 * re-running the job. This insert path is the mechanism that flow will reuse/extend.
 */
export async function insertSharedFileKeys(db: DBExecutor, jobId: string, sharedFiles: SharedFile[]): Promise<void> {
    const labKeys = await getLabPublicKeysForJob(jobId)
    const labFingerprints = new Set(labKeys.map((k) => k.fingerprint))

    // Ownership guard: `studyJobFileId` is client-supplied, so confirm every file belongs to
    // `jobId` — else a reviewer could share another job's files by passing its ids. The fingerprint
    // check below doesn't cover this.
    const jobFiles = await db.selectFrom('studyJobFile').select('id').where('studyJobId', '=', jobId).execute()
    const jobFileIds = new Set(jobFiles.map((f) => f.id))
    for (const file of sharedFiles) {
        if (!jobFileIds.has(file.studyJobFileId)) {
            throw new ActionFailure({ file: `file ${file.studyJobFileId} does not belong to job ${jobId}` })
        }
    }

    // Server can't verify `crypt` wraps the correct AES key — only that the fingerprint is a real
    // lab recipient. The reviewer client is trusted (wraps the key it just reviewed with).
    const rows = sharedFiles.flatMap((file) =>
        file.keys.map((key) => {
            if (!labFingerprints.has(key.fingerprint)) {
                throw new ActionFailure({ file: `fingerprint ${key.fingerprint} is not a lab recipient` })
            }
            return {
                studyJobFileId: file.studyJobFileId,
                filePath: file.filePath,
                fingerprint: key.fingerprint,
                crypt: key.crypt,
            }
        }),
    )

    if (!rows.length) return

    await db
        .insertInto('studyJobFileRecipientKey')
        .values(rows)
        .onConflict((oc) => oc.columns(['studyJobFileId', 'filePath', 'fingerprint']).doNothing())
        .execute()
}
