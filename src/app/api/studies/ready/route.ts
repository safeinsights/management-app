import { db, sql } from '@/database'
import { wrapApiOrgAction, apiRequestingOrg } from '@/server/api-wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiOrgAction(async () => {
    const org = apiRequestingOrg()
    if (!org) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const jobs = await db
        .selectFrom('studyJob')
        .innerJoin('study', (join) => join.on('orgId', '=', org.id).onRef('study.id', '=', 'studyJob.studyId'))
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
        .where('study.status', '=', 'APPROVED')
        .select([
            'studyJob.id as jobId',
            'studyId',
            'studyJob.createdAt as requestedAt',
            'latestStatusChange.status',
            'study.title',
            'study.dataSources',
            'study.outputMimeType',
            'study.researcherId',
            sql<string>`concat(study.container_location, ':', study_job.id )`.as('containerLocation'),
        ])
        .execute()

    return Response.json({ jobs })
})
