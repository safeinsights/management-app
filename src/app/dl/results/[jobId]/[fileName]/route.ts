import { NextResponse } from 'next/server'
import { urlForFile } from '@/server/storage'
import { getStudyJobFileOfType, getInfoForStudyJobId } from '@/server/db/queries'
import { canViewStudyJob } from '@/server/auth'

// LEGACY ONLY: serves the plaintext APPROVED-RESULT copy from before results were
// encrypted for researchers. New jobs no longer create APPROVED-RESULT rows (results are
// decomposed + decrypted client-side), so this path is only reachable for pre-encryption
// studies. It can be deleted — along with pathForStudyJobResults (src/lib/paths.ts) and any
// remaining plaintext S3 objects — once legacy studies age out.
// REVIEWER: please flag this during review so we track the eventual removal.
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
