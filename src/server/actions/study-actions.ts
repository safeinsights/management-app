'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'
import { siUser } from '@/server/queries'
import { latestJobForStudy } from '@/server/actions/study-job-actions'
export const fetchStudiesForMember = async (memberIdentifier: string) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', 'study.memberId', 'member.id')
        .innerJoin('user as researcherUser', 'study.researcherId', 'researcherUser.id')
        .leftJoin('user as reviewerUser', 'study.reviewedBy', 'reviewerUser.id')
        .where('member.identifier', '=', memberIdentifier)
        .leftJoin(
            // Subquery to get the most recent study job for each study
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select([
                        'studyJob.studyId',
                        'studyJob.id as latestStudyJobId',
                        'studyJob.createdAt as studyJobCreatedAt',
                    ])
                    .distinctOn('studyId')
                    .orderBy('studyId')
                    .orderBy('createdAt', 'desc')
                    .as('latestStudyJob'),
            (join) => join.onRef('latestStudyJob.studyId', '=', 'study.id'),
        )
        .leftJoin(
            // Subquery to get the latest status change for the most recent study job
            (eb) =>
                eb
                    .selectFrom('jobStatusChange')
                    .select([
                        'jobStatusChange.studyJobId',
                        'jobStatusChange.status',
                        'jobStatusChange.createdAt as statusCreatedAt',
                    ])
                    .distinctOn('studyJobId')
                    .orderBy('studyJobId')
                    .orderBy('createdAt', 'desc')
                    .as('latestJobStatus'),
            (join) => join.onRef('latestJobStatus.studyJobId', '=', 'latestStudyJob.latestStudyJobId'),
        )
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
            'researcherUser.fullName as researcherName',
            'reviewerUser.fullName as reviewerName',
            'member.identifier as memberIdentifier',
            'latestStudyJob.latestStudyJobId',
            'latestStudyJob.studyJobCreatedAt',
            'latestJobStatus.status as latestJobStatus',
            'latestJobStatus.statusCreatedAt',
        ])
        .orderBy('study.createdAt', 'desc')
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
        .select('user.fullName as researcherName')
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}

export type SelectedStudy = NonNullable<Awaited<ReturnType<typeof getStudyAction>>>

export const approveStudyProposalAction = async (studyId: string) => {
    const { id } = await siUser()
    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date(), reviewedBy: id })
            .where('id', '=', studyId)
            .execute()

        // TODO Will transaction work when calling another method?
        const latestJob = await latestJobForStudy(studyId)

        await trx
            .insertInto('jobStatusChange')
            .values({
                userId: (await siUser()).id,
                // TODO Figure out correct job status
                status: 'JOB-READY',
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()
    })

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
}

export const rejectStudyProposalAction = async (studyId: string) => {
    const { id } = await siUser()

    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('study')
            .set({ status: 'REJECTED', approvedAt: new Date(), reviewedBy: id })
            .where('id', '=', studyId)
            .execute()

        // TODO Will transaction work when calling another method?
        const latestJob = await latestJobForStudy(studyId)

        await trx
            .insertInto('jobStatusChange')
            .values({
                userId: (await siUser()).id,
                // TODO Figure out correct job status
                status: 'CODE-SUBMITTED',
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()
    })

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
}
