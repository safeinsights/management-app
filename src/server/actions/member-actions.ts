'use server'

import { db } from '@/database'
import { memberSchema, NewMember, Member } from '@/schema/member'

export const upsertMemberAction = async (member: Member | NewMember) => {
    memberSchema.parse(member) // will throw when malformed
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
        .execute()

    if (!results.length) {
        throw new Error('Failed to insert member')
    }

    return results[0]
}

export const fetchMembersAction = async () => {
    return await db.selectFrom('member').selectAll('member').execute()
}

export const deleteMemberAction = async (identifier: string) => {
    await db.deleteFrom('member').where('identifier', '=', identifier).execute()
}

export const getMemberFromIdentifier = async (identifier: string): Promise<Member | undefined> => {
    return await db.selectFrom('member').selectAll().where('identifier', '=', identifier).executeTakeFirst()
}
