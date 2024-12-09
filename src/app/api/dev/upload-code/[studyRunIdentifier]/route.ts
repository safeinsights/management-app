import { db } from '@/database'
import { NextResponse } from 'next/server'
import { PROD_ENV } from '@/server/config'

import { devStoreCodeFile } from '@/server/dev/code-files'

export const dynamic = 'force-dynamic' // defaults to auto

export async function POST(
    req: Request,
    { params: { studyRunIdentifier } }: { params: { studyRunIdentifier: string } },
) {
    if (PROD_ENV) {
        return NextResponse.json({ error: 'This route is only available in development' }, { status: 403 })
    }

    const info = await db
        .selectFrom('studyRun')
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select(['studyRun.id as studyRunId', 'studyId', 'member.identifier as memberIdentifier'])
        .where('studyRun.id', '=', studyRunIdentifier)
        .executeTakeFirst()

    if (!info) {
        return NextResponse.json({ status: 'fail', error: 'run not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
        return NextResponse.json({ status: 'fail', error: 'file not found' }, { status: 400 })
    }
    await devStoreCodeFile(info, file)

    await db
        .updateTable('studyRun')
        .set({
            status: 'CODE-SUBMITTED',
        })
        .where('id', '=', info.studyRunId)
        .executeTakeFirstOrThrow()

    return new NextResponse('ok', { status: 200 })
}
