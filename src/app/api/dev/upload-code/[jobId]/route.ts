import { db } from '@/database'
import { NextResponse } from 'next/server'
import { PROD_ENV } from '@/server/config'
import { getUploadTmpDirectory } from '@/server/config'
import { pathForStudyJobCode } from '@/lib/paths'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic' // defaults to auto

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await params
    if (PROD_ENV) {
        return NextResponse.json({ error: 'This route is only available in development' }, { status: 403 })
    }

    const info = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select(['studyJob.id as studyJobId', 'studyId', 'member.identifier as memberIdentifier'])
        .where('studyJob.id', '=', jobId)
        .executeTakeFirst()

    if (!info) {
        return NextResponse.json({ status: 'fail', error: 'job not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    const dir = path.join(getUploadTmpDirectory(), pathForStudyJobCode(info), path.dirname(file.name))
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, path.basename(file.name))
    const buffer = await file.arrayBuffer()
    await fs.promises.writeFile(filePath, Buffer.from(buffer))

    await db
        .updateTable('studyJob')
        .set({
            status: 'CODE-SUBMITTED',
        })
        .where('id', '=', info.studyJobId)
        .executeTakeFirstOrThrow()

    return new NextResponse('ok', { status: 200 })
}
