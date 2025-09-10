import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { getStudyJobFileOfType, getInfoForStudyJobId } from '@/server/db/queries'
import { sessionFromClerk } from '@/server/clerk'
import { toRecord } from '@/lib/permissions'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const info = await getInfoForStudyJobId(jobId)

    const file = await getStudyJobFileOfType(jobId, 'APPROVED-RESULT')

    const session = await sessionFromClerk()
    if (file && !session?.can('view', toRecord('StudyJob', { orgId: info.orgId }))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    const url = await urlForFile(file.path)
    return NextResponse.redirect(url)
}
