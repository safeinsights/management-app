import 'dotenv/config'
import { PROD_BUILD } from '@/server/config'
import { isTestUser, getGitHubRunKey, getProtectedTestEmails } from '@/lib/clerk'
import { createClerkClient } from '@clerk/backend'
import dayjs from 'dayjs'

export async function deleteClerkTestUsers(cutoff = dayjs().subtract(30, 'minutes').toDate()) {
    if (PROD_BUILD) throw new Error('cowardly refusing to delete users ON PRODUCTION!')

    const protectedEmails = getProtectedTestEmails()
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

    const pageSize = 100
    let offset = 0
    let hasMore = true

    const ciRunId = getGitHubRunKey()

    // eslint-disable-next-line no-console
    console.log(`Deleting test users created before ${cutoff.toISOString()}`)
    if (ciRunId) {
        // eslint-disable-next-line no-console
        console.log(`CI mode: only deleting users created by run ${ciRunId}`)
    } else {
        // eslint-disable-next-line no-console
        console.log(`Local mode: deleting all matching test users`)
    }

    while (hasMore) {
        const users = await clerk.users.getUserList({
            limit: pageSize,
            offset,
        })

        for (const user of users.data) {
            const createdBefore = dayjs(user.createdAt).isBefore(cutoff)
            const ciMatch = ciRunId ? user.privateMetadata.createdByCIRunId == ciRunId : true

            if (createdBefore && isTestUser(user, protectedEmails) && ciMatch) {
                try {
                    await clerk.users.deleteUser(user.id)
                    // eslint-disable-next-line no-console
                    console.log(`✅ Deleted ${user.id} ${user.fullName} (${user.primaryEmailAddress?.emailAddress})`)
                } catch (err) {
                    console.error(`⚠️  Failed to delete ${user.id}:`, err)
                }
            }
        }

        hasMore = users.data.length === pageSize
        offset += pageSize
    }

    // eslint-disable-next-line no-console
    console.log('Done')
}
