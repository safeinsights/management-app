'use server'

import { createUserAndWorkspace, getCoderWorkspaceStatus } from '../coder'
import { Action, z } from './action'
import { getInfoForStudyId } from '@/server/db/queries'

export const createUserAndWorkspaceAction = new Action('createUserAndWorkspaceAction', {})
    .params(
        z.object({
            orgSlug: z.string(),
            studyId: z.string().nonempty(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'Study')
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        return await createUserAndWorkspace(studyId)
    })

export const getWorkspaceStatusAction = new Action('getWorkspaceStatus', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
            workspaceId: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'Study')
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { workspaceId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        if (!workspaceId) return
        return await getCoderWorkspaceStatus(workspaceId)
    })
