import { db } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { z } from 'zod'
import { createWebhookHandler } from '../webhook-handler'

const schema = z.object({
    codeEnvId: z.string(),
    status: z.enum(['SCAN-RUNNING', 'SCAN-COMPLETE', 'SCAN-FAILED']),
    plaintextLog: z.string().optional(),
})

export const POST = createWebhookHandler({
    route: '/api/services/code-env-scan-results',
    schema,
    entityNotFoundMessage: 'code-env-not-found',
    handler: async (body) => {
        await db
            .selectFrom('orgCodeEnv')
            .where('orgCodeEnv.id', '=', body.codeEnvId)
            .select('orgCodeEnv.id')
            .executeTakeFirstOrThrow(throwNotFound('code environment'))

        if (body.status === 'SCAN-RUNNING') {
            await db.insertInto('codeScan').values({ codeEnvId: body.codeEnvId, status: 'SCAN-RUNNING' }).execute()
            return
        }

        await db
            .updateTable('codeScan')
            .set({ status: body.status, results: body.plaintextLog ?? null })
            .where('codeEnvId', '=', body.codeEnvId)
            .where('status', '=', 'SCAN-RUNNING')
            .execute()
    },
})
