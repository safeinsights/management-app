'use server'

import { db } from '@/database'
import { orgSchema } from '@/schema/org'
import { findOrCreateClerkOrganization } from '../clerk'
import {
    siAdminAction,
    getUserIdFromActionContext,
    orgAdminAction,
    userAction,
    z,
    ActionFailure,
    getOrgInfoFromActionContext,
} from './wrappers'
import { getReviewerPublicKeyByUserId } from '../db/queries'
import { clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import logger from '@/lib/logger'

export const upsertOrgAction = siAdminAction(async (org) => {
    // Check for duplicate organization name for new organizations only
    if (!('id' in org)) {
        const duplicate = await db.selectFrom('org').select('id').where('name', '=', org.name).executeTakeFirst()
        if (duplicate) {
            throw new Error('Organization with this name already exists')
        }
    }
    const results = await db
        .insertInto('org')
        .values(org)
        .onConflict((oc) =>
            oc.column('id').doUpdateSet({
                ...org,
            }),
        )
        .returningAll()
        .executeTakeFirstOrThrow()

    await findOrCreateClerkOrganization({ slug: org.slug, name: org.name })

    return results
}, orgSchema)

export const getOrgFromIdAction = userAction(async (id) => {
    return await db.selectFrom('org').selectAll('org').where('id', '=', id).executeTakeFirst()
}, z.string())

export const fetchOrgsForSelectAction = siAdminAction(async () => {
    return await db.selectFrom('org').select(['id as value', 'name as label']).execute()
})

export const fetchOrgsAction = siAdminAction(async () => {
    return await db.selectFrom('org').selectAll('org').execute()
})

export const deleteOrgAction = siAdminAction(async (slug) => {
    await db.deleteFrom('org').where('slug', '=', slug).execute()
}, z.string())

export const getOrgFromSlugAction = userAction(async (slug) => {
    return await db
        .selectFrom('org')
        .selectAll('org')
        .where('slug', '=', slug)
        .executeTakeFirstOrThrow(() => {
            throw new ActionFailure({ message: `Org not found` })
        })
}, z.string())

export const getReviewerPublicKeyAction = userAction(async () => {
    return getReviewerPublicKeyByUserId(await getUserIdFromActionContext())
})

export type OrgUserReturn = Awaited<ReturnType<typeof getUsersForOrgAction>>[number]

const updateOrgSettingsSchema = z
    .object({
        orgSlug: z.string(),
    })
    .merge(orgSchema.pick({ name: true, description: true }))

export const updateOrgSettingsAction = orgAdminAction(async ({ orgSlug, name, description }) => {
    // Fetch the current organization details from the action context
    const orgFromContext = await getOrgInfoFromActionContext()

    // orgAdminAction and orgAction already ensure the org exists and the user is an admin.
    // TypeScript ensures orgFromContext.name is a string due to ActionContextOrgInfo type.
    const originalName = orgFromContext.name

    // Check for duplicate name for existing organizations 
    const existingOrg = await db.selectFrom('org').select('id').where('name', '=', name).executeTakeFirst()
    if (existingOrg && existingOrg.id !== orgFromContext.id) {
        throw new ActionFailure({name:'Team name is already in use. Enter a unique name.')
    }

    // Update the database first, Clerk second
    await db.updateTable('org').set({ name, description }).where('slug', '=', orgSlug).executeTakeFirstOrThrow()

    try {
        // Update Clerk only if the name has changed
        if (name !== originalName) {
            const clerk = await clerkClient()
            const clerkOrg = await clerk.organizations.getOrganization({ slug: orgSlug })
            if (!clerkOrg) {
                throw new Error(`Clerk organization with slug ${orgSlug} not found.`)
            }
            await clerk.organizations.updateOrganization(clerkOrg.id, { name })
        }
    } catch (error) {
        logger.error({ message: `Failed to update organization name in Clerk for ${orgSlug}:`, err: error })
        // Revert the database change
        try {
            await db
                .updateTable('org')
                .set({ name: originalName, description: orgFromContext.description })
                .where('slug', '=', orgSlug)
                .executeTakeFirstOrThrow()
            logger.warn(`Successfully reverted organization name in DB for ${orgSlug} after Clerk update failure.`)
        } catch (revertError) {
            logger.error({ message: `Failed to revert organization name in DB for ${orgSlug}:`, err: revertError })
            // If revert fails, the DB is in an inconsistent state with Clerk regarding the name.
            throw new ActionFailure({
                form: `Failed to update in external system. DB revert also failed. Please contact support.`,
            })
        }
        throw new ActionFailure({
            form: `Organization settings updated locally, but failed to sync with external system. Local changes were reverted.`,
        })
    }
    // If both DB and Clerk updates are successful
    revalidatePath(`/admin/team/${orgSlug}/settings`)
    revalidatePath(`/admin/team/${orgSlug}`)

    return { success: true, message: 'Organization settings updated successfully.' }
}, updateOrgSettingsSchema)

export const getUsersForOrgAction = orgAdminAction(
    async ({ orgSlug, sort }) => {
        return await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .innerJoin('user', 'user.id', 'orgUser.userId')
            .leftJoin(
                (
                    eb, // join to the latest activity from audit
                ) =>
                    eb
                        .selectFrom('audit')
                        .distinctOn('audit.userId')
                        .select(['audit.userId', 'audit.createdAt'])
                        .orderBy('audit.userId', 'desc')
                        .orderBy('audit.createdAt', 'desc')
                        .as('latestAuditEntry'),
                (join) => join.onRef('latestAuditEntry.userId', '=', 'orgUser.userId'),
            )
            .select([
                'user.id',
                'user.fullName',
                'user.createdAt',
                'user.email',
                'orgUser.isResearcher',
                'orgUser.isAdmin',
                'orgUser.isReviewer',
                'latestAuditEntry.createdAt as latestActivityAt',
            ])
            .where('org.slug', '=', orgSlug)
            .orderBy(sort.columnAccessor, sort.direction)
            .execute()
    },
    z.object({
        orgSlug: z.string(),
        sort: z.object({
            columnAccessor: z.enum(['fullName']),
            direction: z.enum(['asc', 'desc']),
        }),
    }),
)
