'use server'

import { getInfoForStudyId } from '@/server/db/queries'
import { createUserAndWorkspace, getCoderWorkspaceUrl } from '../coder'
import { DEV_ENV, CI_ENV, CODER_DISABLED } from '../config'
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
        if (CODER_DISABLED) {
            return {
                success: true,
                workspace: { id: `dev-workspace-${studyId}` },
            }
        }
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
        if (CODER_DISABLED) {
            // these envs do not have a 'real' coder setup
            await new Promise((resolve) => setTimeout(resolve, 3000))
            return `https://coder.dev.example.com/workspace/${studyId}`
        }
        return await getCoderWorkspaceUrl(studyId, workspaceId)
    })
