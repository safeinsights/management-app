// QA provisioning helpers behind /api/qa/*, gated to non-production SI admins. Kept out of
// qa-cleanup.ts because that module is imported by the real study-delete action.
import { type Kysely } from 'kysely'
import { type DB } from '@/database/types'
import { clerkClient } from '@clerk/nextjs/server'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { assertValidPublicKey, InvalidPublicKeyError } from '@/lib/public-key'
import { pathForInvitation } from '@/lib/paths'
import { APP_BASE_URL } from '@/server/config'
import { updateClerkUserMetadata } from '@/server/clerk'
import logger from '@/lib/logger'
import { findQaUser, withTransaction, assertQaEmail, QaCleanupNotFoundError } from '@/server/qa-cleanup'

export class QaConflictError extends Error {}

export class QaInvalidRequestError extends Error {}

export type QaOrgMembership = { slug: string; isAdmin?: boolean }

export type QaUserUpdate = {
    orgs?: QaOrgMembership[]
    publicKey?: string
    password?: string
}

export type QaProvisionResult = {
    userId: string
    orgs: { slug: string; isAdmin: boolean }[]
    fingerprint: string | null
    passwordSet: boolean
}

// Resolved before any write, so a typo in one slug cannot leave the user half-migrated.
async function resolveOrgs(db: Kysely<DB>, orgs: QaOrgMembership[]) {
    return await Promise.all(
        orgs.map(async ({ slug, isAdmin = false }) => {
            const org = await db.selectFrom('org').select(['id']).where('slug', '=', slug).executeTakeFirst()
            if (!org) throw new QaCleanupNotFoundError(`organization with slug ${slug} not found`)
            return { orgId: org.id, slug, isAdmin }
        }),
    )
}

// org_user has no unique constraint on (org_id, user_id), so this selects before inserting
// rather than relying on onConflict.
async function applyOrgMemberships(db: Kysely<DB>, userId: string, resolved: Awaited<ReturnType<typeof resolveOrgs>>) {
    const keptOrgIds = resolved.map((org) => org.orgId)
    let removals = db.deleteFrom('orgUser').where('userId', '=', userId)
    if (keptOrgIds.length) {
        removals = removals.where('orgId', 'not in', keptOrgIds)
    }
    await removals.execute()

    for (const { orgId, isAdmin } of resolved) {
        const existing = await db
            .selectFrom('orgUser')
            .select(['id'])
            .where('userId', '=', userId)
            .where('orgId', '=', orgId)
            .executeTakeFirst()

        if (existing) {
            await db.updateTable('orgUser').set({ isAdmin }).where('id', '=', existing.id).execute()
        } else {
            await db.insertInto('orgUser').values({ userId, orgId, isAdmin }).execute()
        }
    }
}

// Shaped for applyOrgMemberships, so a failed Clerk sync can be compensated by replaying them.
async function currentMemberships(db: Kysely<DB>, userId: string) {
    const rows = await db
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['orgUser.orgId', 'org.slug', 'orgUser.isAdmin'])
        .where('orgUser.userId', '=', userId)
        .execute()
    return rows.map(({ orgId, slug, isAdmin }) => ({ orgId, slug, isAdmin }))
}

// The fingerprint is derived, not accepted from the caller: a mismatched one would make senders
// wrap to a key the owner cannot open.
async function applyPublicKey(db: Kysely<DB>, userId: string, pem: string) {
    let keyData: ArrayBuffer
    try {
        keyData = pemToArrayBuffer(pem)
    } catch {
        throw new QaInvalidRequestError('publicKey is not a valid PEM encoded key')
    }

    // A well-formed PEM can still carry a key type we cannot wrap to; that is bad input, not a fault.
    try {
        await assertValidPublicKey(keyData)
    } catch (error) {
        if (error instanceof InvalidPublicKeyError) {
            throw new QaInvalidRequestError(`publicKey ${error.message}`)
        }
        throw error
    }

    const fingerprint = await fingerprintKeyData(keyData)
    const publicKey = Buffer.from(keyData)

    const existing = await db.selectFrom('userPublicKey').select(['id']).where('userId', '=', userId).executeTakeFirst()

    if (existing) {
        await db
            .updateTable('userPublicKey')
            .set({ publicKey, fingerprint, updatedAt: new Date() })
            .where('id', '=', existing.id)
            .execute()
    } else {
        await db.insertInto('userPublicKey').values({ userId, publicKey, fingerprint }).execute()
    }

    return fingerprint
}

