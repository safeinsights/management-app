'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'
import {
    getOrgSlugFromActionContext,
    memberAction,
    z,
    userAction,
    actionContext,
    getUserIdFromActionContext,
} from './wrappers'
import { latestJobForStudy } from '@/server/db/queries'
import { checkMemberAllowedStudyReview } from '../db/queries'
import { StudyJobStatus } from '@/database/types'
import { USING_S3_STORAGE } from '../config'
import { triggerBuildImageForJob } from '../aws'
import logger from '@/lib/logger'

export const fetchStudiesForCurrentMemberAction = memberAction(async () => {
    const slug = await getOrgSlugFromActionContext()

    return await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', slug).onRef('study.memberId', '=', 'member.id'),
        )
        .leftJoin('user as reviewerUser', 'study.reviewerId', 'reviewerUser.id')
        .leftJoin('user as researcherUser', 'study.researcherId', 'researcherUser.id')
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
            'latestJobStatus.status as latestJobStatus',
        ])
        .orderBy('study.createdAt', 'desc')
        .execute()
})

export const getStudyAction = userAction(async (studyId) => {
    const ctx = await actionContext()

    return await db
        .selectFrom('study')
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))

        // security, check user has access to record
        .$if(Boolean(ctx?.orgSlug), (qb) =>
            qb.innerJoin('member', (join) =>
                join.on('member.identifier', '=', ctx.orgSlug!).onRef('member.id', '=', 'study.memberId'),
            ),
        )
        .$if(Boolean(ctx?.userId && !ctx?.orgSlug), (qb) => qb.where('study.researcherId', '=', ctx?.userId || ''))

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
        .select('user.fullName as researcherName')
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

        const latestJob = await latestJobForStudy(studyId, trx)
        if (!latestJob) throw new Error(`No job found for study id: ${studyId}`)

        let status: StudyJobStatus = 'CODE-APPROVED'

        if (USING_S3_STORAGE) {
            await triggerBuildImageForJob({
                studyJobId: latestJob.id,
                studyId,
                memberIdentifier: slug,
            })
        } else {
            status = 'JOB-READY' // if we're not using s3 then containers will never build so just mark it ready
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

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
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

        const latestJob = await latestJobForStudy(studyId, trx)
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

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
}, z.string())
