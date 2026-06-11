import type { DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import type { SharedFile } from '@/lib/types'
import { getLabPublicKeysForJob } from '@/server/db/queries'

/**
 * Persist re-wrapped AES keys that grant lab researchers access to approved files, and
 * record the approval itself on each file. Each `study_job_file_key` row works like a PO
 * box: anyone can deposit (the reviewer wraps the file's AES key to a recipient's public
 * key), but only the holder of the matching private key can open it. Each wrapped key is
 * validated against the lab org's known public keys so a client can never share a file with
 * an arbitrary fingerprint. Idempotent via the (study_job_file_id, fingerprint) unique
 * constraint. The file ciphertext is untouched.
 *
 * Approval is recorded as `approved_at`/`approved_by_user_id` on the file row — the durable
 * historical fact — rather than being inferred from wrapped-key existence. The wrapped keys
 * are the access mechanism; revoking later (Card 74) by deleting one is *prospective only*:
 * a researcher who already unwrapped the AES key keeps it, so deletion stops future reads,
 * not past ones.
 */
export async function insertSharedFileKeys(
    db: DBExecutor,
    jobId: string,
    sharedFiles: SharedFile[],
    approvedByUserId: string,
): Promise<void> {
    const labKeys = await getLabPublicKeysForJob(jobId)
    const labFingerprints = new Set(labKeys.map((k) => k.fingerprint))

    // We validate that each wrapped key targets a real lab recipient, but — the server being
    // blind — we cannot verify the `crypt` actually wraps the file's correct AES key. A buggy
    // reviewer client could persist one that unwraps to garbage; the researcher would just fail
    // to decrypt downstream. The reviewer client is trusted (it wraps the same key it just used
    // to review), so this is accepted by design rather than guarded here.
    const rows = sharedFiles.flatMap((file) =>
        file.keys.map((key) => {
            if (!labFingerprints.has(key.fingerprint)) {
                throw new ActionFailure({ file: `fingerprint ${key.fingerprint} is not a lab recipient` })
            }
            return { studyJobFileId: file.studyJobFileId, fingerprint: key.fingerprint, crypt: key.crypt }
        }),
    )

    const approvedFileIds = sharedFiles.map((f) => f.studyJobFileId)
    if (!approvedFileIds.length) return

    if (rows.length) {
        await db
            .insertInto('studyJobFileKey')
            .values(rows)
            .onConflict((oc) => oc.columns(['studyJobFileId', 'fingerprint']).doNothing())
            .execute()
    }

    await db
        .updateTable('studyJobFile')
        .set({ approvedAt: new Date(), approvedByUserId })
        .where('id', 'in', approvedFileIds)
        .execute()
}
