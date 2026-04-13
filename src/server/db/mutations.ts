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

async function createBaselineJob(db: Kysely<DB>, studyId: string, createdAt: Date) {
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

// Submit is enabled when any file's mtime > latest job's createdAt.

/** Creates a backdated job if none exists so uploaded files (written after) have newer mtime. */
export async function ensureBaselineJob(db: Kysely<DB>, studyId: string) {
    const existingJob = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).executeTakeFirst()
    if (existingJob) return
    return createBaselineJob(db, studyId, new Date(Date.now() - 1000))
}

/** Always creates a fresh job for IDE launch. Starter files should have their mtime backdated. */
export async function resetBaselineJob(db: Kysely<DB>, studyId: string) {
    return createBaselineJob(db, studyId, new Date())
}
