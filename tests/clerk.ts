import 'dotenv/config'
import { PROD_BUILD } from '@/server/config'
import { createClerkClient } from '@clerk/backend'
import dayjs from 'dayjs'

export async function deleteClerkTestUsers(cutoff = dayjs().subtract(30, 'minutes').toDate()) {
    if (PROD_BUILD) throw new Error('cowardly refusing to delete users ON PRODUCTION!')

    console.log(`deleting users created after ${cutoff}`) // eslint-disable-line no-console

    const SAFE_TO_DELETE = /^(?!.*dbfyq3).*(?:test|delete).*$/i
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    //const clerk = await clerkClient()

    const pageSize = 100
    let offset = 0

    const users = await clerk.users.getUserList({
        limit: pageSize,
        offset,
    })

    const ciJobId = process.env.GITHUB_JOB

    for (const user of users.data) {
        const emailMatches = user.emailAddresses.some((e) => SAFE_TO_DELETE.test(e.emailAddress))
        const nameMatches = SAFE_TO_DELETE.test(user.firstName || '') || SAFE_TO_DELETE.test(user.lastName || '')

        if (
            (ciJobId && user.publicMetadata.createdByCIJobId == ciJobId) ||
            (dayjs(user.createdAt).isBefore(cutoff) && (emailMatches || nameMatches))
        ) {
            try {
                await clerk.users.deleteUser(user.id)
                // eslint-disable-next-line no-console
                console.log(`✅ Deleted user ${user.id} ${user.fullName} (${user.primaryEmailAddress?.emailAddress})`)
            } catch (err) {
                console.error(`⚠️  Failed to delete ${user.id}:`, err)
            }
        }
    }
    offset += pageSize
}
