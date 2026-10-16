'use server'

import { ActionFailure, throwNotFound } from '@/lib/errors'
import { ActionSuccessType } from '@/lib/types'
import { markStudyOpened } from '@/server/db/mutations'
import { toRecord } from '@/lib/permissions'
import { Action, z } from './action'
import { withStudyAccessSubject } from './study-subject'
import { fetchStudyQuery } from '@/server/db/study-query'

// Recorded from the client on entering and leaving a study, not during its render: a render-time
// write would fire on link prefetch. Viewing is not a change, so Last updated is left alone.
export const markStudyOpenedAction = new Action('markStudyOpenedAction', { performsMutations: true })
    .params(z.object({ studyId: z.string().uuid() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, session, db }) => {
        await markStudyOpened(db, { studyId, userId: session.user.id })
    })

export const getStudyAction = new Action('getStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ params: { studyId }, db }) => {
        return await fetchStudyQuery(db)
            .where('study.id', '=', studyId)
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('org as submittingOrg', 'submittingOrg.id', 'study.submittedByOrgId')
            .select([
                'org.slug as orgSlug',
                'org.name as orgName',
                'submittingOrg.slug as submittedByOrgSlug',
                'submittingOrg.name as submittingLabName',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'study.language',
            ])
            .executeTakeFirstOrThrow(throwNotFound('Study'))
    })

export type SelectedStudy = ActionSuccessType<typeof getStudyAction>

export const ackAgreementsAction = new Action('ackAgreementsAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), role: z.enum(['researcher', 'reviewer']) }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('view', 'Study')
    .handler(async ({ orgId, submittedByOrgId, params: { studyId, role }, db, session }) => {
        const userOrgIds = new Set(Object.values(session?.orgs ?? {}).map((org) => org.id))

        // Scoped to the rendered role: a user in both orgs would otherwise ack both columns at
        // once, silently consuming the reviewer's gate (OTTER-546).
        const requiredOrgId = role === 'reviewer' ? orgId : submittedByOrgId
        // SI admins review studies for orgs they do not belong to; the researcher path stays
        // membership-only.
        const canReviewStudy = role === 'reviewer' && session.can('review', toRecord('Study', { orgId }))
        if (!userOrgIds.has(requiredOrgId) && !canReviewStudy) {
            throw new ActionFailure({ user: `not a member of the study ${role} org` })
        }

        const column = role === 'reviewer' ? 'reviewerAgreementsAckedAt' : 'researcherAgreementsAckedAt'
        await db
            .updateTable('study')
            .set({ [column]: new Date() })
            .where('id', '=', studyId)
            .where(column, 'is', null)
            .execute()
    })

export const softDeleteStudyAction = new Action('softDeleteStudyAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(withStudyAccessSubject)
    .requireAbilityTo('delete', 'Study')
    .handler(async ({ db, params: { studyId }, session }) => {
        const study = await db
            .selectFrom('study')
            .select(['status', 'title', 'researcherId'])
            .where('id', '=', studyId)
            .where('deletedAt', 'is', null)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        if (study.status !== 'DRAFT') {
            throw new ActionFailure({ study: 'only draft studies can be deleted' })
        }
        if (study.researcherId !== session.user.id) {
            throw new ActionFailure({ user: 'only the draft author can delete this proposal' })
        }
        await db.updateTable('study').set({ deletedAt: new Date() }).where('id', '=', studyId).execute()
        return { title: study.title }
    })
