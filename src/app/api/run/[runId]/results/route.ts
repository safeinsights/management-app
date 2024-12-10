export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { NextResponse } from 'next/server'
import { wrapApiMemberAction, requestingMember } from '@/server/wrappers'
import { attachResultsToStudyRun } from '@/server/results'

export const POST = wrapApiMemberAction(async (req: Request, { params: { runId } }: { params: { runId: string } }) => {
    const member = requestingMember()
    if (!member) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const formData = await req.formData()
        const contents = formData.get('file') as File

        if (!contents) {
            return NextResponse.json({ status: 'fail', error: 'no "file" entry in post data' }, { status: 500 })
        }

        // join is a security check to ensure the run is owned by the member
        const info = await db
            .selectFrom('studyRun')
            .innerJoin('study', (join) =>
                join.onRef('study.id', '=', 'studyRun.studyId').on('study.memberId', '=', member.id),
            )
            .select(['studyRun.id as studyRunId', 'studyId'])
            .where('studyRun.id', '=', runId)
            .executeTakeFirst()

        if (!info) {
            return NextResponse.json({ status: 'fail', error: 'run not found' }, { status: 404 })
        }

        await attachResultsToStudyRun(
            {
                ...info,
                memberIdentifier: member.identifier,
            },
            contents,
        )

        return NextResponse.json({ status: 'success' }, { status: 200 })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ status: 'fail', error: e }, { status: 500 })
    }
})
