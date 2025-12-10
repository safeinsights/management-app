'use server'

import { db } from '@/database'
import { Action, z } from '@/server/actions/action'
import { throwNotFound } from '@/lib/errors'

export const submitStudyAction = new Action('submitStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => {
        const study = await db
            .selectFrom('study')
            .select('orgId')
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId }
    })
    .requireAbilityTo('update', 'Study')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW' })
            .where('id', '=', studyId)
            .where('researcherId', '=', session.user.id)
            .execute()
    })

export const saveStudyAsDraftAction = new Action('saveStudyAsDraftAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => {
        const study = await db
            .selectFrom('study')
            .select('orgId')
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId }
    })
    .requireAbilityTo('update', 'Study')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        await db
            .updateTable('study')
            .set({ status: 'DRAFT' })
            .where('id', '=', studyId)
            .where('researcherId', '=', session.user.id)
            .execute()
    })
