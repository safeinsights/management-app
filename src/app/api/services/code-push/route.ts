export const dynamic = 'force-dynamic' // defaults to auto

import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'

const schema = z.object({
    jobId: z.string(),
    status: z.enum(['JOB-PACKAGING', 'JOB-READY'])
})

export async function POST(req: Request) {
    const body = schema.parse(await req.json())

    const job = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .where('studyJob.id', '=', body.jobId)
        .select(['studyJob.id as jobId', 'study.researcherId'])
        .executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: job.researcherId, // this is called from the packaging lambda so we don't have a user.  Assume the researcher uploaded the code
            studyJobId: job.jobId,
            status: body.status,
        })
        .execute()

    return new NextResponse('ok', { status: 200 })
}
