'use server'

import { getInfoForStudyId } from '@/server/db/queries'
import { createUserAndWorkspace, getCoderWorkspaceUrl } from '../coder'
import { Action, z } from './action'

export const createUserAndWorkspaceAction = new Action('createUserAndWorkspaceAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        return await createUserAndWorkspace(studyId)
    })

export const getWorkspaceUrlAction = new Action('getWorkspaceUrlAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
            workspaceId: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId, workspaceId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        if (!workspaceId) return
        return await getCoderWorkspaceUrl(studyId, workspaceId)
    })
