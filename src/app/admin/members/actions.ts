'use server'
import { db, Member } from '@/database'
import * as R from 'remeda'
import { NewMember } from './schema'

type MemberType = Member | NewMember

function isNewRecord(obj: MemberType): obj is NewMember {
    return obj != null && obj.createdAt === undefined
}

export const upsertMemberAction = async (member: NewMember | Member) => {
    if (isNewRecord(member)) {
        db.insertInto('member').values(member).execute()
    } else {
        db.updateTable('member')
            .set(R.omit(member, ['createdAt', 'updatedAt']))
            .where('identifier', '=', member.identifier)
            .execute()
    }
}

export const insertMemberAction = async (member: NewMember) => {
    const results = await db.insertInto('member').values(member).returningAll().execute()

    if (!results.length) {
        throw new Error('Failed to insert member')
    }

    return results[0]
}

export const updateMemberAction = async (prevIdentifier: string, member: NewMember) => {
    const results = db
        .updateTable('member')
        .set(R.omit(member, ['createdAt', 'updatedAt']))
        .where('identifier', '=', prevIdentifier)
        .returningAll()
        .execute()

    return results
}

export const fetchMembersAction = async () => {
    return await db.selectFrom('member').selectAll().execute()
}
