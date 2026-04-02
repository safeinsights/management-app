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
            // A late-arriving scan webhook can insert CODE-SCANNED after JOB-READY,
            // so check for the presence of a ready/running status rather than
            // requiring it to be the very latest
            (eb) =>
                eb
                    .selectFrom('jobStatusChange')
                    .where('status', 'in', ['JOB-READY', 'JOB-RUNNING'])
                    .orderBy('studyJobId', 'desc')
                    .orderBy('id', 'desc')
                    .distinctOn('studyJobId')
                    .select(['jobStatusChange.studyJobId', 'status'])
                    .as('readyStatusChange'),
            (join) => join.onRef('readyStatusChange.studyJobId', '=', 'studyJob.id'),
        )
        .where('study.status', '=', 'APPROVED')
        .where(({ not, exists, selectFrom }) =>
            not(
                exists(
                    selectFrom('jobStatusChange')
                        .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                        .where('status', 'in', ['JOB-ERRORED', 'RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED']),
                ),
            ),
        )
        .select([
            'studyJob.id as jobId',
            'studyId',
            'studyJob.createdAt as requestedAt',
            'readyStatusChange.status',
            'study.title',
            'study.dataSources',
            'study.outputMimeType',
            'study.researcherId',
            sql<string>`concat(study.container_location, ':', study_job.id )`.as('containerLocation'),
        ])
        .execute()

    return Response.json({ jobs })
})
