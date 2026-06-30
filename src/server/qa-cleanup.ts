/**
 * QA cleanup helpers: fully delete users and studies, including their backing
 * Clerk account and S3 files. Exposed via /api/qa/* routes that are gated to
 * non-production environments so QA can clean up after themselves.
 *
 * Deletion order is FK-safe: relations without ON DELETE CASCADE are removed
 * manually before their parent row.
 */
import { type Kysely } from 'kysely'
import { type DB } from '@/database/types'
import { clerkClient, verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { marshalSession } from '@/server/session'
import { deleteFolderContents } from '@/server/aws'
import { pathForStudy } from '@/lib/paths'
import { PROD_ENV } from '@/server/config'
import logger from '@/lib/logger'

export type QaAuthResult = { ok: true } | { ok: false; status: number; message: string }

/**
 * Gate QA cleanup to non-prod + an authenticated SI admin.
 *
 * These live under /api/*, which clerkMiddleware() is configured to skip (see the
 * matcher in proxy.ts), so the middleware-coupled `auth()` helper has no context to
 * read and throws. Instead we verify the SI admin's Clerk session token directly from
 * the `Authorization: Bearer <token>` header with `verifyToken` — the standalone
 * primitive that does not require the middleware to have run.
 */
export async function requireQaAdmin(): Promise<QaAuthResult> {
    if (PROD_ENV) {
        return { ok: false, status: 403, message: 'QA cleanup is not available in production' }
    }

    const authHeader = (await headers()).get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
    if (!token) {
        return { ok: false, status: 401, message: 'Authentication required' }
    }

    let claims
    try {
        claims = await verifyToken(token, {})
    } catch (error) {
        logger.warn('QA cleanup token verification failed', error)
        return { ok: false, status: 401, message: 'Authentication required' }
    }

    const session = await marshalSession(claims.sub, claims)
    if (!session?.user.isSiAdmin) {
        return { ok: false, status: 403, message: 'SI admin access required' }
    }

    return { ok: true }
}

export class QaCleanupNotFoundError extends Error {}

/**
 * Fully delete a study: its jobs and their related rows, collaborative-editing
 * documents, the study row (cascades proposal comments), and its S3 folder.
 * Returns the deleted study's id so callers can report it.
 */
export async function deleteStudyCompletely(db: Kysely<DB>, orgSlug: string, studyId: string) {
    const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).execute()
    if (jobs.length > 0) {
        const jobIds = jobs.map((job) => job.id)
        await db.deleteFrom('jobStatusChange').where('studyJobId', 'in', jobIds).execute()
        await db.deleteFrom('studyJobFile').where('studyJobId', 'in', jobIds).execute()
        await db.deleteFrom('studyJob').where('id', 'in', jobIds).execute()
    }
    await db.deleteFrom('yjsDocument').where('studyId', '=', studyId).execute()
    await db.deleteFrom('study').where('id', '=', studyId).execute()
    await deleteFolderContents(pathForStudy({ orgSlug, studyId }))
}

/**
 * Look up a study (throwing QaCleanupNotFoundError if absent), resolve its org
 * slug for the S3 path, and delete it.
 */
export async function deleteStudyById(db: Kysely<DB>, studyId: string) {
    const study = await db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['study.id as studyId', 'org.slug as orgSlug'])
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!study) throw new QaCleanupNotFoundError(`study ${studyId} not found`)

    await deleteStudyCompletely(db, study.orgSlug, study.studyId)
}

/**
 * Fully delete a user: any studies they own (researcher/pi/reviewer FKs do not
 * cascade), their dependent rows, the user row, and the backing Clerk account.
 */
export async function deleteUserById(db: Kysely<DB>, userId: string) {
    const user = await db.selectFrom('user').select(['id', 'clerkId']).where('id', '=', userId).executeTakeFirst()

    if (!user) throw new QaCleanupNotFoundError(`user ${userId} not found`)

    // study.researcher_id / pi_user_id / reviewer_id reference user.id with no
    // cascade, so any study the user is attached to must be removed first.
    const studies = await db
        .selectFrom('study')
        .select('id')
        .where((eb) =>
            eb.or([eb('researcherId', '=', userId), eb('piUserId', '=', userId), eb('reviewerId', '=', userId)]),
        )
        .execute()
    for (const study of studies) {
        await deleteStudyById(db, study.id)
    }

    // study_review_comment.author_id is ON DELETE RESTRICT — clear it first.
    await db.deleteFrom('studyReviewComment').where('authorId', '=', userId).execute()
    await db.deleteFrom('studyProposalComment').where('authorId', '=', userId).execute()
    await db.deleteFrom('jobStatusChange').where('userId', '=', userId).execute()
    await db.deleteFrom('orgUser').where('userId', '=', userId).execute()
    await db.deleteFrom('userPublicKey').where('userId', '=', userId).execute()
    // researcher_profile (and its researcher_position rows) cascade from user.
    await db.deleteFrom('user').where('id', '=', userId).execute()

    await deleteClerkUser(user.clerkId)
}

/**
 * Delete the Clerk account. A missing Clerk user is not an error — the DB record
 * is already gone, so log and continue.
 */
async function deleteClerkUser(clerkId: string) {
    try {
        const client = await clerkClient()
        await client.users.deleteUser(clerkId)
    } catch (error) {
        logger.warn(`failed to delete clerk user ${clerkId} during QA cleanup`, error)
    }
}
