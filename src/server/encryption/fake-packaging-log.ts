import { ResultsWriter } from 'si-encryption/job-results/writer'
import { db } from '@/database'
import { getOrgPublicKeys } from '@/server/db/queries'
import { storeStudyEncryptedLogFile } from '@/server/storage'
import logger from '@/lib/logger'

export const PACKAGING_FAILURE_MESSAGE = 'Job failed during code packaging'
export const PACKAGING_FAILURE_FILENAME = 'error-log.txt'

type RecipientKey = {
    publicKey: ArrayBuffer
    fingerprint: string
}

/**
 * Creates an encrypted zip containing a packaging failure log message.
 */
export async function createEncryptedPackagingFailureLogZip(recipients: RecipientKey[]): Promise<Uint8Array> {
    const writer = new ResultsWriter(recipients)
    const bytes = new TextEncoder().encode(PACKAGING_FAILURE_MESSAGE)
    await writer.addFile(PACKAGING_FAILURE_FILENAME, bytes.buffer)
    const blob = await writer.generate()
    return new Uint8Array(await blob.arrayBuffer())
}

async function jobHasReachedReady(jobId: string): Promise<boolean> {
    return Boolean(
        await db
            .selectFrom('jobStatusChange')
            .select(['id'])
            .where('studyJobId', '=', jobId)
            .where('status', '=', 'JOB-READY')
            .limit(1)
            .executeTakeFirst(),
    )
}

async function jobHasEncryptedLog(jobId: string): Promise<boolean> {
    return Boolean(
        await db
            .selectFrom('studyJobFile')
            .select(['id'])
            .where('studyJobId', '=', jobId)
            .where('fileType', '=', 'ENCRYPTED-LOG')
            .limit(1)
            .executeTakeFirst(),
    )
}

type JobInfo = {
    jobId: string
    studyId: string
    orgId: string
    orgSlug: string
}

/**
 * Creates and stores a fake encrypted log for packaging/build failures.
 * This is called when JOB-ERRORED occurs before JOB-READY, allowing reviewers
 * to use the same decrypt UX for viewing error information.
 *
 * @returns true if a log was created, false if skipped (already has log or reached READY)
 */
export async function createAndStoreBuildErrorLog(job: JobInfo): Promise<boolean> {
    const [reachedReady, hasLog] = await Promise.all([jobHasReachedReady(job.jobId), jobHasEncryptedLog(job.jobId)])

    if (reachedReady || hasLog) {
        return false
    }

    const recipients = await getOrgPublicKeys(job.orgId)
    if (recipients.length === 0) {
        logger.warn('No org recipient keys found; cannot store encrypted packaging error log', {
            jobId: job.jobId,
            orgId: job.orgId,
        })
        return false
    }

    const zipBytes = await createEncryptedPackagingFailureLogZip(recipients)
    // Clone to ensure a concrete ArrayBuffer backing (avoids TS treating buffer as ArrayBufferLike)
    const logFile = new File([Uint8Array.from(zipBytes)], 'encrypted-logs.zip', { type: 'application/zip' })
    await storeStudyEncryptedLogFile({ orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId }, logFile)

    return true
}
