import { NextResponse } from 'next/server'
import { jobInfoForJobId } from '@/server/db/queries'
import { urlForStudyJobCodeFile } from '@/server/storage'
import { canViewStudyJob } from '@/server/auth'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const job = await jobInfoForJobId(jobId)

    if (!job) {
        console.error(`Job not found for jobId: ${jobId}`)
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!(await canViewStudyJob(job))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    const url = await urlForStudyJobCodeFile(job, fileName)
    return NextResponse.redirect(url)
}
