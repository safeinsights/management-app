'use server'

import { db } from '@/database'
import { memberSchema } from '@/schema/member'

import { adminAction, memberAction, userAction, z } from './wrappers'

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

    return results
}, memberSchema)

export const fetchMembersForSelectAction = adminAction(async () => {
    return await db.selectFrom('member').select(['id as value', 'name as label']).execute()
})

export const fetchMembersAction = adminAction(async () => {
    return await db.selectFrom('member').selectAll('member').execute()
})

export const deleteMemberAction = adminAction(async (identifier) => {
    await db.deleteFrom('member').where('identifier', '=', identifier).execute()
}, z.string())

export const getMemberFromIdentifierAction = userAction(async (identifier) => {
    return await db.selectFrom('member').selectAll().where('identifier', '=', identifier).executeTakeFirst()
}, z.string())

export const getMemberIdFromIdentifierAction = userAction(async (identifier) => {
    return await db.selectFrom('member').select('id').where('identifier', '=', identifier).executeTakeFirst()
}, z.string())
