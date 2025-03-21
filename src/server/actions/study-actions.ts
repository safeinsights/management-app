'use server'

import { db } from '@/database'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { StudyStatus } from '@/database/types'
import { revalidatePath } from 'next/cache'
import { generateRepositoryPath } from '@/server/aws'
import { deleteStudyFiles } from '@/server/aws'
import { auth } from '@clerk/nextjs/server'

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
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.dataSources',
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
        .select([
            'study.id',
            'study.approvedAt',
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.dataSources',
            'study.irbProtocols',
            'study.memberId',
            'study.outputMimeType',
            'study.piName',
            'study.researcherId',
            'study.status',
            'study.title',
        ])
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))
        .select('user.name as researcherName')
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export type SelectedStudy = NonNullable<Awaited<ReturnType<typeof getStudyAction>>>

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
        await trx.updateTable('study').set({ status }).where('id', '=', studyId).execute()

        // Update the appropriate timestamp field based on the new status
        if (status === 'APPROVED') {
            await trx.updateTable('study').set({ approvedAt: new Date() }).where('id', '=', studyId).execute()
        } else if (status === 'REJECTED') {
            await trx.updateTable('study').set({ rejectedAt: new Date() }).where('id', '=', studyId).execute()
        }
    })

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
}

export async function deleteStudyAndFiles(studyId: string) {
    // 1. Verify user has permission to delete the study
    const { userId } = auth()
    if (!userId) {
        throw new Error('Unauthorized')
    }

    // 2. Find the study details
    const study = await db
        .selectFrom('study')
        .selectAll()
        .where('id', '=', studyId)
        .executeTakeFirst()

    if (!study) {
        throw new Error('Study not found')
    }

    // 3. Delete files associated with the study
    const repoPath = generateRepositoryPath({
        memberIdentifier: study.memberId,
        studyId: study.id,
        studyTitle: study.title
    })

    // Delete files from S3 or local storage
    await deleteStudyFiles(repoPath)

    // 4. Delete related study jobs
    await db
        .deleteFrom('studyJob')
        .where('studyId', '=', studyId)
        .execute()

    // 5. Delete the study itself
    await db
        .deleteFrom('study')
        .where('id', '=', studyId)
        .execute()

    return { success: true, message: 'Study and associated files deleted successfully' }
}
