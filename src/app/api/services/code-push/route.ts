export const dynamic = 'force-dynamic' // defaults to auto

import { db } from '@/database'
import logger from '@/lib/logger'
import { z } from 'zod'
import { NextResponse } from 'next/server'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY', 'JOB-ERRORED']),
    message: z.string().max(3072).optional(),
})

export async function POST(req: Request) {
    let rawBody: unknown

    try {
        rawBody = await req.json()
        const body = schema.parse(rawBody)

        const job = await db
            .selectFrom('studyJob')
            .innerJoin('study', 'study.id', 'studyJob.studyId')
            .where('studyJob.id', '=', body.jobId)
            .select(['studyJob.id as jobId', 'study.researcherId'])
            .executeTakeFirstOrThrow()

        // Idempotency: avoid inserting duplicate consecutive statuses with identical message
        const last = await db
            .selectFrom('jobStatusChange')
            .select(['status', 'message', 'createdAt'])
            .where('studyJobId', '=', job.jobId)
            .orderBy('createdAt', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst()

        const incomingMessage = body.message ?? null
        const lastMessage = (last?.message ?? null) as string | null

        if (!last || last.status !== body.status || lastMessage !== incomingMessage) {
            await db
                .insertInto('jobStatusChange')
                .values({
                    userId: job.researcherId, // this is called from the packaging lambda so we don't have a user.  Assume the researcher uploaded the code
                    studyJobId: job.jobId,
                    status: body.status,
                    message: incomingMessage,
                })
                .execute()
        }

        return new NextResponse('ok', { status: 200 })
    } catch (error) {
        logger.error('Error handling /api/services/code-push POST', error, {
            route: '/api/services/code-push',
            body: rawBody ?? null,
        })
        // Re-throw so Next.js still returns a 500 and existing tests/behavior are preserved
        throw error
    }
}
