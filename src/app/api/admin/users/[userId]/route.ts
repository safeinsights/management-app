import { NextResponse } from 'next/server'
import { db } from '@/database'
import { requireQaAdmin, findUser, deleteUserCompletely } from '@/server/qa-cleanup'
import { qaErrorResponse } from '@/app/api/qa/responses'
import { auditQaOperation } from '@/app/api/qa/audit'

/**
 * DELETE /api/admin/users/[userId] — permanently delete a REAL account.
 *
 * The sibling /api/qa/users/[userId] route does the same work but refuses any account
 * whose stored email is not "qa-" prefixed (assertQaEmail), which is what makes it safe
 * to expose in production. Offboarding and erasure requests need that same deletion
 * against genuine accounts, so this route exists separately rather than as a flag on the
 * QA one: a bypass switch on a production route is a thing someone eventually sets by
 * accident, whereas a second path has to be reached deliberately.
 *
 * The consequence is that SI-admin authentication is the ONLY thing guarding this route.
 * There is no undo — the DB rows, the S3 objects, and the Clerk account all go, and the
 * studies the account owns go with them.
 *
 * The `userId` segment accepts a user id or a URL-encoded email address.
 */
export const DELETE = async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    const { userId } = await params
    try {
        // Resolved first so the attempt is audited against the real user id, and so a 404
        // is answered before anything is written to the audit trail. findUser rather than
        // findQaUser: this route is deliberately not QA-restricted.
        const target = await findUser(db, userId)

        // Refusing self-deletion keeps the actor available to attribute the audit rows to,
        // and an admin cannot revoke their own access by accident mid-cleanup.
        if (target.id === auth.user.id) {
            return NextResponse.json({ error: 'cannot delete your own account' }, { status: 400 })
        }

        await auditQaOperation(
            {
                actorUserId: auth.user.id,
                eventType: 'DELETED',
                recordType: 'USER',
                recordId: target.id,
                via: 'admin-api',
                metadata: { email: target.email },
            },
            () => deleteUserCompletely(db, target),
        )
    } catch (error) {
        return qaErrorResponse(error)
    }

    return NextResponse.json({ deleted: userId })
}
