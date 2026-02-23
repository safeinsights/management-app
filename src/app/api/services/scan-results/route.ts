import { db } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { z } from 'zod'
import { createWebhookHandler } from '../webhook-handler'

const schema = z.object({
    codeEnvId: z.string(),
    status: z.enum(['SCAN-RUNNING', 'SCAN-COMPLETE', 'SCAN-FAILED']),
    results: z.string().optional(),
})

export const POST = createWebhookHandler({
    route: '/api/services/scan-results',
    schema,
    entityNotFoundMessage: 'code-env-not-found',
    handler: async (body) => {
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
    },
})
