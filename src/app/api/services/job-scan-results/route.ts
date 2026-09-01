import { db } from '@/database'
import type { FileType } from '@/database/types'
import { throwNotFound } from '@/lib/errors'
import { storeStudyLogFile } from '@/server/storage'
import { z } from 'zod'
import { createWebhookHandler } from '../webhook-handler'
import { encryptAndStoreLog } from '../encrypt-and-store-log'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['CODE-SUBMITTED', 'CODE-SCANNED', 'JOB-ERRORED']),
    plaintextLog: z.string().optional(),
})

const LOG_FILE_TYPES: Partial<Record<string, { encrypted: FileType; plaintext: FileType }>> = {
    'JOB-ERRORED': { encrypted: 'ENCRYPTED-PACKAGING-ERROR-LOG', plaintext: 'PACKAGING-ERROR-LOG' },
    'CODE-SCANNED': { encrypted: 'ENCRYPTED-SECURITY-SCAN-LOG', plaintext: 'SECURITY-SCAN-LOG' },
}

export const POST = createWebhookHandler({
    route: '/api/services/job-scan-results',
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

        const logFileTypes = LOG_FILE_TYPES[body.status]
        if (logFileTypes && body.plaintextLog) {
            const encrypted = await encryptAndStoreLog({
                route: '/api/services/job-scan-results',
                plaintextLog: body.plaintextLog,
                fileType: logFileTypes.encrypted,
                job,
            })

            // Both halves move together: replacing only the plaintext would show the reviewer
            // findings from a log the researcher cannot open.
            if (!encrypted || encrypted.stored) {
                const file = new File([body.plaintextLog], `${logFileTypes.plaintext.toLowerCase()}.txt`, {
                    type: 'text/plain',
                })
                await storeStudyLogFile(
                    { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
                    file,
                    logFileTypes.plaintext,
                )
            }
        }

        // CODE-SUBMITTED is owned by markCodeSubmitted; a stray scanner echo would corrupt the
        // append-only submission log.
        if (body.status === 'CODE-SUBMITTED') return

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
