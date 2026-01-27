import { wrapApiOrgAction } from '@/server/api-wrappers'
import { NextResponse } from 'next/server'
import { getOrgIdForJobId, getOrgPublicKeysRaw } from '@/server/db/queries'

export const GET = wrapApiOrgAction(async (_req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId

    const orgId = await getOrgIdForJobId(jobId)
    if (!orgId) {
        return NextResponse.json({ keys: [] }, { status: 200 })
    }

    const keys = await getOrgPublicKeysRaw(orgId)
    const results = keys.map((k) => ({
        jobId,
        publicKey: k.publicKey,
        fingerprint: k.fingerprint,
    }))

    if (!results) {
        return NextResponse.json(
            { status: 'fail', error: 'Failed to fetch public keys for organization' },
            { status: 404 },
        )
    }

    return NextResponse.json({ keys: results }, { status: 200 })
})
