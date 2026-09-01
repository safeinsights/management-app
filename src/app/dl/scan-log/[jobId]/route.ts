import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { getStudyJobFileOfType, jobInfoForJobId } from '@/server/db/queries'
import { canViewStudyJob } from '@/server/auth'
import { SCAN_LOG_FILE_NAME } from '@/lib/paths'

// The encrypted zip is intentionally not downloadable here (OTTER-649).
export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const { jobId } = await params

    if (!jobId) {
        return NextResponse.json({ error: 'no job id provided' }, { status: 400 })
    }

    // Authorize before touching the file: an unknown job and an unauthorized one both return 401,
    // so a denied requester learns nothing about another org's job.
    const job = await jobInfoForJobId(jobId).catch(() => null)

    if (!job || !(await canViewStudyJob(job))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    const file = await getStudyJobFileOfType(jobId, 'SECURITY-SCAN-LOG', false)

    if (!file) {
        return NextResponse.json({ error: 'scan log not found' }, { status: 404 })
    }

    // The anchor's `download` attribute doesn't survive the cross-origin redirect to S3, so force
    // a Content-Disposition.
    const url = await urlForFile(file.path, {
        ResponseContentDisposition: `attachment; filename="${SCAN_LOG_FILE_NAME}"`,
    })
    return NextResponse.redirect(url)
}
