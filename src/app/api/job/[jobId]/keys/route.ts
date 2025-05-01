import { db } from '@/database'
import { wrapApiOrgAction } from '@/server/api-wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiOrgAction(async (_req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId

    const publicKeys = await db
        .selectFrom('studyJob')
        .where('studyJob.id', '=', jobId)
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('orgUser', 'orgUser.orgId', 'study.orgId')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'orgUser.userId')
        .select(['studyJob.id as jobId', 'userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .execute()

    if (!publicKeys) {
        return NextResponse.json({ status: 'fail', error: 'Database query failed' }, { status: 404 })
    }

    return NextResponse.json({ keys: publicKeys }, { status: 200 })
})
