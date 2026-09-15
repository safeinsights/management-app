import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/database'
import { requireQaAuth, requireAdminOfOrgs, orgSlugsForUser, deleteUserById, findQaUser } from '@/server/qa-cleanup'
import { provisionQaUser } from '@/server/qa-provision'
import { qaErrorResponse, qaRefusedResponse } from '../../responses'
import { auditQaOperation } from '../../audit'

// An omitted field is left untouched; `orgs: []` removes every membership.
const updateUserSchema = z.object({
    orgs: z.array(z.object({ slug: z.string().nonempty(), isAdmin: z.boolean().optional() })).optional(),
    publicKey: z.string().nonempty().optional(),
    password: z.string().nonempty().optional(),
})

export const DELETE = async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const auth = await requireQaAuth()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { userId } = await params
    try {
        // Resolved first so a 404/non-QA target is rejected before an attempt is audited.
        const target = await findQaUser(db, userId)
        const entry = {
            actorUserId: auth.user.id,
            eventType: 'DELETED',
            recordType: 'USER',
            recordId: target.id,
            metadata: { email: target.email },
        } as const

        // Deleting an account is not org-scoped, so an org admin must administer every org
        // the account touches — see orgSlugsForUser.
        const authorized = await requireAdminOfOrgs(db, auth, await orgSlugsForUser(db, target.id))
        if (!authorized.ok) {
            return await qaRefusedResponse(entry, authorized)
        }

        await auditQaOperation(entry, () => deleteUserById(db, userId))
    } catch (error) {
        return qaErrorResponse(error)
    }

    return NextResponse.json({ deleted: userId })
}

// The `userId` segment accepts a user id or a URL-encoded email address.
export const PATCH = async (req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const auth = await requireQaAuth()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { userId } = await params
    try {
        const update = updateUserSchema.parse(await req.json())
        // Resolved first so a bad body or a non-QA target never reaches the audit trail.
        const target = await findQaUser(db, userId)
        // Records which fields were requested, never the password itself.
        const entry = {
            actorUserId: auth.user.id,
            eventType: 'UPDATED',
            recordType: 'USER',
            recordId: target.id,
            metadata: {
                requested: {
                    orgs: update.orgs?.map((org) => org.slug),
                    publicKey: Boolean(update.publicKey),
                    password: Boolean(update.password),
                },
            },
        } as const

        // Both sides of the membership change are targets: the orgs the user touches now (a
        // PATCH can remove memberships, or reset the password of a researcher with studies
        // elsewhere) and the orgs the body asks for (it can add them, as an admin). Checking
        // only one side would let an org admin move an account, or grant itself admin over
        // one, in an org it does not administer.
        const authorized = await requireAdminOfOrgs(db, auth, [
            ...(await orgSlugsForUser(db, target.id)),
            ...(update.orgs?.map((org) => org.slug) ?? []),
        ])
        if (!authorized.ok) {
            return await qaRefusedResponse(entry, authorized)
        }

        const result = await auditQaOperation(
            entry,
            () => provisionQaUser(db, userId, update),
            (provisioned) => ({
                orgs: update.orgs ? provisioned.orgs : undefined,
                publicKeyFingerprint: provisioned.fingerprint ?? undefined,
                passwordSet: provisioned.passwordSet,
            }),
        )

        return NextResponse.json(result)
    } catch (error) {
        return qaErrorResponse(error)
    }
}
