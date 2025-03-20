import { db } from '@/database'
import { wrapApiMemberAction } from '@/server/wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiMemberAction(async (_req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId

    const publicKeys = await db
        .selectFrom('studyJob')
        .where('studyJob.id', '=', jobId)
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'memberUser.userId')
        .select(['studyJob.id as jobId', 'userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .execute()

    if (!publicKeys) {
        return NextResponse.json({ status: 'fail', error: 'Database query failed' }, { status: 404 })
    }

    return NextResponse.json({ keys: publicKeys }, { status: 200 })
})
