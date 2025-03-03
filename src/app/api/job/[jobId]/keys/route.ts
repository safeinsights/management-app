import { db } from '@/database'

export const GET = async (req: Request, { params }: { params: Promise<{jobId: string}> }) => {
  const jobId = (await params).jobId

  // TODO: all the joins
  const publicKeys = await db
    .selectFrom('studyJob')
    .selectAll()
    .where('studyJob.id', '=', jobId)
    .execute()

  return Response.json( { 'test': publicKeys } )
}
