import { NextResponse } from 'next/server'
import { urlOrPathToResultsFile } from '@/server/storage'
import { jobInfoForJobId } from '@/server/db/queries'
import { MinimalJobResultsInfo } from '@/lib/types'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const job = await jobInfoForJobId(jobId)
    if (!job.resultsPath) return NextResponse.json({ error: 'no job results' }, { status: 400 })

    const info = { ...job, resultsType: 'APPROVED' } as MinimalJobResultsInfo
    const loc = await urlOrPathToResultsFile(info)

    if (loc.content) {
        return new NextResponse(loc.content)
    } else if (loc.url) {
        return NextResponse.redirect(loc.url)
    }
    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
