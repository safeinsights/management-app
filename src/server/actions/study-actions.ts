'use server'

import { db } from '@/database'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { StudyStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'

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
    return await db
        .selectFrom('study')
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))
        .selectAll()
        .select('user.name as researcherName')
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('studyJob')
                    .selectAll()
                    // .select(['id', 'resultFormat', 'resultsPath', 'createdAt'])
                    .whereRef('studyJob.studyId', '=', 'study.id')
                    .orderBy('createdAt'),
            ).as('jobs'),
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export const onFetchStudyJobsAction = async (studyId: string) => {
    return await db
        .selectFrom('studyJob')
        .select('studyJob.id')
        .select((eb) => [
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

const AllowedStatusChanges: Array<StudyStatus> = ['APPROVED', 'REJECTED'] as const

export const updateStudyStatusAction = async (studyId: string, status: StudyStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this

    if (!AllowedStatusChanges.includes(status)) {
        throw new Error('Invalid status')
    }

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        // Update the status of the study
        await trx.updateTable('study').set({ status }).where('id', '=', studyId).executeTakeFirstOrThrow()

        // Update the appropriate timestamp field based on the new status
        if (status === 'APPROVED') {
            await trx
                .updateTable('study')
                .set({ approvedAt: new Date() })
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
        } else if (status === 'REJECTED') {
            await trx
                .updateTable('study')
                .set({ rejectedAt: new Date() })
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
        }
    })

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`)
}
