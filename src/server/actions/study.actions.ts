'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'
import { siUser } from '@/server/queries'
import { z, memberAction, getUserIdFromActionContext } from './wrappers'
import { checkMemberAllowedStudyReview } from '../db/queries'
import { latestJobForStudyAction } from '@/server/actions/study-job.actions'

export const fetchStudiesForMemberAction = memberAction(async (memberIdentifier) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', memberIdentifier).onRef('study.memberId', '=', 'member.id'),
        )
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))

        // security, check user has access to record
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )

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
            'user.fullName as researcherName',
            'member.identifier as memberIdentifier',
            'latestStudyJob.latestStudyJobId',
            'latestStudyJob.studyJobCreatedAt',
            'latestJobStatus.status as latestJobStatus',
            'latestJobStatus.statusCreatedAt',
        ])
        .orderBy('study.createdAt', 'desc')
        .execute()
}, z.string())

export const getStudyAction = memberAction(async (studyId) => {
    return await db
        .selectFrom('study')
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))

        // security, check user has access to record
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
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
        ])

        .select('user.fullName as researcherName')
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}, z.string())

export type SelectedStudy = NonNullable<Awaited<ReturnType<typeof getStudyAction>>>

export const approveStudyProposalAction = async (studyId: string) => {
    checkMemberAllowedStudyReview(studyId)

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        // Update the status of the study
        await trx
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date() })
            .where('id', '=', studyId)
            .execute()

        // TODO Will transaction work when calling another method?
        const latestJob = await latestJobForStudyAction(studyId)

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
    checkMemberAllowedStudyReview(studyId)

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        // Update the status of the study
        await trx
            .updateTable('study')
            .set({ status: 'REJECTED', approvedAt: new Date() })
            .where('id', '=', studyId)
            .execute()

        // TODO Will transaction work when calling another method?
        const latestJob = await latestJobForStudyAction(studyId)

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
