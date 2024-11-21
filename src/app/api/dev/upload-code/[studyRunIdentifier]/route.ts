export const dynamic = 'force-dynamic' // defaults to auto

import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { PROD_ENV } from '@/server/config'

const schema = z.object({
    runId: z.string().uuid(),
    codePath: z.string(),
    fileSize: z.number(),
    fileCount: z.number(),
})

export async function POST(async (req: Request, { params: { runId } }: { params: { runId: string } }) {
    if (PROD_ENV) {
        return NextResponse.json({ status: 'fail', error: 'This route is only available in development' }, { status: 403 })
    }
    const run = await db
        .selectFrom('studyRun')
        .innerJoin('study', (join) =>
            join.onRef('study.id', '=', 'studyRun.studyId').on('study.memberId', '=', member.id),
        )
        .select(['studyRun.id as studyRunId', 'studyId'])
        .where('studyRun.id', '=', runId)
        .executeTakeFirst()

    if (!run) {
        return NextResponse.json({ status: 'fail', error: 'run not found' }, { status: 404 })
    }


    const formData = await req.formData()
    console.log(formData.keys())

    return new NextResponse('ok', { status: 200 })
}
