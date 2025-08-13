
'use server'

import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { Action, z } from './action'

export const setLastDashboardUrlAction = new Action('setLastDashboardUrlAction')
    .params(
        z.object({
            url: z.string(),
        }),
    )
    .handler(async ({ params }) => {
        const user = await currentUser()
        if (!user) {
            return
        }

        await (await clerkClient()).users.updateUserMetadata(user.id, {
            unsafeMetadata: {
                ...user.unsafeMetadata,
                lastDashboardUrl: params.url,
            },
        })
    })
