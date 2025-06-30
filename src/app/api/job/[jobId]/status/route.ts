export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { wrapApiOrgAction } from '@/server/api-wrappers'
import { apiRequestingOrg } from '@/server/api-context'

const schema = z.object({
    message: z.string().optional(),
    // it's tempting to try to type this, but doesn't seem to work.
    // not really needed though because the where clause below will error if an invalid status is present in the list below
    // TODO: consider removing the RESULTS status since we're reviewing in the BMA now
    status: z.enum(['JOB-PROVISIONING', 'JOB-RUNNING', 'JOB-ERRORED', 'RESULTS-REJECTED', 'RESULTS-APPROVED']),
})

const handler = async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const status = await db
        .selectFrom('jobStatusChange')
        .where('studyJobId', '=', jobId)
        .orderBy('createdAt', 'desc')
        .select(['status', 'message'])
        .executeTakeFirst()

    // console.log('status', status)

    if (!status) {
        return new NextResponse('Not found', { status: 404 })
    }

    // return new NextResponse(, { status: 200 })
    return Response.json(status)
}

export const GET = wrapApiOrgAction(handler)
