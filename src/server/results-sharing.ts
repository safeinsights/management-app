import type { DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import type { SharedFile } from '@/lib/types'
import { getLabPublicKeysForJob } from '@/server/db/queries'

/**
 * Persist re-wrapped AES keys that grant lab researchers access to a job's files. Each
 * `study_job_file_key` row works like a PO box: anyone can deposit (the reviewer wraps the
 * file's AES key to a recipient's public key), but only the holder of the matching private
 * key can open it. Each wrapped key is validated against the lab org's known public keys so a
 * client can never share a file with an arbitrary fingerprint. Idempotent via the
 * (study_job_file_id, file_path, fingerprint) unique constraint. The file ciphertext is untouched.
 *
 * Approval itself is recorded by the caller as a job-level FILES-APPROVED `job_status_change`
 * event (all-or-nothing, per Phil 2026-06) — NOT as a per-file column. The wrapped keys are
 * just the access mechanism; revoking later by deleting one is *prospective only*: a
 * researcher who already unwrapped the AES key keeps it, so deletion stops future reads, not
 * past ones.
 */
export async function insertSharedFileKeys(db: DBExecutor, jobId: string, sharedFiles: SharedFile[]): Promise<void> {
    const labKeys = await getLabPublicKeysForJob(jobId)
    const labFingerprints = new Set(labKeys.map((k) => k.fingerprint))

    // Ownership guard: `studyJobFileId` comes from the client payload, so confirm every file
    // actually belongs to `jobId` before we mark it shared. Without this, a reviewer with
    // approve rights on job A could pass file ids from job B and — if B's lab happens to share a
    // fingerprint — grant access to another job's files. Fingerprint validation below does not
    // cover this ownership check.
    const jobFiles = await db.selectFrom('studyJobFile').select('id').where('studyJobId', '=', jobId).execute()
    const jobFileIds = new Set(jobFiles.map((f) => f.id))
    for (const file of sharedFiles) {
        if (!jobFileIds.has(file.studyJobFileId)) {
            throw new ActionFailure({ file: `file ${file.studyJobFileId} does not belong to job ${jobId}` })
        }
    }

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
        .insertInto('studyJobFileKey')
        .values(rows)
        .onConflict((oc) => oc.columns(['studyJobFileId', 'filePath', 'fingerprint']).doNothing())
        .execute()
}
