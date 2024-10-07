'use server'

import { db } from '@/database'
import { ValidatedMember, NewMember, schema } from './schema'
export const insertMemberAction = async (member: NewMember) => {
    schema.parse(member) // will throw when malformed
    const results = await db.insertInto('member').values(member).returningAll().execute()

    if (!results.length) {
        throw new Error('Failed to insert member')
    }

    return results[0]
}

export const updateMemberAction = async (prevIdentifier: string, member: ValidatedMember) => {
    schema.parse(member) // will throw when malformed

    const results = db
        .updateTable('member')
        .set(member)
        .where('identifier', '=', prevIdentifier)
        .returningAll('member')
        .execute()

    return results
}

export const fetchMembersAction = async () => {
    return await db.selectFrom('member').selectAll('member').execute()
}

export const deleteMemberAction = async (identifier: string) => {
    await db.deleteFrom('member').where('identifier', '=', identifier).execute()
}
