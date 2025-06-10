import { clerkClient } from '@clerk/nextjs/server'
import { auth } from '@clerk/nextjs/server'
import { capitalize } from 'remeda'
import { db } from '@/database'
import { getOrgInfoForUserId } from './db/queries'
import { PROD_ENV } from './config'

type ClerkOrganizationProps = {
    adminUserId?: string
    name?: string
    slug: string
}

export const findClerkOrganization = async ({ slug }: { slug: string }) => {
    const client = await clerkClient()
    // .getOrganization throws an error if not found, which is desired behavior.
    return await client.organizations.getOrganization({ slug })
}

export const createClerkOrganization = async ({ name, slug, adminUserId }: ClerkOrganizationProps) => {
    const client = await clerkClient()
    let userId: string | null | undefined = adminUserId
    if (!userId) {
        const cu = await auth()
        userId = cu.userId
        if (!userId) throw new Error('Not logged in and no adminUserId provided for creating organization')
    }

    return await client.organizations.createOrganization({
        name: name || `${capitalize(slug)}`,
        createdBy: userId,
        slug,
    })
}

export const findOrCreateClerkOrganization = async (props: ClerkOrganizationProps) => {
    try {
        return await findClerkOrganization({ slug: props.slug })
    } catch {
        // if we get an error, we assume it's because the org doesn't exist.
        return await createClerkOrganization(props)
    }
}

export const updateClerkUserMetadata = async (userId: string) => {
    const { clerkId } = await db.selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()
    const client = await clerkClient()
    await client.users.updateUserMetadata(clerkId, {
        publicMetadata: {
            userId,
            orgs: await getOrgInfoForUserId(userId),
        },
    })
}
