'use server'

import { db } from '@/database'
import { orgSchema, updateOrgSchema } from '@/schema/org'
import { getReviewerPublicKeyByUserId } from '../db/queries'
import { revalidatePath } from 'next/cache'
import { z, ActionFailure, Action } from './action'

export const updateOrgAction = new Action('updateOrgAction')
    .params(updateOrgSchema)
    .requireAbilityTo('update', 'Team')
    .handler(async (org) => {
        return await db.updateTable('org').set(org).returningAll().executeTakeFirstOrThrow()
    })

export const insertOrgAction = new Action('insertOrgAction')
    .params(orgSchema)
    .requireAbilityTo('create', 'Team')
    .handler(async (org) => {
        return await db.insertInto('org').values(org).returningAll().executeTakeFirstOrThrow()
    })

export const getOrgFromIdAction = new Action('getOrgFromIdAction')
    .params(z.object({ orgId: z.string() }))
    .requireAbilityTo('read', 'Team')
    .handler(async ({ orgId }) => {
        return await db.selectFrom('org').selectAll('org').where('id', '=', orgId).executeTakeFirst()
    })

export const fetchOrgsForSelectAction = new Action('fetchOrgsForSelectAction')
    .requireAbilityTo('read', 'Team')
    .handler(async () => db.selectFrom('org').select(['id as value', 'name as label']).execute())

export const fetchOrgsAction = new Action('fetchOrgsAction').requireAbilityTo('read', 'Team').handler(async () => {
    return await db.selectFrom('org').selectAll('org').execute()
})

export const deleteOrgAction = new Action('deleteOrgAction')
    .params(z.object({ orgSlug: z.string() }))
    .requireAbilityTo('delete', 'Team')
    .handler(async ({ orgSlug }) => db.deleteFrom('org').where('slug', '=', orgSlug).execute())

export const getOrgFromSlugAction = new Action('getOrgFromSlugAction')
    .params(z.object({ orgSlug: z.string() }))
    .requireAbilityTo('read', 'Team')
    .handler(async ({ orgSlug }) =>
        db.selectFrom('org').selectAll('org').where('slug', '=', orgSlug).executeTakeFirstOrThrow(),
    )

// TODO: move this to a more appropriate place, likely a reviewers.actions.ts file
// also all we really need is if they have a public key, so we can just return a boolean
export const getReviewerPublicKeyAction = new Action('getReviewerPublicKeyAction')
    .requireAbilityTo('read', 'ReviewerKey')
    .handler(async (_, ctx) => getReviewerPublicKeyByUserId(ctx.session.user.id))

export type OrgUserReturn = Awaited<ReturnType<typeof getUsersForOrgAction>>[number]

export const updateOrgSettingsAction = new Action('updateOrgSettingsAction')
    .params(
        z
            .object({
                orgSlug: z.string(),
            })
            .merge(orgSchema.pick({ name: true, description: true })),
    )
    .requireAbilityTo('update', 'Team')
    .handler(async ({ orgSlug, name, description }, { session }) => {
        // Check for duplicate name for existing organizations
        const existingOrg = await db.selectFrom('org').select('id').where('name', '=', name).executeTakeFirst()
        if (existingOrg && existingOrg.id !== session.team.id) {
            throw new ActionFailure({ name: 'Name is already in use. Enter a unique name.' })
        }

        await db.updateTable('org').set({ name, description }).where('slug', '=', orgSlug).executeTakeFirstOrThrow()

        // If both DB and Clerk updates are successful
        revalidatePath(`/admin/team/${orgSlug}/settings`)
        revalidatePath(`/admin/team/${orgSlug}`)

        return { success: true, message: 'Organization settings updated successfully.' }
    })

export const getUsersForOrgAction = new Action('getUsersForOrgAction')
    .params(
        z.object({
            orgSlug: z.string(),
            sort: z.object({
                columnAccessor: z.enum(['fullName']),
                direction: z.enum(['asc', 'desc']),
            }),
        }),
    )

    .requireAbilityTo('read', 'User')

    .handler(async ({ orgSlug, sort }) => {
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
                'orgUser.id as orgUserId',
                'orgUser.isResearcher',
                'orgUser.isAdmin',
                'orgUser.isReviewer',
                'latestAuditEntry.createdAt as latestActivityAt',
            ])
            .where('org.slug', '=', orgSlug)
            .orderBy(sort.columnAccessor, sort.direction)
            .execute()
    })
