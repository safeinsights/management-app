import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { getStudyJobFileOfType, jobInfoForJobId } from '@/server/db/queries'
import { canViewStudyJob } from '@/server/auth'

// Serves the plaintext SECURITY-SCAN-LOG .txt for a job. The encrypted zip is
// intentionally not downloadable here (OTTER-649: ZIPs are not offered).
export const GET = async (_: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const { jobId } = await params

    if (!jobId) {
        return NextResponse.json({ error: 'no job id provided' }, { status: 400 })
    }

    // Authorize before touching the file, so a denied requester can't infer from a
    // 404-vs-401 whether another org's job produced a scan log. An unknown job and an
    // unauthorized one both return 401 rather than disclosing which case applied.
    const job = await jobInfoForJobId(jobId).catch(() => null)

    if (!job || !(await canViewStudyJob(job))) {
        return NextResponse.json({ error: 'permission denied' }, { status: 401 })
    }

    const file = await getStudyJobFileOfType(jobId, 'SECURITY-SCAN-LOG', false)

    if (!file) {
        return NextResponse.json({ error: 'scan log not found' }, { status: 404 })
    }

    const url = await urlForFile(file.path)
    return NextResponse.redirect(url)
}
