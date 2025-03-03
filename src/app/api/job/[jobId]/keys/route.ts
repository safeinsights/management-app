import { db } from '@/database'

export const GET = async (req: Request, { params }: { params: Promise<{jobId: string}> }) => {
  const jobId = (await params).jobId

  // TODO: return a public key per *member user*, not per member
  const publicKeys = await db
    .selectFrom('studyJob')
    .innerJoin('study', 'study.id', 'studyJob.studyId')
    .innerJoin('member', 'member.id', 'study.memberId')
    .select(['studyJob.id as studyJobId', 'studyId', 'study.memberId', 'member.public_key as memberPublicKey'])
    .where('studyJob.id', '=', jobId)
    .execute()

  return Response.json( { 'keys': publicKeys } )
}
