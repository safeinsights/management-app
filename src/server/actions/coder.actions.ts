'use server'

import { createUserAndWorkspace } from '../coder'
import { Action, z } from './action'

export const createUserAndWorkspaceAction = new Action('createUserAndWorkspaceAction', { performsMutations: true })
    .params(
        z.object({
            name: z.string().nonempty(),
            studyId: z.string().nonempty(),
        }),
    )
    .handler(async ({ params: { name, studyId }, session }) => {
        if (!session) throw new Error('Unauthorized')
        console.warn(`SESSION: ${JSON.stringify(session)}`)
        const userId = session.user.id
        return await createUserAndWorkspace(name, studyId, userId)
    })
