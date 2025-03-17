export const dynamic = 'force-dynamic' // defaults to auto
import { db, sql } from '@/database'
import { wrapApiMemberAction, requestingMember } from '@/server/wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiMemberAction(async () => {
    const member = requestingMember()
    if (!member) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const jobs = await db
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .innerJoin('study', (join) => join.on('memberId', '=', member.id).onRef('study.id', '=', 'studyJob.studyId'))
        .select([
            'studyJob.id as jobId',
            'studyId',
            'jobStatusChange.createdAt as requestedAt',
            'study.title',
            'jobStatusChange.status',
            'study.dataSources',
            'study.outputMimeType',
            sql<string>`concat(study.container_location, ':', uuid_to_b64(study_job.id) )`.as('containerLocation'),
        ])
        .where('jobStatusChange.status', 'in', ['JOB-READY', 'JOB-RUNNING'])
        .execute()

    return Response.json({ jobs })
})
