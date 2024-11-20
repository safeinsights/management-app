import { b64toUUID } from '@/lib/uuid'
import { NextResponse } from 'next/server'
import { urlOrPathToResultsFile } from '@/server/results'
import { MinimalRunResultsInfo } from '@/lib/types'
import { queryRunResult } from '@/server/queries'

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
    const run = await queryRunResult(runId)

    if (!run) {
        return NextResponse.json({ error: 'run not found', runId }, { status: 404 })
    }

    const location = await urlOrPathToResultsFile(run as MinimalRunResultsInfo)
    if (location.content) {
        return new NextResponse(location.content)
    } else if (location.url) {
        return NextResponse.redirect(location.url)
    }
}
