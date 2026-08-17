import { db } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { isKnownFailureReason, type JobFailureReason } from '@/lib/job-error-details'
import { storeStudyLogFile } from '@/server/storage'
import { z } from 'zod'
import { createWebhookHandler } from '../webhook-handler'
import { encryptAndStoreLog } from '../encrypt-and-store-log'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY', 'JOB-ERRORED']),
    plaintextLog: z.string().optional(),
    // OTTER-524: the failure class the build reports on JOB-ERRORED, e.g. BASE_IMAGE_UNAVAILABLE.
    //
    // Deliberately z.string() rather than z.enum, and deliberately optional. A code this app does not
    // recognize yet must not fail validation: the containerizer deploys independently, so rejecting
    // an unknown code would stop the job ever being marked errored at all. The buildspec's fallback
    // path also always posts a code-less payload. Unknown values are discarded on the insert below.
    failureReason: z.string().optional(),
})

// Only a failure carries a failure class, and only classified codes are kept, so unvetted text a
// build script sent never lands in the database at all and no future reader can surface it.
const classifiedFailureReason = (body: z.infer<typeof schema>): JobFailureReason | null =>
    body.status === 'JOB-ERRORED' && isKnownFailureReason(body.failureReason) ? body.failureReason : null

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
            const encrypted = await encryptAndStoreLog({
                route: '/api/services/containerizer',
                plaintextLog: body.plaintextLog,
                fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG',
                job,
            })

            // Both halves of one log move together, or neither does: see the same guard in
            // job-scan-results.
            if (!encrypted || encrypted.stored) {
                const file = new File([body.plaintextLog], 'packaging-error-log.txt', { type: 'text/plain' })
                await storeStudyLogFile(
                    { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
                    file,
                    'PACKAGING-ERROR-LOG',
                )
            }
        }

        const failureReason = classifiedFailureReason(body)

        const last = await db
            .selectFrom('jobStatusChange')
            .select(['id', 'status', 'message'])
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
                    message: failureReason,
                })
                .execute()
            return
        }

        // The status dedup would otherwise throw the classification away with the duplicate row. Two
        // deliveries report one failure (the build script's own handler and the buildspec's bare
        // `post_build` fallback) and only one of them carries the code, so whichever lands second
        // must still be able to record it. Nothing is overwritten: an existing message is left alone.
        if (failureReason && !last.message) {
            await db.updateTable('jobStatusChange').set({ message: failureReason }).where('id', '=', last.id).execute()
        }
    },
})
