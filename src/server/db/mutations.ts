import { Action } from '../actions/action'
import type { DB } from '@/database/types'
import type { Kysely } from 'kysely'

type SiUserOptionalAttrs = {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
}

export const findOrCreateSiUserId = async (clerkId: string, attrs: SiUserOptionalAttrs = {}) => {
    let user = await Action.db.selectFrom('user').select('id').where('clerkId', '=', clerkId).executeTakeFirst()

    if (!user) {
        user = await Action.db
            .insertInto('user')
            .values({
                clerkId,
                lastName: attrs.lastName,
                email: attrs.email,
                firstName: attrs.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}

export async function ensureBaselineJob(
    db: Kysely<DB>,
    studyId: string,
    { backdate }: { backdate: boolean } = { backdate: false },
) {
    const existingJob = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).executeTakeFirst()

    if (existingJob) return

    const createdAt = backdate ? new Date(Date.now() - 1000) : new Date(Date.now() + 1000)

    const studyJob = await db
        .insertInto('studyJob')
        .values({ studyId, createdAt })
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: studyJob.id, status: 'INITIATED' })
        .executeTakeFirstOrThrow()

    return studyJob
}
