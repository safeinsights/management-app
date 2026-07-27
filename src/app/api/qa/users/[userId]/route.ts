import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/database'
import { requireQaAdmin, deleteUserById, findQaUser } from '@/server/qa-cleanup'
import { provisionQaUser } from '@/server/qa-provision'
import { qaErrorResponse } from '../../responses'
import { auditQaOperation } from '../../audit'

// Every field is optional; an omitted field is left untouched. `orgs: []` is meaningful —
// it removes every membership.
const updateUserSchema = z.object({
    orgs: z.array(z.object({ slug: z.string().nonempty(), isAdmin: z.boolean().optional() })).optional(),
    publicKey: z.string().nonempty().optional(),
    password: z.string().nonempty().optional(),
})

export const DELETE = async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { userId } = await params
    try {
        // Resolved first so the attempt can be audited against the real user id — and so a
        // 404/non-QA target is rejected before anything is written to the audit trail.
        const target = await findQaUser(db, userId)

        await auditQaOperation(
            {
                actorUserId: auth.user.id,
                eventType: 'DELETED',
                recordType: 'USER',
                recordId: target.id,
                metadata: { email: target.email },
            },
            () => deleteUserById(db, userId),
        )
    } catch (error) {
        return qaErrorResponse(error)
    }

    return NextResponse.json({ deleted: userId })
}

// The `userId` segment accepts a user id or a URL-encoded email address.
export const PATCH = async (req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { userId } = await params
    try {
        const update = updateUserSchema.parse(await req.json())
        // Resolved up front so a bad body or a non-QA target never reaches the audit trail,
        // and so the attempt row carries the real user id.
        const target = await findQaUser(db, userId)

        // Records which fields were requested, never the password itself. The success row
        // adds what actually landed.
        const result = await auditQaOperation(
            {
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
            },
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
