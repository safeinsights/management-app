import { NextResponse } from 'next/server'
import { urlForResultsFile } from '@/server/storage'
import { checkUserAllowedJobView, jobInfoForJobId } from '@/server/db/queries'
import { MinimalJobResultsInfo } from '@/lib/types'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const canUserAccessJob = await checkUserAllowedJobView(jobId)

    if (!canUserAccessJob) {
        return NextResponse.json({ error: 'Not authorized to access file' }, { status: 403 })
    }

    const job = await jobInfoForJobId(jobId)
    if (!job.resultsPath) return NextResponse.json({ error: 'no job results' }, { status: 400 })

    const info = { ...job, resultsType: 'APPROVED' } as MinimalJobResultsInfo
    const url = await urlForResultsFile(info)

    if (url) {
        return NextResponse.redirect(url)
    }
    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
