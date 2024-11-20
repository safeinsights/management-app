import { db } from '@/database'
import { MinimalRunResultsInfo } from '@/lib/types'

export const queryRunResult = async (runId: string) =>
    (await db
        .selectFrom('studyRun')
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select(['studyRun.id as studyRunId', 'studyId', 'resultsPath', 'member.identifier as memberIdentifier'])
        .where('studyRun.id', '=', runId)
        .where('studyRun.status', '=', 'COMPLETED')
        .where('studyRun.resultsPath', 'is not', null)
        .executeTakeFirst()) as MinimalRunResultsInfo | undefined
