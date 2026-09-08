import type { DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import type { SharedFile } from '@/lib/types'
import { getLabPublicKeysForJob } from '@/server/db/queries'

// Validated against the lab org's known keys, so a client cannot share to an arbitrary
// fingerprint. A recipient added after approval has no access until a renewal re-wrap.
export async function insertSharedFileKeys(db: DBExecutor, jobId: string, sharedFiles: SharedFile[]): Promise<void> {
    const labKeys = await getLabPublicKeysForJob(jobId)
    const labFingerprints = new Set(labKeys.map((k) => k.fingerprint))

    // studyJobFileId is client-supplied, so without this a reviewer could share another job's
    // files by passing its ids; the fingerprint check below does not cover it.
    const jobFiles = await db.selectFrom('studyJobFile').select('id').where('studyJobId', '=', jobId).execute()
    const jobFileIds = new Set(jobFiles.map((f) => f.id))
    for (const file of sharedFiles) {
        if (!jobFileIds.has(file.studyJobFileId)) {
            throw new ActionFailure({ file: `file ${file.studyJobFileId} does not belong to job ${jobId}` })
        }
    }

    // The server cannot verify `crypt` wraps the right AES key, only that the fingerprint is a
    // real lab recipient; the reviewer client is trusted.
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
