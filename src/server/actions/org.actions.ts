'use server'

import { db } from '@/database'
import { orgSchema } from '@/schema/org'
import { findOrCreateClerkOrganization } from '../clerk'
import { adminAction, getUserIdFromActionContext, orgAdminAction, userAction, z } from './wrappers'
import { getReviewerPublicKeyByUserId } from '../db/queries'
import { SanitizedError } from '@/lib/errors'

export const upsertOrgAction = adminAction(async (org) => {
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

export const fetchOrgsForSelectAction = adminAction(async () => {
    return await db.selectFrom('org').select(['id as value', 'name as label']).execute()
})

export const fetchOrgsAction = adminAction(async () => {
    return await db.selectFrom('org').selectAll('org').execute()
})

export const deleteOrgAction = adminAction(async (slug) => {
    await db.deleteFrom('org').where('slug', '=', slug).execute()
}, z.string())

export const getOrgFromSlugAction = userAction(async (slug) => {
    return await db
        .selectFrom('org')
        .selectAll()
        .where('slug', '=', slug)
        .executeTakeFirstOrThrow(() => {
            throw new SanitizedError(`Org not found`)
        })
}, z.string())

export const getReviewerPublicKeyAction = userAction(async () => {
    return getReviewerPublicKeyByUserId(await getUserIdFromActionContext())
})

export type OrgUserReturn = Awaited<ReturnType<typeof getUsersForOrgAction>>[number]

export const getUsersForOrgAction = orgAdminAction(
    async ({ orgSlug, sort }) => {
        return await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .innerJoin('user', 'user.id', 'orgUser.userId')
            .select([
                'user.id',
                'user.fullName',
                'user.createdAt',
                'user.email',
                'orgUser.isResearcher',
                'orgUser.isAdmin',
                'orgUser.isReviewer',
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
