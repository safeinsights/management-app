import { db } from '@/database'
import { wrapApiMemberAction } from '@/server/wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiMemberAction(async ({ params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId
    if (!jobId) {
        return new NextResponse('Job id not provided', { status: 400 })
    }

    const publicKeys = await db
        .selectFrom('studyJob')
        .where('studyJob.id', '=', jobId)
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .innerJoin('memberUserPublicKey', 'memberUserPublicKey.userId', 'memberUser.userId')
        .select(['studyJob.id as jobId', 'memberUserPublicKey.value as publicKey', 'memberUserPublicKey.fingerprint'])
        .execute()

    if (!publicKeys) {
        return NextResponse.json({ status: 'fail', error: 'Database query failed' }, { status: 404 })
    }

    return NextResponse.json({ keys: publicKeys }, { status: 200 })
})
