'use server'

import { createUserAndWorkspace } from '../coder'
import { Action, z } from './action'

export const createUserAndWorkspaceAction = new Action('createUserAndWorkspaceAction', {})
    .params(
        z.object({
            studyId: z.string().nonempty(),
        }),
    )
    .requireAbilityTo('load', 'IDE')
    .handler(async ({ params: { studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        return await createUserAndWorkspace(studyId)
    })
