export const dynamic = 'force-dynamic' // defaults to auto

import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'

export const schema = z.object({
    runId: z.string().uuid(),
    codePath: z.string(),
    fileSize: z.number(),
    fileCount: z.number(),
})


export async function POST(req: Request) {
    const body = schema.parse(await req.json())

    await db.updateTable('studyRun')
        .where('id', '=', body.runId)
        .where('status', '=', 'initiated')
        .set({
            status: 'in-queue',
            codePath: body.codePath,
            uploadedAt: new Date(),
            fileSize: body.fileSize,
            fileCount: body.fileCount,
        })
        .execute()

    return new NextResponse('ok', { status: 200 })
}
