import { NextResponse } from 'next/server'
import { urlOrPathToResultsFile } from '@/server/storage'
import { MinimalJobResultsInfo } from '@/lib/types'
import { queryJobResult } from '@/server/db/queries'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId

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
