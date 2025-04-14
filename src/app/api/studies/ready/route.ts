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
        .selectFrom('studyJob')
        .innerJoin('study', (join) => join.on('memberId', '=', member.id).onRef('study.id', '=', 'studyJob.studyId'))
        .innerJoin(
            // join to the latest status change
            (eb) =>
                eb
                    .selectFrom('jobStatusChange')
                    .orderBy('studyJobId', 'desc')
                    .orderBy('id', 'desc')
                    .distinctOn('studyJobId')
                    .select(['jobStatusChange.studyJobId', 'status'])
                    .as('latestStatusChange'),
            (join) =>
                join
                    // and only select rows where the latest is READY or RUNNING
                    .on('latestStatusChange.status', 'in', ['JOB-READY', 'JOB-RUNNING'])
                    .onRef('latestStatusChange.studyJobId', '=', 'studyJob.id'),
        )
        .select([
            'studyJob.id as jobId',
            'studyId',
            'studyJob.createdAt as requestedAt',
            'latestStatusChange.status',
            'study.title',
            'study.dataSources',
            'study.outputMimeType',
            sql<string>`concat(study.container_location, ':', study_job.id )`.as('containerLocation'),
        ])
        .execute()

    return Response.json({ jobs })
})
