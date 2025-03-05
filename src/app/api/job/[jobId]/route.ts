export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { wrapApiMemberAction } from '@/server/wrappers'
import { requestingMember } from '@/server/context'

const schema = z.object({
    message: z.string().optional(),
    // it's tempting to try to type this, but doesn't seem to work.
    // not really needed though because the where clause below will error if an invalid status is present in the list below
    // TODO: consider removing the RESULTS status since we're reviewing in the BMA now
    status: z.enum(['JOB-PROVISIONING', 'JOB-RUNNING', 'JOB-ERRORED', 'RESULTS-REJECTED', 'RESULTS-APPROVED']),
})

const handler = async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const member = requestingMember()
    const { jobId } = await params
    if (!jobId || !member) {
        return new NextResponse('Unauthorized', { status: 401 })
    }
    const job = await db
        .selectFrom('studyJob')
        .innerJoin('study', (join) => join.onRef('study.id', '=', 'studyJob.studyId').on('memberId', '=', member.id))
        .where('studyJob.id', '=', jobId)
        .select('studyJob.id')
        .executeTakeFirst()

    if (!job) {
        return new NextResponse('Not found', { status: 404 })
    }

    const json = await req.json()
    const change = schema.parse(json)

    const insert = await db
        .insertInto('jobStatusChange')
        .values({
            studyJobId: job.id,
            status: change.status,
            message: change.message,
        })
        .execute()

    if (!insert) {
        return new NextResponse('Failed to record update', { status: 500 })
    }

    return new NextResponse('ok', { status: 200 })
}

export const PUT = wrapApiMemberAction(handler)
