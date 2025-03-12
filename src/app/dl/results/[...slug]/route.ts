import { NextResponse } from 'next/server'
import { urlOrPathToResultsFile } from '@/server/results'
import { MinimalJobResultsInfo } from '@/lib/types'
import { queryJobResult } from '@/server/queries'

export const GET = async (_: Request, { params }: { params: Promise<{ slug: [string, string] }> }) => {
    const {
        slug: [jobIdentifier],
    } = await params
    const jobId = jobIdentifier

    // TODO: check if the job is owned by the researcher
    const job = await queryJobResult(jobId)

    if (!job) {
        return NextResponse.json({ error: 'job not found', jobId }, { status: 404 })
    }

    const location = await urlOrPathToResultsFile(job as MinimalJobResultsInfo)
    if (location.content) {
        return new NextResponse(location.content)
    } else if (location.url) {
        return NextResponse.redirect(location.url)
    }
}
