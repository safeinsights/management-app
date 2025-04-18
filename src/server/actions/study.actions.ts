'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'

import {
    getOrgSlugFromActionContext,
    getUserIdFromActionContext,
    memberAction,
    researcherAction,
    userAction,
    z,
} from './wrappers'
import { latestJobForStudy } from '@/server/db/queries'
import { checkMemberAllowedStudyReview } from '../db/queries'
import { StudyJobStatus } from '@/database/types'
import { SIMULATE_IMAGE_BUILD } from '../config'
import { triggerBuildImageForJob } from '../aws'
import logger from '@/lib/logger'

export const fetchStudiesForCurrentMemberAction = memberAction(async () => {
    const slug = await getOrgSlugFromActionContext()

    return await db
        .selectFrom('study')
        .innerJoin('member', (join) => join.on('member.slug', '=', slug).onRef('study.memberId', '=', 'member.id'))
        .leftJoin('user as reviewerUser', 'study.reviewerId', 'reviewerUser.id')
        .leftJoin('user as researcherUser', 'study.researcherId', 'researcherUser.id')
        .leftJoin(
            // Subquery to get the most recent study job for each study
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select(['studyJob.studyId', 'studyJob.id as jobId', 'studyJob.createdAt as studyJobCreatedAt'])
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
            (join) => join.onRef('latestJobStatus.studyJobId', '=', 'latestStudyJob.jobId'),
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
            'member.slug as memberSlug',
            'latestJobStatus.status as latestJobStatus',
            'latestStudyJob.jobId as latestStudyJobId',
        ])
        .orderBy('study.createdAt', 'desc')
        .execute()
})

export const fetchStudiesForCurrentResearcherAction = researcherAction(async () => {
    const userId = await getUserIdFromActionContext()

    return await db
        .selectFrom('study')
        .innerJoin('memberUser', (join) => join.onRef('memberUser.memberId', '=', 'study.memberId'))
        .innerJoin('member', (join) => join.onRef('member.id', '=', 'memberUser.memberId'))
        .innerJoin('user', (join) => join.on('user.isResearcher', '=', true).onRef('memberUser.userId', '=', 'user.id'))

        .where('memberUser.userId', '=', userId)

        .leftJoin(
            // Subquery to get the most recent study job for each study
            (eb) =>
                eb
                    .selectFrom('studyJob')
                    .select(['studyJob.studyId', 'studyJob.id as jobId', 'studyJob.createdAt as studyJobCreatedAt'])
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
            (join) => join.onRef('latestJobStatus.studyJobId', '=', 'latestStudyJob.jobId'),
        )
        .select([
            'study.id',
            'study.title',
            'study.piName',
            'study.status',
            'study.createdAt',
            'member.name as reviewerTeamName',
            'latestJobStatus.status as latestJobStatus',
            'latestStudyJob.jobId as latestStudyJobId',
        ])
        .orderBy('study.createdAt', 'desc')
        .execute()
})

export const getStudyAction = userAction(async (studyId) => {
    const userId = await getUserIdFromActionContext()

    return await db
        .selectFrom('study')

        .innerJoin('memberUser', (join) =>
            join.on('userId', '=', userId).onRef('memberUser.memberId', '=', 'study.memberId'),
        )
        .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))

        .where('memberUser.userId', '=', userId)
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
            'study.descriptionDocPath',
            'study.irbDocPath',
            'study.reviewerId',
            'study.agreementDocPath',
        ])
        .select('researcher.fullName as researcherName')
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}, z.string())

export type SelectedStudy = NonNullable<Awaited<ReturnType<typeof getStudyAction>>>

export const approveStudyProposalAction = memberAction(async (studyId: string) => {
    await checkMemberAllowedStudyReview(studyId)
    const userId = await getUserIdFromActionContext()
    const slug = await getOrgSlugFromActionContext()

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        // Update the status of the study
        await trx
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date(), rejectedAt: null, reviewerId: userId })
            .where('id', '=', studyId)
            .execute()

        const latestJob = await latestJobForStudy(studyId, { orgSlug: slug, userId }, trx)
        if (!latestJob) throw new Error(`No job found for study id: ${studyId}`)

        let status: StudyJobStatus = 'CODE-APPROVED'

        // if we're not using s3 then containers will never build so just mark it ready
        if (SIMULATE_IMAGE_BUILD) {
            status = 'JOB-READY'
        } else {
            await triggerBuildImageForJob({
                studyJobId: latestJob.id,
                studyId,
                memberSlug: slug,
            })
        }
        await trx
            .insertInto('jobStatusChange')
            .values({
                userId,
                status,
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()
    })

    logger.info('Study Approved', {
        reviewerId: userId,
        studyId: studyId,
    })

    revalidatePath(`/member/[memberSlug]/study/${studyId}`, 'page')
}, z.string())

export const rejectStudyProposalAction = memberAction(async (studyId: string) => {
    await checkMemberAllowedStudyReview(studyId)
    const userId = await getUserIdFromActionContext()

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('study')
            .set({ status: 'REJECTED', rejectedAt: new Date(), approvedAt: null, reviewerId: userId })
            .where('id', '=', studyId)
            .execute()

        const latestJob = await latestJobForStudy(studyId, { userId }, trx)
        if (!latestJob) throw new Error(`No job found for study id: ${studyId}`)

        await trx
            .insertInto('jobStatusChange')
            .values({
                userId: userId,
                status: 'CODE-REJECTED',
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()
    })

    logger.info('Study Rejected', {
        reviewerId: userId,
        studyId: studyId,
    })

    revalidatePath(`/member/[memberSlug]/study/${studyId}`, 'page')
}, z.string())
