/* eslint-disable no-console */
import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'

interface UserMetadataReport {
    email: string
    userId: string
    publicMetadataSize: number
    publicMetadataKeys?: string[]
}

async function checkUserMetadataSize() {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

    const pageSize = 100
    let offset = 0
    let hasMore = true

    const reports: UserMetadataReport[] = []

    console.log('Fetching all users from Clerk...\n')

    while (hasMore) {
        const response = await clerk.users.getUserList({
            limit: pageSize,
            offset,
        })

        for (const user of response.data) {
            const email = user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || 'NO EMAIL'
            const publicMetadataStr = JSON.stringify(user.publicMetadata)
            const publicMetadataSize = Buffer.byteLength(publicMetadataStr, 'utf8')

            reports.push({
                email,
                userId: user.id,
                publicMetadataSize,
                publicMetadataKeys: Object.keys(user.publicMetadata),
            })
        }

        hasMore = response.data.length === pageSize
        offset += pageSize

        console.log(`Processed ${offset} users...`)
    }

    console.log(`\n✅ Fetched ${reports.length} total users\n`)

    // Filter for users with publicMetadata larger than 1KB
    const threshold = 1024 // 1KB in bytes
    const largeMetadataUsers = reports.filter((r) => r.publicMetadataSize > threshold)

    // Sort by size descending to show largest first
    largeMetadataUsers.sort((a, b) => b.publicMetadataSize - a.publicMetadataSize)

    console.log('========================================')
    console.log(`Users with Public Metadata > 1KB`)
    console.log('========================================\n')

    if (largeMetadataUsers.length === 0) {
        console.log('No users found with publicMetadata larger than 1KB')
    } else {
        console.log(`Found ${largeMetadataUsers.length} users:\n`)

        for (const report of largeMetadataUsers) {
            console.log(`Email: ${report.email}`)
            console.log(`User ID: ${report.userId}`)
            console.log(
                `Public Metadata Size: ${report.publicMetadataSize} bytes (${(report.publicMetadataSize / 1024).toFixed(2)} KB)`,
            )
            if (report.publicMetadataKeys && report.publicMetadataKeys.length > 0) {
                console.log(`Metadata Keys: ${report.publicMetadataKeys.join(', ')}`)
            }
            console.log('---')
        }
    }
}

checkUserMetadataSize().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
