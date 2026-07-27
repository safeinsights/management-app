import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/database'
import { requireQaAdmin, deleteUserById } from '@/server/qa-cleanup'
import { provisionQaUser } from '@/server/qa-provision'
import { qaErrorResponse } from '../../responses'
import { auditQaInvocation } from '../../audit'

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
    let deleted
    try {
        deleted = await deleteUserById(db, userId)
    } catch (error) {
        return qaErrorResponse(error)
    }

    // Audited after the fact: the user row is gone, so this records what was removed
    // against the admin who removed it.
    await auditQaInvocation({
        actorUserId: auth.user.id,
        eventType: 'DELETED',
        recordType: 'USER',
        recordId: deleted.id,
        metadata: { email: deleted.email },
    })

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
        const result = await provisionQaUser(db, userId, update)

        // Record which fields were touched, never the password itself.
        await auditQaInvocation({
            actorUserId: auth.user.id,
            eventType: 'UPDATED',
            recordType: 'USER',
            recordId: result.userId,
            metadata: {
                orgs: update.orgs ? result.orgs : undefined,
                publicKeyFingerprint: result.fingerprint ?? undefined,
                passwordSet: result.passwordSet,
            },
        })

        return NextResponse.json(result)
    } catch (error) {
        return qaErrorResponse(error)
    }
}
