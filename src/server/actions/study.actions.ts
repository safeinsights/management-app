'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'
import { z, memberAction, getUserIdFromActionContext } from './wrappers'
import { checkMemberAllowedStudyReview } from '../db/queries'

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

export const updateStudyStatusAction = memberAction(
    async ({ studyId, status }) => {
        await checkMemberAllowedStudyReview(studyId)

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
    },
    z.object({ studyId: z.string(), status: z.enum(['APPROVED', 'REJECTED']) }),
)
