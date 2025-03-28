'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'
import { siUser } from '@/server/db/queries'
import { getOrgSlugFromActionContext, memberAction, z, userAction, actionContext } from './wrappers'
import { checkMemberAllowedStudyReview } from '../db/queries'
import { latestJobForStudyAction } from '@/server/actions/study-job.actions'
import { StudyJobStatus } from '@/database/types'
import { USING_S3_STORAGE } from '../config'
import { storeStudyCodeFile } from '../storage'

export const fetchStudiesForCurrentMemberAction = memberAction(async () => {
    return await db
        .selectFrom('study')
        .innerJoin('member', (join) =>
            join.on('member.identifier', '=', getOrgSlugFromActionContext()).onRef('study.memberId', '=', 'member.id'),
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
    const ctx = actionContext()
    return await db
        .selectFrom('study')
        .innerJoin('user', (join) => join.onRef('study.researcherId', '=', 'user.id'))

        // security, check user has access to record
        .$if(Boolean(ctx?.orgSlug), (qb) =>
        qb.innerJoin('member', (join) =>
            join
                .on('member.identifier', '=', getOrgSlugFromActionContext())
                .onRef('member.id', '=', 'study.memberId'),
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
        ])

        .select('user.fullName as researcherName')
        .where('study.id', '=', studyId)
        .executeTakeFirst()
}, z.string())

export type SelectedStudy = NonNullable<Awaited<ReturnType<typeof getStudyAction>>>

export const approveStudyProposalAction = memberAction(async (studyId: string) => {
    await checkMemberAllowedStudyReview(studyId)
    const { id } = await siUser()

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('study')
            .set({ status: 'APPROVED', approvedAt: new Date(), reviewerId: id })
            .where('id', '=', studyId)
            .execute()

        // TODO Will transaction work when calling another method?
        const latestJob = await latestJobForStudyAction(studyId)
        let status: StudyJobStatus = 'CODE-APPROVED'
        const userId = (await siUser()).id
        if (USING_S3_STORAGE) {
            await storeStudyCodeFile(
                {
                    memberIdentifier: getOrgSlugFromActionContext(),
                    studyId,
                    studyJobId: latestJob.id,
                },
                new File([`userId: ${userId}`], 'APPROVED', { type: 'text/plain' }),
            )
        } else {
            status = 'JOB-READY' // if we're in dev and not using s3 then containers will never build so just mark it ready
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

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
}, z.string())

export const rejectStudyProposalAction = memberAction(async (studyId: string) => {
    await checkMemberAllowedStudyReview(studyId)
    const { id } = await siUser()

    // Start a transaction to ensure atomicity
    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('study')
            .set({ status: 'REJECTED', approvedAt: new Date(), reviewerId: id })
            .where('id', '=', studyId)
            .execute()

        // TODO Will transaction work when calling another method?
        const latestJob = await latestJobForStudyAction(studyId)

        await trx
            .insertInto('jobStatusChange')
            .values({
                userId: (await siUser()).id,
                status: 'CODE-REJECTED',
                studyJobId: latestJob.id,
            })
            .executeTakeFirstOrThrow()
    })

    revalidatePath(`/member/[memberIdentifier]/study/${studyId}`, 'page')
}, z.string())
