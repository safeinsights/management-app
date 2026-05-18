import { db } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { storeStudyLogFile } from '@/server/storage'
import { z } from 'zod'
import { createWebhookHandler } from '../webhook-handler'
import { encryptAndStoreLog } from '../encrypt-and-store-log'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY', 'JOB-ERRORED']),
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

        if (body.status === 'JOB-ERRORED' && body.plaintextLog) {
            await encryptAndStoreLog({
                route: '/api/services/containerizer',
                plaintextLog: body.plaintextLog,
                fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG',
                job,
            })
            const file = new File([body.plaintextLog], 'packaging-error-log.txt', { type: 'text/plain' })
            await storeStudyLogFile(
                { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
                file,
                'PACKAGING-ERROR-LOG',
            )
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
