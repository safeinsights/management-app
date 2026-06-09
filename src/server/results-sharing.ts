import type { DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import type { SharedFile } from '@/lib/types'
import { getLabPublicKeysForJob } from '@/server/db/queries'

/**
 * Persist re-wrapped AES keys ("PO boxes") that grant lab researchers access to approved
 * files, and record the approval itself on each file. Each box is validated against the
 * lab org's known public keys so a client can never share a file with an arbitrary
 * fingerprint. Idempotent via the (study_job_file_id, fingerprint) unique constraint. The
 * file ciphertext is untouched.
 *
 * Approval is recorded as `approved_at`/`approved_by_user_id` on the file row — the durable
 * historical fact — rather than being inferred from box existence. The boxes are the access
 * mechanism; revoking later (Card 74) by deleting a box is *prospective only*: a researcher
 * who already unwrapped the AES key keeps it, so deleting a box stops future reads, not past
 * ones.
 */
export async function insertSharedFileBoxes(
    db: DBExecutor,
    jobId: string,
    sharedFiles: SharedFile[],
    approvedByUserId: string,
): Promise<void> {
    const labKeys = await getLabPublicKeysForJob(jobId)
    const labFingerprints = new Set(labKeys.map((k) => k.fingerprint))

    // We validate that each box targets a real lab recipient, but — the server being blind —
    // we cannot verify the `crypt` actually wraps the file's correct AES key. A buggy reviewer
    // client could persist a box that unwraps to garbage; the researcher would just fail to
    // decrypt downstream. The reviewer client is trusted (it wraps the same key it just used to
    // review), so this is accepted by design rather than guarded here.
    const rows = sharedFiles.flatMap((file) =>
        file.boxes.map((box) => {
            if (!labFingerprints.has(box.fingerprint)) {
                throw new ActionFailure({ file: `fingerprint ${box.fingerprint} is not a lab recipient` })
            }
            return { studyJobFileId: file.studyJobFileId, fingerprint: box.fingerprint, crypt: box.crypt }
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
