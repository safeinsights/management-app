import { db } from '@/database'
import logger from '@/lib/logger'
import { NotFoundError, throwNotFound } from '@/lib/errors'
import { z, ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { createAndStoreBuildErrorLog } from '@/server/encryption/fake-packaging-log'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY', 'JOB-ERRORED']),
})

export async function POST(req: Request) {
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

        // If packaging/build failed (JOB-ERRORED) before we ever reached JOB-READY,
        // generate a fake encrypted log so reviewers can use the same decrypt UX.
        if (body.status === 'JOB-ERRORED') {
            await createAndStoreBuildErrorLog(job)
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
