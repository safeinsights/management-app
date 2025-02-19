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
        .select([
            'studyJob.id as jobId',
            'studyId',
            'studyJob.createdAt as requestedAt',
            'study.title',
            'studyJob.status',
            'study.dataSources',
            'study.outputMimeType',
            sql<string>`concat(study.container_location, ':', uuid_to_b64(study_job.id) )`.as('containerLocation'),
        ])
        .where('studyJob.status', 'in', ['READY', 'RUNNING'])
        .execute()

    return Response.json({ jobs })
})
