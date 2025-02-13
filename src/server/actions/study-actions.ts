'use server'

import { db } from '@/database'

export const fetchStudiesForMember = async (memberIdentifier: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', memberIdentifier).onRef('study.memberId', '=', 'member.id'),
        )
        .orderBy('study.createdAt', 'desc')
        .selectAll()
        // .select(['study.id', 'piName', 'status', 'title'])
        .where('study.status', '!=', 'INITIATED')
        .execute()
}

export const getStudyAction = async (studyId: string) => {
    return await db.selectFrom('study').selectAll().where('id', '=', studyId).executeTakeFirst()
}
