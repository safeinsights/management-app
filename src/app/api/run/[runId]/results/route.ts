export const dynamic = 'force-dynamic' // defaults to auto
import { db } from '@/database'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { wrapApiMemberAction, requestingMember } from '@/server/wrappers'
import { PROD_ENV, getUploadTmpDirectory } from '@/server/config'
import { storeS3File } from '@/server/aws'

export const POST = wrapApiMemberAction(async (req: Request, { params: { runId } }: { params: { runId: string } }) => {
    const member = requestingMember()
    if (!member) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const formData = await req.formData()

        const file = formData.get('file') as File
        const arrayBuffer = await file.arrayBuffer()
        const buffer = new Uint8Array(arrayBuffer)

        const tmpDir = getUploadTmpDirectory()
        const filePath = path.join(tmpDir, file.name)
        await fs.promises.writeFile(filePath, buffer)

        let resultsPath = filePath
        if (PROD_ENV) {
            resultsPath = await storeS3File(`s3://${process.env.BUCKET_NAME}/${file.name}`, filePath)
        }

        await db
            .updateTable('studyRun')
            .set({
                status: 'complete',
                resultsPath: resultsPath,
            })
            .where('id', '=', runId)
            .execute()

        return NextResponse.json({ status: 'success' }, { status: 200 })
    } catch (e) {
        console.error(e)
        return NextResponse.json({ status: 'fail', error: e }, { status: 500 })
    }
})
