'use server'

import { orgSchema, updateOrgSchema } from '@/schema/org'
import { getReviewerPublicKeyByUserId } from '../db/queries'
import { revalidatePath } from 'next/cache'
import { z, ActionFailure, Action } from './action'

export const updateOrgAction = new Action('updateOrgAction', { performsMutations: true })
    .params(updateOrgSchema)
    .middleware(async ({ params: { id } }) => ({ orgId: id })) // translate params for requireAbility below
    .requireAbilityTo('update', 'Team')
    .handler(async ({ params: org, db }) => {
        return await db.updateTable('org').set(org).returningAll().executeTakeFirstOrThrow()
    })

export const insertOrgAction = new Action('insertOrgAction')
    .params(orgSchema)
    .middleware(async ({ params: { slug } }) => ({ orgSlug: slug })) // translate params for requireAbility below
    .requireAbilityTo('create', 'Team')
    .handler(async ({ db, params: org }) => {
        return await db.insertInto('org').values(org).returningAll().executeTakeFirstOrThrow()
    })

export const getOrgFromIdAction = new Action('getOrgFromIdAction')
    .params(z.object({ orgId: z.string() }))
    .requireAbilityTo('view', 'Team')
    .handler(async ({ db, params: { orgId } }) => {
        return await db.selectFrom('org').selectAll('org').where('id', '=', orgId).executeTakeFirst()
    })

export const fetchOrgsForSelectAction = new Action('fetchOrgsForSelectAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db }) => db.selectFrom('org').select(['id as value', 'name as label']).execute())

export const fetchOrgsAction = new Action('fetchOrgsAction')
    .requireAbilityTo('view', 'Orgs')
    .handler(async ({ db }) => await db.selectFrom('org').selectAll('org').execute())

export const deleteOrgAction = new Action('deleteOrgAction')
    .params(z.object({ orgId: z.string() }))
    .requireAbilityTo('delete', 'Org')
    .handler(async ({ db, params: { orgId } }) => db.deleteFrom('org').where('id', '=', orgId).execute())

export const getOrgFromSlugAction = new Action('getOrgFromSlugAction')
    .params(z.object({ orgSlug: z.string() }))
    .requireAbilityTo('view', 'Org')
    .handler(async ({ db, params: { orgSlug } }) =>
        db.selectFrom('org').selectAll('org').where('slug', '=', orgSlug).executeTakeFirstOrThrow(),
    )

// TODO: move this to a more appropriate place, likely a reviewers.actions.ts file
// also all we really need is if they have a public key, so we can just return a boolean
export const getReviewerPublicKeyAction = new Action('getReviewerPublicKeyAction')
    .requireAbilityTo('view', 'ReviewerKey')
    .handler(async ({ session }) => getReviewerPublicKeyByUserId(session.user.id))

export type OrgUserReturn = Awaited<ReturnType<typeof getUsersForOrgAction>>[number]

export const updateOrgSettingsAction = new Action('updateOrgSettingsAction')
    .params(z.object({ orgSlug: z.string() }).merge(orgSchema.pick({ name: true, description: true })))
    .requireAbilityTo('update', 'Team')
    .handler(async ({ db, session, params: { orgSlug, name, description } }) => {
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
    .middleware(async ({ params: { orgSlug }, db }) => {
        const org = await db.selectFrom('org').select('id').where('slug', '=', orgSlug).executeTakeFirstOrThrow()
        return { orgId: org.id }
    })
    .requireAbilityTo('view', 'User')
    .handler(async ({ db, params: { orgSlug, sort } }) => {
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
