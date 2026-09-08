import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/database'
import { requireQaAdmin } from '@/server/qa-cleanup'
import { createQaInvite } from '@/server/qa-provision'
import { qaErrorResponse } from '../responses'
import { auditQaInvocation } from '../audit'

const createInviteSchema = z.object({
    email: z.string().nonempty().email(),
    orgSlug: z.string().nonempty(),
    isAdmin: z.boolean().optional(),
})

export const POST = async (req: Request) => {
    const auth = await requireQaAdmin()
    if (!auth.ok) {
        return NextResponse.json({ error: auth.message }, { status: auth.status })
    }

    try {
        const invite = createInviteSchema.parse(await req.json())
        const result = await createQaInvite(db, invite, auth.user.id)

        await auditQaInvocation({
            actorUserId: auth.user.id,
            eventType: 'INVITED',
            recordType: 'USER',
            recordId: result.inviteId,
            outcome: 'succeeded',
            metadata: { email: result.email, orgSlug: result.orgSlug, alreadyInvited: result.alreadyInvited },
        })

        return NextResponse.json(result, { status: result.alreadyInvited ? 200 : 201 })
    } catch (error) {
        return qaErrorResponse(error)
    }
}
