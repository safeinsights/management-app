import { timingSafeEqual } from 'crypto'
import { db } from '@/database'
import logger from '@/lib/logger'
import { NotFoundError, throwNotFound } from '@/lib/errors'
import { z, ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { createEncryptedLogBlob } from '@/server/encryption/encrypt-log'
import { getOrgPublicKeys } from '@/server/db/queries'
import { storeStudyEncryptedLogFile } from '@/server/storage'
import { getConfigValue } from '@/server/config'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY', 'JOB-ERRORED']),
    plaintextLog: z.string().optional(),
})

function secretsMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}

export async function POST(req: Request) {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const expectedSecret = await getConfigValue('CODE_PUSH_WEBHOOK_SECRET', false)

    if (!token || !expectedSecret || !secretsMatch(token, expectedSecret)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    let rawBody: unknown

    try {
        rawBody = await req.json()
        const body = schema.parse(rawBody)

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

        // If build failed and plaintext log provided, try to encrypt and store it.
        // Encryption failure should not block saving the JOB-ERRORED status - we log
        // the error but continue so the job at least shows as errored in the UI.
        if (body.status === 'JOB-ERRORED' && body.plaintextLog) {
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
                    route: '/api/services/code-push',
                    jobId: job.jobId,
                    studyId: job.studyId,
                    orgId: job.orgId,
                })
            }
        }

        // Idempotency: avoid inserting duplicate consecutive statuses.
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
                    userId: job.researcherId, // this is called from the packaging lambda so we don't have a user.  Assume the researcher uploaded the code
                    studyJobId: job.jobId,
                    status: body.status,
                })
                .execute()
        }

        return new NextResponse('ok', { status: 200 })
    } catch (error) {
        if (error instanceof ZodError) {
            logger.error('Error handling /api/services/code-push POST', error, {
                route: '/api/services/code-push',
                body: rawBody ?? null,
            })

            return NextResponse.json(
                {
                    error: 'invalid-payload',
                    issues: error.issues,
                },
                { status: 400 },
            )
        }

        if (error instanceof NotFoundError) {
            logger.error('Error handling /api/services/code-push POST', error, {
                route: '/api/services/code-push',
                body: rawBody ?? null,
            })

            return NextResponse.json({ error: 'job-not-found' }, { status: 404 })
        }

        logger.error('Error handling /api/services/code-push POST', error, {
            route: '/api/services/code-push',
            body: rawBody ?? null,
        })

        return NextResponse.json({ error: 'internal-error' }, { status: 500 })
    }
}
