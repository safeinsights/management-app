'use server'

import { db } from '@/database'
import { memberSchema } from '@/schema/member'
import { findOrCreateClerkOrganization } from '../clerk'
import { adminAction, getUserIdFromActionContext, memberAction, userAction, z } from './wrappers'
import { getMemberUserPublicKeyByUserId } from '../db/queries'

export const upsertMemberAction = adminAction(async (member) => {
    // Check for duplicate organization name for new organizations only
    if (!('id' in member)) {
        const duplicate = await db.selectFrom('member').select('id').where('name', '=', member.name).executeTakeFirst()
        if (duplicate) {
            throw new Error('Organization with this name already exists')
        }
    }
    const results = await db
        .insertInto('member')
        .values(member)
        .onConflict((oc) =>
            oc.column('id').doUpdateSet({
                ...member,
            }),
        )
        .returningAll()
        .executeTakeFirstOrThrow()

    await findOrCreateClerkOrganization({ slug: member.slug, name: member.name })

    return results
}, memberSchema)

export const fetchMembersForSelectAction = adminAction(async () => {
    return await db.selectFrom('member').select(['id as value', 'name as label']).execute()
})

export const fetchMembersAction = adminAction(async () => {
    return await db.selectFrom('member').selectAll('member').execute()
})

export const deleteMemberAction = adminAction(async (slug) => {
    await db.deleteFrom('member').where('slug', '=', slug).execute()
}, z.string())

export const getMemberFromSlugAction = userAction(async (slug) => {
    return await db.selectFrom('member').selectAll().where('slug', '=', slug).executeTakeFirst()
}, z.string())

export const getReviewerPublicKeyAction = memberAction(async () => {
    return getMemberUserPublicKeyByUserId(await getUserIdFromActionContext())
})
