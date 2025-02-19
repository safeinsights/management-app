export const dynamic = 'force-dynamic' // defaults to auto

import { db } from '@/database'
import { z } from 'zod'
import { NextResponse } from 'next/server'

const schema = z.object({
    jobId: z.string().uuid(),
})

export async function POST(req: Request) {
    const body = schema.parse(await req.json())

    await db
        .insertInto('jobStatusChange')
        .values({
            studyJobId: body.jobId,
            status: 'CODE-SUBMITTED',
        })
        .execute()

    return new NextResponse('ok', { status: 200 })
}
