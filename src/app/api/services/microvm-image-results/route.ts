import { z } from 'zod'
import { currentDb } from '@/server/request-context'
import { createWebhookHandler } from '../webhook-handler'

const schema = z.discriminatedUnion('status', [
    z.object({ url: z.string().min(1), status: z.literal('IMAGE-RUNNING') }),
    z.object({
        url: z.string().min(1),
        status: z.literal('IMAGE-READY'),
        layerHash: z.string().min(1),
        imageArn: z.string().min(1),
        imageVersion: z.string().min(1),
    }),
    z.object({
        url: z.string().min(1),
        status: z.literal('IMAGE-FAILED'),
        layerHash: z.string().optional(),
        // A code from iac's build job, never raw error text; see codebuild/scripts/microvm-image-lib.ts.
        error: z.string().max(200).optional(),
    }),
])

export const POST = createWebhookHandler({
    route: '/api/services/microvm-image-results',
    schema,
    entityNotFoundMessage: 'microvm-image-not-found',
    handler: async (body) => {
        const db = currentDb()
        const updatedAt = new Date()

        // Written, not looked up: the build job stops on a 4xx, and the row may not be visible yet
        // (the claim's transaction is still open) or may be gone (the reconcile deleted it).
        if (body.status === 'IMAGE-RUNNING') {
            await db
                .insertInto('microvmImage')
                .values({ url: body.url, status: 'IMAGE-RUNNING' })
                .onConflict((oc) => oc.column('url').doUpdateSet({ status: 'IMAGE-RUNNING', updatedAt }))
                .execute()
            return
        }

        if (body.status === 'IMAGE-READY') {
            const built = {
                status: 'IMAGE-READY' as const,
                imageArn: body.imageArn,
                imageVersion: body.imageVersion,
                layerHash: body.layerHash,
                attemptedLayerHash: body.layerHash,
                error: null,
            }
            await db
                .insertInto('microvmImage')
                .values({ url: body.url, ...built })
                .onConflict((oc) => oc.column('url').doUpdateSet({ ...built, updatedAt }))
                .execute()
            return
        }

        // The version that was built before stays, so launches continue on it.
        await db
            .insertInto('microvmImage')
            .values({
                url: body.url,
                status: 'IMAGE-FAILED',
                error: body.error ?? 'BUILD_ERROR',
                attemptedLayerHash: body.layerHash ?? null,
            })
            .onConflict((oc) =>
                oc.column('url').doUpdateSet((eb) => ({
                    status: 'IMAGE-FAILED',
                    // The buildspec's fallback repeats the failure without the code the script sent.
                    error: body.error ?? eb.fn.coalesce('microvmImage.error', eb.val('BUILD_ERROR')),
                    // So that the reconcile does not start this build again on the same layer.
                    ...(body.layerHash ? { attemptedLayerHash: body.layerHash } : {}),
                    updatedAt,
                })),
            )
            .execute()
    },
})