// Omitted fields are untouched; `orgs: []` is meaningful and removes every membership.
export async function provisionQaUser(
    db: Kysely<DB>,
    idOrEmail: string,
    update: QaUserUpdate,
): Promise<QaProvisionResult> {
    const user = await findQaUser(db, idOrEmail)
    const resolvedOrgs = update.orgs ? await resolveOrgs(db, update.orgs) : null

    // Captured before the write so a failed Clerk sync can be rolled back to it.
    const priorOrgs = resolvedOrgs ? await currentMemberships(db, user.id) : null

    let fingerprint: string | null = null
    await withTransaction(db, async (trx) => {
        if (resolvedOrgs) {
            await applyOrgMemberships(trx, user.id, resolvedOrgs)
        }
        if (update.publicKey) {
            fingerprint = await applyPublicKey(trx, user.id, update.publicKey)
        }
    })

    // Authorization reads membership from the Clerk JWT, not the DB, so if Clerk is unavailable the
    // two stores disagree and may still grant the old access; roll back and fail loudly.
    if (resolvedOrgs && priorOrgs) {
        try {
            await updateClerkUserMetadata(user.id)
        } catch (error) {
            // Nothing here may replace the original error, which is what tells the caller it failed.
            try {
                await withTransaction(db, (trx) => applyOrgMemberships(trx, user.id, priorOrgs))
                await updateClerkUserMetadata(user.id)
            } catch (rollbackError) {
                logger.error('QA provisioning rollback failed; memberships may be out of sync', rollbackError)
            }
            throw error
        }
    }

    if (update.password) {
        const clerk = await clerkClient()
        // QA reuses short, well-known passwords; Clerk would reject them as weak or breached.
        await clerk.users.updateUser(user.clerkId, { password: update.password, skipPasswordChecks: true })
    }

    const orgs = await db
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['org.slug', 'orgUser.isAdmin'])
        .where('orgUser.userId', '=', user.id)
        .orderBy('org.slug')
        .execute()

    return { userId: user.id, orgs, fingerprint, passwordSet: Boolean(update.password) }
}

export type QaInviteRequest = { email: string; orgSlug: string; isAdmin?: boolean }

export type QaInviteResult = {
    inviteId: string
    email: string
    orgSlug: string
    isAdmin: boolean
    alreadyInvited: boolean
    inviteUrl: string
}

// Deliberately does NOT fire onUserInvited: QA wants the link, not an inbox round-trip.
// Do not "restore" that call.
export async function createQaInvite(
    db: Kysely<DB>,
    { email, orgSlug, isAdmin = false }: QaInviteRequest,
    invitedByUserId: string | null,
): Promise<QaInviteResult> {
    // Clerk normalizes to lowercase; match it to avoid case-sensitivity mismatches.
    const invitedEmail = email.toLowerCase()
    // Runs on production, so an invite may only ever be addressed to a QA account.
    assertQaEmail(invitedEmail, 'invited email')

    const org = await db.selectFrom('org').select(['id']).where('slug', '=', orgSlug).executeTakeFirst()
    if (!org) throw new QaCleanupNotFoundError(`organization with slug ${orgSlug} not found`)

    const clerk = await clerkClient()
    const clerkUsers = await clerk.users.getUserList({ emailAddress: [invitedEmail] })
    if (clerkUsers.data.length > 0) {
        const existingOrgMember = await db
            .selectFrom('orgUser')
            .innerJoin('user', 'user.id', 'orgUser.userId')
            .select(['orgUser.id'])
            .where('orgUser.orgId', '=', org.id)
            .where('user.clerkId', '=', clerkUsers.data[0].id)
            .executeTakeFirst()

        if (existingOrgMember) {
            throw new QaConflictError(`user is already a member of ${orgSlug}`)
        }
    }

    const existingInvite = await db
        .selectFrom('pendingUser')
        .select(['id', 'isAdmin'])
        .where('email', '=', invitedEmail)
        .where('orgId', '=', org.id)
        .executeTakeFirst()

    if (existingInvite) {
        return {
            inviteId: existingInvite.id,
            email: invitedEmail,
            orgSlug,
            isAdmin: existingInvite.isAdmin,
            alreadyInvited: true,
            inviteUrl: `${APP_BASE_URL}${pathForInvitation(existingInvite.id)}`,
        }
    }

    const record = await db
        .insertInto('pendingUser')
        .values({ orgId: org.id, email: invitedEmail, isAdmin, invitedByUserId })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        inviteId: record.id,
        email: invitedEmail,
        orgSlug,
        isAdmin,
        alreadyInvited: false,
        inviteUrl: `${APP_BASE_URL}${pathForInvitation(record.id)}`,
    }
}
