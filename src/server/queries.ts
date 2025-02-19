import { db } from '@/database'
import { MinimalJobResultsInfo } from '@/lib/types'

export const queryJobResult = async (jobId: string) =>
    (await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select(['studyJob.id as studyJobId', 'studyId', 'resultsPath', 'member.identifier as memberIdentifier'])
        .where('studyJob.id', '=', jobId)
        .where('studyJob.status', '=', 'RUN-COMPLETE')
        .where('studyJob.resultsPath', 'is not', null)
        .executeTakeFirst()) as MinimalJobResultsInfo | undefined
