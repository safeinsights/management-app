'use server'

import { clerkClient } from '@clerk/nextjs/server'

export async function getAllOrganizations() {
    try {
        // Get organization list from Clerk
        const response = (await clerkClient()).organizations.getOrganizationList({
            limit: 100
        })

        // Access the data array from the response
        return (await response).data.map(org => ({
            identifier: org.id,
            name: org.name
        }))
    } catch (error) {
        console.error('Organization fetch failed:', error)
        throw new Error('Failed to fetch organizations')
    }
}
