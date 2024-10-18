export const dynamic = 'force-dynamic' // defaults to auto
import { db, sql } from '@/database'
import { wrapApiMemberAction, requestingMember } from '@/server/wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiMemberAction(async () => {
    const member = requestingMember()
    if (!member) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    const runs = await db
        .selectFrom('studyRun')
        .innerJoin('study', (join) => join.on('memberId', '=', member.id).onRef('study.id', '=', 'studyRun.studyId'))
        .select([
            'studyRun.id as runId',
            'studyId',
            'studyRun.createdAt as requestedAt',
            'study.title',
            'studyRun.status',
            'study.dataSources',
            'study.outputMimeType',
            sql<string>`concat(study.container_location, ':', uuid_to_b64(study_run.id) )`.as('containerLocation'),
        ])
        .where('studyRun.status', 'in', ['pending', 'running'])
        .execute()

    return Response.json({ runs })
})
