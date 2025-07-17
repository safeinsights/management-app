import { NextResponse } from 'next/server'
import { jobInfoForJobId } from '@/server/db/queries'
import { urlForStudyJobCodeFile } from '@/server/storage'
import { loadSession } from '@/server/session'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const job = await jobInfoForJobId(jobId)

    const session = await loadSession()
    if (!session?.can('read', 'StudyJob')) {
        return NextResponse.json({ error: 'Not authorized to access file' }, { status: 403 })
    }

    const url = await urlForStudyJobCodeFile(job, fileName)

    if (url) {
        return NextResponse.redirect(url)
    }

    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
