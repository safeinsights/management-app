import { db } from '@/database'
import { wrapApiOrgAction } from '@/server/api-wrappers'
import { NextResponse } from 'next/server'

export const GET = wrapApiOrgAction(async (_req: Request, { params }: { params: Promise<{ jobId: string }> }) => {
    const jobId = (await params).jobId

    const results = await db
        .selectFrom('studyJob')
        .where('studyJob.id', '=', jobId)
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('orgUser', 'orgUser.orgId', 'study.orgId')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'orgUser.userId')
        .select(['studyJob.id as jobId', 'userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .execute()

    for (const result of results) {
        try {
            // Decode the public key
            const publicKey = await crypto.subtle.importKey(
                'spki',
                result.publicKey,
                {
                    name: 'RSA-OAEP',
                    hash: 'SHA-256',
                },
                false,
                ['encrypt'],
            )

            // Test encrypting with the job's key to make sure its valid
            await crypto.subtle.encrypt(
                {
                    name: 'RSA-OAEP',
                },
                publicKey,
                Buffer.from('hello'),
            )
        } catch (err) {
            throw new Error(`Invalid encryption key for ${result.jobId}: ${(err as Error).message}`)
        }
    }

    if (!results) {
        return NextResponse.json({ status: 'fail', error: 'Database query failed' }, { status: 404 })
    }

    return NextResponse.json({ keys: results }, { status: 200 })
})
