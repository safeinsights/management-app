'use server'
import { db } from '@/database'

import { ValidatedMember, NewMember } from './schema'

export const insertMemberAction = async (member: NewMember) => {
    const results = await db
        .insertInto('member')
        .values({
            email: member.email,
            name: member.name,
            publicKey: member.publicKey,
            identifier: member.identifier,
        })
        .returningAll()
        .execute()

    if (!results.length) {
        throw new Error('Failed to insert member')
    }

    return results[0]
}

export const updateMemberAction = async (prevIdentifier: string, member: ValidatedMember) => {
    const results = db
        .updateTable('member')
        .set({
            name: member.name,
        })
        .where('identifier', '=', prevIdentifier)
        .returningAll('member')
        .execute()

    return results
}

export const fetchMembersAction = async () => {
    return await db.selectFrom('member').selectAll('member').execute()
}
