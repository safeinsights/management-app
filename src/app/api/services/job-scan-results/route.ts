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
            await encryptAndStoreLog({
                route: '/api/services/job-scan-results',
                plaintextLog: body.plaintextLog,
                fileType: logFileTypes.encrypted,
                job,
            })
            const file = new File([body.plaintextLog], `${logFileTypes.plaintext.toLowerCase()}.txt`, {
                type: 'text/plain',
            })
            await storeStudyLogFile(
                { orgSlug: job.orgSlug, studyId: job.studyId, studyJobId: job.jobId },
                file,
                logFileTypes.plaintext,
            )
        }

        // CODE-SUBMITTED is recorded by the submission action (markCodeSubmitted), not by the scanner:
        // the scan trigger sends no ON_START_PAYLOAD (see buildTriggerScanForStudyJobCommandInput), so
        // this webhook only ever reports CODE-SCANNED / JOB-ERRORED in practice. A stray CODE-SUBMITTED
        // echo from an older scanner would corrupt the append-only submission log (each row is a real
        // round), so reject it rather than dropping-as-duplicate (the old dedup is wrong now that a
        // change-requested resubmit legitimately appends a second CODE-SUBMITTED).
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
