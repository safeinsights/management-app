'use server'

import { b64toUUID } from '@/lib/uuid'
import { db } from '@/database'

export const getPendingStudyRunAction = async ({ encodedStudyId }: { encodedStudyId: string }) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select([
            'study.id',
            'study.title',
            'study.containerLocation',
            'member.name as memberName',

            ({ selectFrom }) =>
                selectFrom('studyRun')
                    .whereRef('study.id', '=', 'studyRun.studyId')
                    .where('status', '=', 'INITIATED')
                    .select('id as runId')
                    .orderBy('study.createdAt desc')
                    .limit(1)
                    .as('pendingRunId'),
        ])
        .where('study.id', '=', b64toUUID(encodedStudyId))
        .executeTakeFirst()
}
