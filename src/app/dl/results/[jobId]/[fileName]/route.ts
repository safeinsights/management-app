import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { getStudyJobFileOfType, getInfoForStudyJobId } from '@/server/db/queries'
import { canViewStudyJob } from '@/server/auth'

// LEGACY ONLY: the plaintext APPROVED-RESULT copy from before results were encrypted. New jobs
// create no such rows; delete with pathForStudyJobResults once legacy ages out.
export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const job = await getInfoForStudyJobId(jobId)

    const file = await getStudyJobFileOfType(jobId, 'APPROVED-RESULT')

    if (!(await canViewStudyJob(job))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    const url = await urlForFile(file.path)
    return NextResponse.redirect(url)
}
