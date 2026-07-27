/**
 * QA cleanup helpers: fully delete users and studies, including their backing
 * Clerk account and S3 files. Exposed via /api/qa/* routes so QA can clean up
 * after themselves.
 *
 * These routes run in every environment, production included, so the only thing
 * standing between them and real customer data is `assertQaEmail`: every user
 * they touch must have a qa-prefixed email address. Deletion here is permanent
 * and covers the DB rows, the S3 objects, and the Clerk account, so treat that
 * check as load-bearing — do not add a path that reaches these helpers without
 * it. Every invocation is written to the audit table.
 *
 * Deletion order is FK-safe: relations without ON DELETE CASCADE are removed
 * manually before their parent row. All row deletes for a cleanup run in a
 * single transaction so a failure can never leave a partially deleted graph.
 * External cleanup (S3, Clerk) runs only after the transaction commits, and
 * its failures propagate so the caller never sees success for an incomplete
 * cleanup.
 */
import { sql, type Kysely } from 'kysely'
import { type DB } from '@/database/types'
import { type SessionUser } from '@/lib/types'
import { clerkClient, verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { marshalSession } from '@/server/session'
import { deleteFolderContents } from '@/server/aws'
import { pathForStudy } from '@/lib/paths'
import { isClerkApiError } from '@/lib/errors'
import logger from '@/lib/logger'

export type QaAuthResult = { ok: true; user: SessionUser } | { ok: false; status: number; message: string }

export class QaForbiddenError extends Error {}

/**
 * The QA routes operate on production, where a stray id would otherwise reach a real
 * account. Restrict them to addresses whose local part starts with "qa" (qa@, qa-bob@,
 * QATest@) — the convention QA fixtures follow — so a real user can never be the target.
 */
export function assertQaEmail(email: string | null, context: string) {
    const localPart = (email ?? '').split('@')[0]
    if (!/^qa/i.test(localPart)) {
        throw new QaForbiddenError(`${context} is not a QA account; expected an email starting with "qa"`)
    }
}

/**
 * Gate QA routes to an authenticated SI admin.
 *
 * These live under /api/*, which clerkMiddleware() is configured to skip (see the
 * matcher in proxy.ts), so the middleware-coupled `auth()` helper has no context to
 * read and throws. Instead we verify the SI admin's Clerk session token directly from
 * the `Authorization: Bearer <token>` header with `verifyToken` — the standalone
 * primitive that does not require the middleware to have run.
 */
export async function requireQaAdmin(): Promise<QaAuthResult> {
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

    return { ok: true, user: session.user }
}

export class QaCleanupNotFoundError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve the `{idOrEmail}` path segment QA uses to name a user. QA works from email
 * addresses, not internal ids, so accept either: anything containing an "@" is matched
 * case-insensitively against `user.email`, otherwise it is treated as a user id.
 */
export async function findQaUser(db: Kysely<DB>, idOrEmail: string) {
    const identifier = decodeURIComponent(idOrEmail)
    const query = db.selectFrom('user').select(['id', 'clerkId', 'email'])

    let user
    if (identifier.includes('@')) {
        user = await query.where(sql`lower(email)`, '=', identifier.toLowerCase()).executeTakeFirst()
    } else if (UUID_RE.test(identifier)) {
        user = await query.where('id', '=', identifier).executeTakeFirst()
    }
    // A non-uuid, non-email segment never matches: comparing it to the uuid column would
    // make Postgres raise instead of returning the 404 the caller expects.

    if (!user) throw new QaCleanupNotFoundError(`user ${identifier} not found`)
    // Checked against the stored address rather than the caller's input, so passing a
    // real user's id cannot bypass it.
    assertQaEmail(user.email, `user ${identifier}`)
    return user
}

// Mutation Actions already run their handlers inside a transaction (see action.ts)
// and Kysely does not support nesting, so reuse the caller's transaction when given one.
export async function withTransaction(db: Kysely<DB>, fn: (trx: Kysely<DB>) => Promise<void>) {
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
 *
 * A study has no email of its own, so the QA guard is applied to its researcher:
 * only studies owned by a qa-prefixed account can be deleted through this path.
 * The real user-facing delete goes through deleteStudyCompletely and is unaffected.
 */
export async function deleteStudyById(db: Kysely<DB>, studyId: string) {
    const study = await db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .innerJoin('user as researcher', 'researcher.id', 'study.researcherId')
        .select(['study.id as studyId', 'org.slug as orgSlug', 'researcher.email as researcherEmail'])
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!study) throw new QaCleanupNotFoundError(`study ${studyId} not found`)
    assertQaEmail(study.researcherEmail, `study ${studyId} researcher`)

    await deleteStudyCompletely(db, study.orgSlug, study.studyId)
}

/**
 * Fully delete a user: any studies they own (researcher/pi/reviewer FKs do not
 * cascade), their dependent rows, the user row, and the backing Clerk account.
 * Accepts a user id or an email address.
 */
export async function deleteUserById(db: Kysely<DB>, idOrEmail: string) {
    const user = await findQaUser(db, idOrEmail)
    const userId = user.id

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

    // Returned so the caller can audit what was removed; the row itself is gone by now.
    return user
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
