import { timingSafeEqual } from 'crypto'
import logger from '@/lib/logger'
import { NotFoundError } from '@/lib/errors'
import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { getConfigValue } from '@/server/config'

function secretsMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}

async function authenticateRequest(req: Request): Promise<boolean> {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const expectedSecret = await getConfigValue('CODEBUILD_WEBHOOK_SECRET', false)

    return !!token && !!expectedSecret && secretsMatch(token, expectedSecret)
}

interface WebhookHandlerOptions<T extends z.ZodTypeAny> {
    route: string
    schema: T
    entityNotFoundMessage: string
    handler: (body: z.infer<T>) => Promise<void>
}

export function createWebhookHandler<T extends z.ZodTypeAny>({
    route,
    schema,
    entityNotFoundMessage,
    handler,
}: WebhookHandlerOptions<T>) {
    return async function POST(req: Request) {
        if (!(await authenticateRequest(req))) {
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
        }

        let rawBody: unknown

        try {
            rawBody = await req.json()
            const body = schema.parse(rawBody)
            await handler(body)
            return new NextResponse('ok', { status: 200 })
        } catch (error) {
            if (error instanceof ZodError) {
                logger.error(`Error handling ${route} POST`, error, { route, body: rawBody ?? null })
                return NextResponse.json({ error: 'invalid-payload', issues: error.issues }, { status: 400 })
            }

            if (error instanceof NotFoundError) {
                logger.error(`Error handling ${route} POST`, error, { route, body: rawBody ?? null })
                return NextResponse.json({ error: entityNotFoundMessage }, { status: 404 })
            }

            logger.error(`Error handling ${route} POST`, error, { route, body: rawBody ?? null })
            return NextResponse.json({ error: 'internal-error' }, { status: 500 })
        }
    }
}
