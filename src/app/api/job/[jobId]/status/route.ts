import { NextResponse } from 'next/server'
import { wrapApiOrgAction, apiRequestingOrg } from '@/server/api-wrappers'
import { currentDb } from '@/server/request-context'

const handler = async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const status = await currentDb()
        .selectFrom('jobStatusChange')
        .where('studyJobId', '=', jobId)
        .orderBy('createdAt', 'desc')
        .select(['status'])
        .executeTakeFirst()

    if (!status) {
        return new NextResponse('Not found', { status: 404 })
    }

    return Response.json(status)
}

export const GET = wrapApiOrgAction(handler)
