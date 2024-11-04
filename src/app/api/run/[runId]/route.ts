export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { wrapApiMemberAction } from '@/server/wrappers'
import { requestingMember } from '@/server/context'

const schema = z.object({
    status: z.enum(['RESULTS-REJECTED', 'RUNNING', 'ERRORED', 'RESULTS-REVIEW']),
})

const handler = async (req: Request, { params: { runId } }: { params: { runId: string } }) => {
    const member = requestingMember()

    const wasFound = db
        .selectFrom('studyRun')
        .innerJoin('study', (join) => join.onRef('study.id', '=', 'studyRun.studyId').on('memberId', '=', member.id))
        .where('studyRun.id', '=', runId)
        .select('studyRun.id')
        .executeTakeFirst()

    if (!wasFound) {
        return new NextResponse('Not found', { status: 404 })
    }

    const json = await req.json()
    const update = schema.parse(json)

    await db
        .updateTable('studyRun')
        .set({
            status: update.status,
        })
        .where('id', '=', runId)
        .execute()

    return new NextResponse('ok', { status: 200 })
}

export const PUT = wrapApiMemberAction(handler)
