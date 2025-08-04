import { NextResponse } from 'next/server'
import { jobInfoForJobId } from '@/server/db/queries'
import { urlForStudyJobCodeFile } from '@/server/storage'
import { sessionFromClerk } from '@/server/clerk'
import { toRecord } from '@/lib/permissions'

export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string; fileName: string }> }) => {
    const { jobId, fileName } = await params

    if (!jobId || !fileName) {
        return NextResponse.json({ error: 'no job id or file name provided' }, { status: 400 })
    }

    const job = await jobInfoForJobId(jobId)

    const session = await sessionFromClerk()
    if (!session?.can('view', toRecord('StudyJob', { orgId: job.orgId }))) {
        return NextResponse.json({ error: 'Not authorized to access file' }, { status: 403 })
    }

    const url = await urlForStudyJobCodeFile(job, fileName)

    if (url) {
        return NextResponse.redirect(url)
    }

    return NextResponse.json({ error: 'invalid file' }, { status: 400 })
}
