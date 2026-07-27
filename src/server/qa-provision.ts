/**
 * QA provisioning helpers: put a user into an exact known state (org memberships,
 * public key, Clerk password) and mint invites without waiting on an inbox. Exposed
 * via /api/qa/* routes gated to non-production SI admins, the same as qa-cleanup.
 *
 * Kept separate from qa-cleanup.ts because that module is also imported by the real
 * study-delete action; nothing here should ever be reachable from production code.
 */
import { type Kysely } from 'kysely'
import { type DB } from '@/database/types'
import { clerkClient } from '@clerk/nextjs/server'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { assertValidPublicKey } from '@/lib/public-key'
import { pathForInvitation } from '@/lib/paths'
import { APP_BASE_URL } from '@/server/config'
import { updateClerkUserMetadata } from '@/server/clerk'
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

/**
 * Resolve every requested slug before writing anything, so a typo in one slug cannot
 * leave the user half-migrated to a new set of orgs.
 */
async function resolveOrgs(db: Kysely<DB>, orgs: QaOrgMembership[]) {
    return await Promise.all(
        orgs.map(async ({ slug, isAdmin = false }) => {
            const org = await db.selectFrom('org').select(['id']).where('slug', '=', slug).executeTakeFirst()
            if (!org) throw new QaCleanupNotFoundError(`organization with slug ${slug} not found`)
            return { orgId: org.id, slug, isAdmin }
        }),
    )
}

/**
 * Make the user's memberships exactly match `resolved`: drop every org not listed and
 * upsert the ones that are. org_user has no unique constraint on (org_id, user_id) —
 * the index in migration 1727379622503 was never awaited — so this selects before
 * inserting rather than relying on onConflict.
 */
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

/**
 * Store a PEM public key for the user, replacing any existing one. The fingerprint is
 * derived here rather than accepted from the caller — a mismatched one would make every
 * sender wrap to a key the owner cannot unwrap.
 */
async function applyPublicKey(db: Kysely<DB>, userId: string, pem: string) {
    let keyData: ArrayBuffer
    try {
        keyData = pemToArrayBuffer(pem)
    } catch {
        throw new QaInvalidRequestError('publicKey is not a valid PEM encoded key')
    }
    await assertValidPublicKey(keyData)

    const fingerprint = await fingerprintKeyData(keyData)
    const publicKey = Buffer.from(keyData)

    // user_public_key is unique on user_id (migration 1742320602314), so at most one row exists.
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

/**
 * Apply any combination of org memberships, public key, and password to an existing user.
 * Omitted fields are left untouched; `orgs: []` is meaningful and removes every membership.
 *
 * DB writes run in one transaction; Clerk calls follow the commit, mirroring qa-cleanup.
 */
export async function provisionQaUser(
    db: Kysely<DB>,
    idOrEmail: string,
    update: QaUserUpdate,
): Promise<QaProvisionResult> {
    const user = await findQaUser(db, idOrEmail)
    const resolvedOrgs = update.orgs ? await resolveOrgs(db, update.orgs) : null

    let fingerprint: string | null = null
    await withTransaction(db, async (trx) => {
        if (resolvedOrgs) {
            await applyOrgMemberships(trx, user.id, resolvedOrgs)
        }
        if (update.publicKey) {
            fingerprint = await applyPublicKey(trx, user.id, update.publicKey)
        }
    })

    // Authorization reads org membership and isAdmin from the Clerk JWT's publicMetadata,
    // not the DB, so a membership change is invisible until the metadata is rewritten.
    if (resolvedOrgs) {
        await updateClerkUserMetadata(user.id)
    }

    if (update.password) {
        const clerk = await clerkClient()
        // QA reuses short, well-known passwords across environments; Clerk would reject
        // them as weak or breached.
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

/**
 * Create a pending invite and return its URL. Follows orgAdminInviteUserAction — same
 * email normalization, same already-a-member rejection, same reuse of an outstanding
 * invite — with one deliberate difference: it does NOT fire onUserInvited, so no
 * invitation email is delivered and no audit row is written. QA wants the link, not
 * an inbox round-trip; do not "restore" that call.
 */
export async function createQaInvite(
    db: Kysely<DB>,
    { email, orgSlug, isAdmin = false }: QaInviteRequest,
    invitedByUserId: string | null,
): Promise<QaInviteResult> {
    // clerk normalizes the email to lowercase, do the same here to avoid case-insensitive matching issues
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
