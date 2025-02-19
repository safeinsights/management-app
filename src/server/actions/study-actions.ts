'use server'

import { db } from '@/database'

export const fetchStudiesForMember = async (memberIdentifier: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', memberIdentifier).onRef('study.memberId', '=', 'member.id'),
        )
        .select([
            'study.id',
            'study.approvedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.dataSources',
            'study.description',
            'study.irbProtocols',
            'study.memberId',
            'study.outputMimeType',
            'study.piName',
            'study.researcherId',
            'study.status',
            'study.title',
        ])
        .orderBy('study.createdAt', 'desc')
        .where('study.status', '!=', 'INITIATED')
        .execute()
}

export const getStudyAction = async (studyId: string) => {
    return await db.selectFrom('study').selectAll().where('id', '=', studyId).executeTakeFirst()
}
