import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { getStudyJobFileOfType, getStudyOrgIdForJobId } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { subject } from '@casl/ability'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const study = await getStudyOrgIdForJobId(jobId)

    const file = await getStudyJobFileOfType(jobId, 'APPROVED-RESULT')

    const session = await sessionFromClerk()
    if (file && !session?.can('read', subject('StudyJob', { study }))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    const url = await urlForFile(file.path)
    return NextResponse.redirect(url)
}
