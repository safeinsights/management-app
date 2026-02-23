import { timingSafeEqual } from 'crypto'
import { db } from '@/database'
import logger from '@/lib/logger'
import { NotFoundError, throwNotFound } from '@/lib/errors'
import { z, ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { getConfigValue } from '@/server/config'

const schema = z.object({
    codeEnvId: z.string(),
    status: z.enum(['SCAN-RUNNING', 'SCAN-COMPLETE', 'SCAN-FAILED']),
    results: z.string().optional(),
})

function secretsMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}

export async function POST(req: Request) {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const expectedSecret = await getConfigValue('CODEBUILD_WEBHOOK_SECRET', false)

    if (!token || !expectedSecret || !secretsMatch(token, expectedSecret)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    let rawBody: unknown

    try {
        rawBody = await req.json()
        const body = schema.parse(rawBody)

        await db
            .selectFrom('orgCodeEnv')
            .where('orgCodeEnv.id', '=', body.codeEnvId)
            .select('orgCodeEnv.id')
            .executeTakeFirstOrThrow(throwNotFound('code environment'))

        const last = await db
            .selectFrom('scan')
            .select(['status'])
            .where('codeEnvId', '=', body.codeEnvId)
            .orderBy('createdAt', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst()

        if (!last || last.status !== body.status) {
            await db
                .insertInto('scan')
                .values({
                    codeEnvId: body.codeEnvId,
                    status: body.status,
                    results: body.results ?? null,
                })
                .execute()
        }

        return new NextResponse('ok', { status: 200 })
    } catch (error) {
        if (error instanceof ZodError) {
            logger.error('Error handling /api/services/scan-results POST', error, {
                route: '/api/services/scan-results',
                body: rawBody ?? null,
            })

            return NextResponse.json(
                {
                    error: 'invalid-payload',
                    issues: error.issues,
                },
                { status: 400 },
            )
        }

        if (error instanceof NotFoundError) {
            logger.error('Error handling /api/services/scan-results POST', error, {
                route: '/api/services/scan-results',
                body: rawBody ?? null,
            })

            return NextResponse.json({ error: 'code-env-not-found' }, { status: 404 })
        }

        logger.error('Error handling /api/services/scan-results POST', error, {
            route: '/api/services/scan-results',
            body: rawBody ?? null,
        })

        return NextResponse.json({ error: 'internal-error' }, { status: 500 })
    }
}
