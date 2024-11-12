import { b64toUUID } from '@/lib/uuid'
import { NextResponse } from 'next/server'
import { db } from '@/database'
import { urlOrPathToResultsFile } from '@/server/results'
import { MinimalRunResultsInfo } from '@/lib/types'

export const GET = async (
    _: Request,
    {
        params: {
            slug: [runIdentifier],
        },
    }: { params: { slug: [string, string] } },
) => {
    const runId = b64toUUID(runIdentifier)

    // TODO: check if the run is owned by the researcher
    const run = await db
        .selectFrom('studyRun')
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select(['studyRun.id as studyRunId', 'studyId', 'resultsPath', 'member.identifier as memberIdentifier'])
        .where('studyRun.id', '=', runId)
        .where('studyRun.status', '=', 'COMPLETED')
        .where('studyRun.resultsPath', 'is not', null)
        .executeTakeFirst()

    if (!run) {
        return NextResponse.json({ error: 'run not found', runId }, { status: 404 })
    }

    if (!run.resultsPath) {
        return NextResponse.json({ error: 'Results not available yet' }, { status: 404 })
    }

    const location = await urlOrPathToResultsFile(run as MinimalRunResultsInfo)

    if (location.content) {
        return new NextResponse(location.content)
    } else if (location.url) {
        return NextResponse.redirect(location.url)
    }
}
