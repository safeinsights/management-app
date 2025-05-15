import 'dotenv/config'
import { clerkClient } from '@clerk/nextjs/server'

const SAFE_TO_DELETE = /^(?!.*dbfyq3).*(?:test|delete).*$/i

async function main() {
    const clerk = await clerkClient()

    const pageSize = 100
    let offset = 0

    while (true) {
        // Fetch a page of users
        const users = await clerk.users.getUserList({
            limit: pageSize,
            offset,
        })

        for (const user of users.data) {
            const emailMatches = user.emailAddresses.some((e) => SAFE_TO_DELETE.test(e.emailAddress))
            const nameMatches = SAFE_TO_DELETE.test(user.firstName || '') || SAFE_TO_DELETE.test(user.lastName || '')

            if (emailMatches || nameMatches) {
                try {
                    await clerk.users.deleteUser(user.id)
                    console.log(
                        `✅ Deleted user ${user.id} ${user.fullName} (${user.primaryEmailAddress?.emailAddress})`,
                    )
                } catch (err) {
                    console.error(`⚠️  Failed to delete ${user.id}:`, err)
                }
            }
        }
        offset += pageSize
    }
    console.log('🏁 Done.')
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
