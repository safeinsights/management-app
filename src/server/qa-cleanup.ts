/**
 * QA cleanup helpers: fully delete users and studies, including their backing
 * Clerk account and S3 files. Exposed via /api/qa/* routes that are gated to
 * non-production environments so QA can clean up after themselves.
 *
 * Deletion order is FK-safe: relations without ON DELETE CASCADE are removed
 * manually before their parent row. All row deletes for a cleanup run in a
 * single transaction so a failure can never leave a partially deleted graph.
 * External cleanup (S3, Clerk) runs only after the transaction commits, and
 * its failures propagate so the caller never sees success for an incomplete
 * cleanup.
 */
import { type Kysely } from 'kysely'
import { type DB } from '@/database/types'
import { clerkClient, verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { marshalSession } from '@/server/session'
import { deleteFolderContents } from '@/server/aws'
import { pathForStudy } from '@/lib/paths'
import { PROD_ENV } from '@/server/config'
import { isClerkApiError } from '@/lib/errors'
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
        // The standalone verifyToken (unlike auth()/clerkClient()) does not read CLERK_SECRET_KEY
        // from the environment on its own — it only uses the key passed in options. Without it,
        // JWK resolution fails and the guard rejects every request, so pass the secret explicitly.
        claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
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

// Mutation Actions already run their handlers inside a transaction (see action.ts)
// and Kysely does not support nesting, so reuse the caller's transaction when given one.
async function withTransaction(db: Kysely<DB>, fn: (trx: Kysely<DB>) => Promise<void>) {
    if (db.isTransaction) {
        await fn(db)
        return
    }
    await db.transaction().execute(fn)
}

async function deleteStudyRows(db: Kysely<DB>, studyId: string) {
    const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).execute()
    if (jobs.length > 0) {
        const jobIds = jobs.map((job) => job.id)
        await db.deleteFrom('jobStatusChange').where('studyJobId', 'in', jobIds).execute()
        await db.deleteFrom('studyJobFile').where('studyJobId', 'in', jobIds).execute()
        await db.deleteFrom('studyJob').where('id', 'in', jobIds).execute()
    }
    await db.deleteFrom('yjsDocument').where('studyId', '=', studyId).execute()
    await db.deleteFrom('study').where('id', '=', studyId).execute()
}

/**
 * Fully delete a study: its jobs and their related rows, collaborative-editing
 * documents, and the study row (cascades proposal comments) in one transaction,
 * then its S3 folder once the rows are committed.
 */
export async function deleteStudyCompletely(db: Kysely<DB>, orgSlug: string, studyId: string) {
    await withTransaction(db, (trx) => deleteStudyRows(trx, studyId))
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
    // cascade, so any study the user is attached to must be removed first. Org
    // slugs are captured up front for the post-commit S3 cleanup.
    const studies = await db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['study.id as studyId', 'org.slug as orgSlug'])
        .where((eb) =>
            eb.or([
                eb('study.researcherId', '=', userId),
                eb('study.piUserId', '=', userId),
                eb('study.reviewerId', '=', userId),
            ]),
        )
        .execute()

    await withTransaction(db, async (trx) => {
        for (const study of studies) {
            await deleteStudyRows(trx, study.studyId)
        }
        // study_review_comment.author_id is ON DELETE RESTRICT — clear it first.
        await trx.deleteFrom('studyReviewComment').where('authorId', '=', userId).execute()
        await trx.deleteFrom('studyProposalComment').where('authorId', '=', userId).execute()
        await trx.deleteFrom('jobStatusChange').where('userId', '=', userId).execute()
        await trx.deleteFrom('orgUser').where('userId', '=', userId).execute()
        await trx.deleteFrom('userPublicKey').where('userId', '=', userId).execute()
        // researcher_profile (and its researcher_position rows) cascade from user.
        await trx.deleteFrom('user').where('id', '=', userId).execute()
    })

    for (const study of studies) {
        await deleteFolderContents(pathForStudy({ orgSlug: study.orgSlug, studyId: study.studyId }))
    }
    await deleteClerkUser(user.clerkId)
}

// Clerk's backend client rejects with a ClerkAPIResponseError; a 404/resource_not_found
// on delete means the account is already gone, the one failure cleanup can ignore.
function isClerkNotFoundError(error: unknown): boolean {
    if (!isClerkApiError(error)) return false
    const status = (error as { status?: number }).status
    return status === 404 || error.errors[0].code === 'resource_not_found'
}

/**
 * Delete the Clerk account. A missing Clerk user is not an error — the account is
 * already gone, so log and continue. Any other failure (auth/config/network/5xx)
 * rethrows so the caller sees the cleanup did not complete.
 */
async function deleteClerkUser(clerkId: string) {
    const client = await clerkClient()
    try {
        await client.users.deleteUser(clerkId)
    } catch (error) {
        if (!isClerkNotFoundError(error)) throw error
        logger.warn(`clerk user ${clerkId} was already deleted before QA cleanup`)
    }
}
