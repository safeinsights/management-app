export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { NextResponse } from 'next/server'
import { requestingMember, wrapApiMemberAction } from '@/server/wrappers'
import { attachResultsToStudyJob } from '@/server/results'

export const POST = wrapApiMemberAction(async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const member = requestingMember()
    const { jobId } = await params
    if (!jobId || !member) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const formData = await req.formData()
        const contents = formData.get('file') as File

        if (!contents) {
            return NextResponse.json({ status: 'fail', error: 'no "file" entry in post data' }, { status: 500 })
        }

        // join is a security check to ensure the job is owned by the member
        const info = await db
            .selectFrom('studyJob')
            .innerJoin('study', (join) =>
                join.onRef('study.id', '=', 'studyJob.studyId').on('study.memberId', '=', member.id),
            )
            .select(['studyJob.id as studyJobId', 'studyId', 'study.memberId as memberIdentifier'])
            .where('studyJob.id', '=', jobId)
            .executeTakeFirst()

        if (!info) {
            return NextResponse.json({ status: 'fail', error: 'job not found' }, { status: 404 })
        }

        await attachResultsToStudyJob(info, contents, 'RUN-COMPLETE')

        return NextResponse.json({ status: 'success' }, { status: 200 })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ status: 'fail', error: e }, { status: 500 })
    }
})
