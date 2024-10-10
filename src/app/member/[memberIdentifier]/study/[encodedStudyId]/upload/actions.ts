'use server'

import { b64toUUID } from '@/server/uuid'
import { db } from '@/database'

export const getPendingStudyRunAction = async ({
    memberIdentifier,
    encodedStudyId,
}: {
    memberIdentifier: string
    encodedStudyId: string
}) => {
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
                    .where('status', '=', 'created')
                    .select('id as runId')
                    .orderBy('createdAt desc')
                    .limit(1)
                    .as('pendingRunId'),
        ])
        .where('study.id', '=', b64toUUID(encodedStudyId))
        .where('member.identifier', '=', memberIdentifier)
        .executeTakeFirst()
}
