import type { FileType } from '@/database/types'
import { logLabel } from '@/lib/file-type-helpers'
import logger from '@/lib/logger'
import { createEncryptedLogBlob } from '@/server/encryption/encrypt-log'
import { getOrgPublicKeys } from '@/server/db/queries'
import { storeStudyEncryptedLogFile } from '@/server/storage'

function logFilename(fileType: FileType): string {
    return logLabel(fileType).toLowerCase().replace(/\s+/g, '-') + '.txt'
}

interface EncryptAndStoreLogParams {
    route: string
    plaintextLog: string
    fileType: FileType
    job: { jobId: string; studyId: string; orgId: string; orgSlug: string }
}

/**
 * Returns whether the encrypted log was written, or null when no write was attempted (the org has no
 * key holders, or encryption failed). Callers that also store a plaintext twin of the same log need
 * this: `storeStudyEncryptedLogFile` refuses to replace an artifact whose keys are already shared, and
 * replacing the plaintext half anyway would leave the reviewer's parsed scan status describing
 * different findings than the log the researcher can open. Null means there is no encrypted
 * counterpart to disagree with, so the plaintext write should go ahead.
 */
export async function encryptAndStoreLog({
    route,
    plaintextLog,
    fileType,
    job,
}: EncryptAndStoreLogParams): Promise<{ stored: boolean } | null> {
    try {
        const recipients = await getOrgPublicKeys(job.orgId)
        if (recipients.length === 0) return null

        const zipBlob = await createEncryptedLogBlob(plaintextLog, recipients, logFilename(fileType))
        const encryptedFile = new File([zipBlob], 'encrypted-logs.zip', { type: 'application/zip' })
        return await storeStudyEncryptedLogFile(
            { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
            encryptedFile,
            fileType,
        )
    } catch (encryptionError) {
        logger.error('Failed to encrypt and store error log', encryptionError, {
            route,
            jobId: job.jobId,
            studyId: job.studyId,
            orgId: job.orgId,
        })
        return null
    }
}
