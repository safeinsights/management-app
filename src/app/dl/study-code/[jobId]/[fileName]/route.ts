import { NextResponse } from 'next/server'
import { checkUserAllowedJobView, jobInfoForJobId } from '@/server/db/queries'
import { urlOrContentForStudyJobCodeFile } from '@/server/storage'

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

    const loc = await urlOrContentForStudyJobCodeFile(job, fileName)

    if (loc.content) {
        return new NextResponse(loc.content)
    } else if (loc.url) {
        return NextResponse.redirect(loc.url)
    }

    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
