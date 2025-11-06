'use server'

import { createUserAndWorkspace } from '../coder'
import { Action, z } from './action'
import { getOrgIdFromSlug } from '@/server/db/queries'

export const createUserAndWorkspaceAction = new Action('createUserAndWorkspaceAction', {})
    .params(
        z.object({
            orgSlug: z.string(),
            studyId: z.string().nonempty(),
        }),
    )
    .middleware(async ({ params: { orgSlug } }) => await getOrgIdFromSlug({ orgSlug }))
    .requireAbilityTo('create', 'Study')
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        return await createUserAndWorkspace(studyId)
    })
