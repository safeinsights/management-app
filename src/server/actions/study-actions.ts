'use server'

import { db } from '@/database'
import { jsonArrayFrom } from 'kysely/helpers/postgres'

export const fetchStudiesForMember = async (memberIdentifier: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', memberIdentifier).onRef('study.memberId', '=', 'member.id'),
        )
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))
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
            'user.name as researcherName',
        ])
        .orderBy('study.createdAt', 'desc')
        .where('study.status', '!=', 'INITIATED')
        .execute()
}

export const getStudyAction = async (studyId: string) => {
    return await db.selectFrom('study').selectAll().where('id', '=', studyId).executeTakeFirst()
}

export const onFetchStudyJobsAction = async (studyId: string) => {
    return await db
        .selectFrom('studyJob')
        .select((eb) => [
            'studyJob.id',
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['status', 'message', 'createdAt'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                    .orderBy('createdAt'),
            ).as('statuses'),
        ])
        .where('studyId', '=', studyId)
        .execute()
}
