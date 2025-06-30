import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { checkUserAllowedJobView, getStudyJobFileOfType } from '@/server/db/queries'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const canUserAccessJob = await checkUserAllowedJobView(jobId)
    if (!canUserAccessJob) {
        return NextResponse.json({ error: 'Not authorized to access file' }, { status: 403 })
    }

    const file = await getStudyJobFileOfType(jobId, 'APPROVED-RESULT')
    const url = await urlForFile(file.path)
    return NextResponse.redirect(url)
}
