'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'

import {
    checkMemberOfOrgWithSlug,
    getUserIdFromActionContext,
    orgAction,
    researcherAction,
    userAction,
    z,
} from './wrappers'
import { latestJobForStudy } from '@/server/db/queries'
import { checkUserAllowedStudyReview } from '../db/queries'
import { StudyJobStatus } from '@/database/types'
import { SIMULATE_IMAGE_BUILD } from '../config'
import { triggerBuildImageForJob } from '../aws'
import logger from '@/lib/logger'

export const fetchStudiesForOrgAction = orgAction(
    async ({ orgSlug }) => {
        return await db
            .selectFrom('study')
            .innerJoin('org', (join) => join.on('org.slug', '=', orgSlug).onRef('study.orgId', '=', 'org.id'))
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
                'study.orgId',
                'study.outputMimeType',
                'study.piName',
                'study.researcherId',
                'study.status',
                'study.title',
                'researcherUser.fullName as researcherName',
                'reviewerUser.fullName as reviewerName',
                'org.slug as orgSlug',
                'latestJobStatus.status as latestJobStatus',
                'latestStudyJob.jobId as latestStudyJobId',
            ])
            .orderBy('study.createdAt', 'desc')
            .execute()
    },
    z.object({
        orgSlug: z.string(),
    }),
)

export const fetchStudiesForCurrentResearcherAction = researcherAction(async () => {
    const userId = await getUserIdFromActionContext()

    return await db
        .selectFrom('study')
        .innerJoin('orgUser', (join) =>
            join.onRef('orgUser.orgId', '=', 'study.orgId').on('orgUser.isResearcher', '=', true),
        )

        .innerJoin('org', (join) => join.onRef('org.id', '=', 'orgUser.orgId'))
        .where('orgUser.userId', '=', userId)

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
            'org.name as reviewerTeamName',
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

        .innerJoin('orgUser', (join) => join.on('userId', '=', userId).onRef('orgUser.orgId', '=', 'study.orgId'))
        .innerJoin('user as researcher', (join) => join.onRef('study.researcherId', '=', 'researcher.id'))

        .where('orgUser.userId', '=', userId)
        .select([
            'study.id',
            'study.approvedAt',
            'study.rejectedAt',
            'study.containerLocation',
            'study.createdAt',
            'study.dataSources',
            'study.irbProtocols',
            'study.orgId',
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

export const approveStudyProposalAction = orgAction(
    async ({ studyId, orgSlug }) => {
        await checkUserAllowedStudyReview(studyId)
        const userId = await getUserIdFromActionContext()
        await checkMemberOfOrgWithSlug(orgSlug)

        // Start a transaction to ensure atomicity
        await db.transaction().execute(async (trx) => {
            // Update the status of the study
            await trx
                .updateTable('study')
                .set({ status: 'APPROVED', approvedAt: new Date(), rejectedAt: null, reviewerId: userId })
                .where('id', '=', studyId)
                .execute()

            const latestJob = await latestJobForStudy(studyId, { orgSlug, userId }, trx)
            if (!latestJob) throw new Error(`No job found for study id: ${studyId}`)

            let status: StudyJobStatus = 'CODE-APPROVED'

            // if we're not connected to AWS codebuild, then containers will never build so just mark it ready
            if (SIMULATE_IMAGE_BUILD) {
                status = 'JOB-READY'
            } else {
                await triggerBuildImageForJob({
                    studyJobId: latestJob.id,
                    studyId,
                    orgSlug: orgSlug,
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

        revalidatePath(`/reviewer/[orgSlug]/study/${studyId}`, 'page')
    },
    z.object({
        studyId: z.string(),
        orgSlug: z.string(),
    }),
)

export const rejectStudyProposalAction = orgAction(
    async ({ studyId, orgSlug }) => {
        await checkUserAllowedStudyReview(studyId)
        const userId = await getUserIdFromActionContext()
        await checkMemberOfOrgWithSlug(orgSlug)

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

        revalidatePath(`/reviewer/[orgSlug]/study/${studyId}`, 'page')
    },
    z.object({
        studyId: z.string(),
        orgSlug: z.string(),
    }),
)
