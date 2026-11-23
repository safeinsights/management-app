import { z } from 'zod'
import logger from '@/lib/logger'
import { reconcileImages } from '@/server/microvm/reconcile'
import { currentDb } from '@/server/request-context'
import { createWebhookHandler } from '../../webhook-handler'

export const POST = createWebhookHandler({
    route: '/api/services/microvm-images/reconcile',
    schema: z.object({}),
    entityNotFoundMessage: 'not-found',
    handler: async () => {
        const result = await reconcileImages(currentDb())
        if (result.timedOut || result.started || result.deleted) {
            logger.info('[microvm-images] reconcile', result)
        }
    },
})
