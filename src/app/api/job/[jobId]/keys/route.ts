import { db } from '@/database'

export const GET = async (req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId

    const publicKeys = await db
        .selectFrom('studyJob')
        .where('studyJob.id', '=', jobId)
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('memberUser', 'memberUser.memberId', 'study.memberId')
        .innerJoin('memberUserPublicKey', 'memberUserPublicKey.userId', 'memberUser.userId')
        .select(['studyJob.id as jobId', 'memberUserPublicKey.value as publicKey', 'memberUserPublicKey.fingerprint'])
        .execute()

    return Response.json({ keys: publicKeys })
}
