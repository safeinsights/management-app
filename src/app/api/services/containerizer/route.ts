import { db } from '@/database'
import logger from '@/lib/logger'
import { throwNotFound } from '@/lib/errors'
import { z } from 'zod'
import { createEncryptedLogBlob } from '@/server/encryption/encrypt-log'
import { getOrgPublicKeys } from '@/server/db/queries'
import { storeStudyEncryptedLogFile } from '@/server/storage'
import { createWebhookHandler } from '../webhook-handler'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY', 'JOB-ERRORED', 'CODE-SCANNED']),
    plaintextLog: z.string().optional(),
})

export const POST = createWebhookHandler({
    route: '/api/services/containerizer',
    schema,
    entityNotFoundMessage: 'job-not-found',
    handler: async (body) => {
        const job = await db
            .selectFrom('studyJob')
            .innerJoin('study', 'study.id', 'studyJob.studyId')
            .innerJoin('org', 'org.id', 'study.orgId')
            .where('studyJob.id', '=', body.jobId)
            .select([
                'studyJob.id as jobId',
                'study.researcherId',
                'study.id as studyId',
                'study.orgId',
                'org.slug as orgSlug',
            ])
            .executeTakeFirstOrThrow(throwNotFound('job'))

        // Encrypt and store plaintext log when provided (on build failure or scan completion).
        // Encryption failure should not block saving the status — we log the error but continue
        // so the job at least reflects its current state in the UI.
        if ((body.status === 'JOB-ERRORED' || body.status === 'CODE-SCANNED') && body.plaintextLog) {
            try {
                const recipients = await getOrgPublicKeys(job.orgId)
                if (recipients.length > 0) {
                    const zipBlob = await createEncryptedLogBlob(body.plaintextLog, recipients)
                    const encryptedFile = new File([zipBlob], 'encrypted-logs.zip', {
                        type: 'application/zip',
                    })
                    await storeStudyEncryptedLogFile(
                        { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
                        encryptedFile,
                    )
                }
            } catch (encryptionError) {
                logger.error('Failed to encrypt and store error log', encryptionError, {
                    route: '/api/services/containerizer',
                    jobId: job.jobId,
                    studyId: job.studyId,
                    orgId: job.orgId,
                })
            }
        }

        const last = await db
            .selectFrom('jobStatusChange')
            .select(['status'])
            .where('studyJobId', '=', job.jobId)
            .orderBy('createdAt', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst()

        if (!last || last.status !== body.status) {
            await db
                .insertInto('jobStatusChange')
                .values({
                    userId: job.researcherId,
                    studyJobId: job.jobId,
                    status: body.status,
                })
                .execute()
        }
    },
})
