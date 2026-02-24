import type { FileType } from '@/database/types'
import logger from '@/lib/logger'
import { createEncryptedLogBlob } from '@/server/encryption/encrypt-log'
import { getOrgPublicKeys } from '@/server/db/queries'
import { storeStudyEncryptedLogFile } from '@/server/storage'

interface EncryptAndStoreLogParams {
    route: string
    plaintextLog: string
    fileType: FileType
    job: { jobId: string; studyId: string; orgId: string; orgSlug: string }
}

export async function encryptAndStoreLog({ route, plaintextLog, fileType, job }: EncryptAndStoreLogParams) {
    try {
        const recipients = await getOrgPublicKeys(job.orgId)
        if (recipients.length > 0) {
            const zipBlob = await createEncryptedLogBlob(plaintextLog, recipients)
            const encryptedFile = new File([zipBlob], 'encrypted-logs.zip', { type: 'application/zip' })
            await storeStudyEncryptedLogFile(
                { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
                encryptedFile,
                fileType,
            )
        }
    } catch (encryptionError) {
        logger.error('Failed to encrypt and store error log', encryptionError, {
            route,
            jobId: job.jobId,
            studyId: job.studyId,
            orgId: job.orgId,
        })
    }
}
