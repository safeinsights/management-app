import { z } from 'zod'
import { NextResponse } from 'next/server'
import { wrapApiOrgAction } from '@/server/api-wrappers'
import { JobTransitionRefusedError, transitionJob } from '@/server/job-transitions'
import logger from '@/lib/logger'
import { apiRequestingOrg, currentDb } from '@/server/request-context'

const schema = z.object({
    message: z.string().optional(),
    status: z.enum([
        'JOB-PROVISIONING',
        'JOB-RUNNING',
        'JOB-ERRORED',
        'FILES-REJECTED',
        'FILES-APPROVED',
        'RUN-COMPLETE',
    ]),
})

const handler = async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const org = apiRequestingOrg()
    const { jobId } = await params
    if (!jobId || !org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const alreadyCompleted = await currentDb()
        .selectFrom('jobStatusChange')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .where('jobStatusChange.status', 'in', ['RUN-COMPLETE'])
        .executeTakeFirst()
    if (alreadyCompleted) return new NextResponse('job is already complete', { status: 422 })

    const job = await currentDb()
        .selectFrom('studyJob')
        .innerJoin('study', (join) => join.onRef('study.id', '=', 'studyJob.studyId').on('orgId', '=', org.id))
        .where('studyJob.id', '=', jobId)
        .select(['studyJob.id', 'studyJob.studyId'])
        .executeTakeFirst()

    if (!job) {
        return new NextResponse('Not found', { status: 404 })
    }

    const json = await req.json()
    const change = schema.parse(json)

    try {
        await transitionJob(currentDb(), job.id, change.status, { actor: 'enclave', message: change.message })
    } catch (error) {
        if (!(error instanceof JobTransitionRefusedError)) throw error
        // A late failure report after the outputs decision: a retry would only be refused again.
        if (error.reason === 'round-closed' && change.status === 'JOB-ERRORED') {
            logger.warn(`not recording JOB-ERRORED for job ${job.id}: the round is already decided`)
            return new NextResponse('ok', { status: 200 })
        }
        return NextResponse.json({ error: 'transition-refused', from: error.from, to: error.to }, { status: 409 })
    }

    return new NextResponse('ok', { status: 200 })
}

export const PUT = wrapApiOrgAction(handler)
