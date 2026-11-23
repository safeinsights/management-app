import { createHash } from 'node:crypto'
import type { DBExecutor } from '@/database'
import type { MicrovmImageStatus } from '@/database/types'
import logger from '@/lib/logger'
import { triggerMicrovmImageBuild } from '@/server/aws'
import { SIMULATE_CODE_BUILD } from '@/server/config'
import { getMicrovmConfig, type MicrovmConfig } from './config'

// iac's build job names the MicroVM image and the ECR tag with this, so it cannot change alone.
export const urlHash = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 16)

export const IN_PROGRESS_STATUSES: MicrovmImageStatus[] = ['IMAGE-PENDING', 'IMAGE-RUNNING']

/**
 * Takes the right to build a url's image on a layer. True means the caller must start the build.
 *
 * The row is the lock: one build for each url at a time, however many code environments name it.
 * A url already attempted on this layer is left alone, built or failed, unless the caller asks to
 * retry a failure. The usable version stays in the row, so launches continue during a rebuild.
 */
export async function claimImageBuild(
    db: DBExecutor,
    url: string,
    layerHash: string,
    opts: { retryFailed?: boolean } = {},
): Promise<boolean> {
    const inserted = await db
        .insertInto('microvmImage')
        .values({ url, status: 'IMAGE-PENDING', attemptedLayerHash: layerHash })
        .onConflict((oc) => oc.column('url').doNothing())
        .returning('id')
        .executeTakeFirst()
    if (inserted) return true

    const updated = await db
        .updateTable('microvmImage')
        .set({ status: 'IMAGE-PENDING', attemptedLayerHash: layerHash, error: null, updatedAt: new Date() })
        .where('url', '=', url)
        .where('status', 'not in', IN_PROGRESS_STATUSES)
        .where((eb) =>
            eb.or([
                eb('attemptedLayerHash', 'is distinct from', layerHash),
                ...(opts.retryFailed ? [eb('status', '=', 'IMAGE-FAILED' as const)] : []),
            ]),
        )
        .returning('id')
        .executeTakeFirst()
    return !!updated
}

/** Claims and starts a build. True when a build was started. */
export async function startImageBuild(
    db: DBExecutor,
    url: string,
    config: MicrovmConfig,
    opts: { retryFailed?: boolean } = {},
): Promise<boolean> {
    if (!(await claimImageBuild(db, url, config.layerHash, opts))) return false
    try {
        await triggerMicrovmImageBuild({
            url,
            urlHash: urlHash(url),
            layerHash: config.layerHash,
            layerSourceUri: config.layerSourceUri,
        })
        return true
    } catch (err) {
        logger.error('Failed to start a MicroVM image build', err, { url })
        // No job exists to report this, and clearing the attempt lets the reconcile start it again.
        await db
            .updateTable('microvmImage')
            .set({
                status: 'IMAGE-FAILED',
                error: 'BUILD_NOT_STARTED',
                attemptedLayerHash: null,
                updatedAt: new Date(),
            })
            .where('url', '=', url)
            .execute()
        return false
    }
}

/** Called when a code environment is saved with a new url. */
export async function requestImageBuild(db: DBExecutor, url: string): Promise<void> {
    if (SIMULATE_CODE_BUILD) {
        await db
            .insertInto('microvmImage')
            .values({
                url,
                status: 'IMAGE-READY',
                imageArn: `arn:aws:lambda:us-east-1:000000000000:microvm-image:simulated-${urlHash(url)}`,
                imageVersion: '1.0',
                layerHash: 'simulated',
                attemptedLayerHash: 'simulated',
            })
            .onConflict((oc) => oc.column('url').doNothing())
            .execute()
        return
    }
    const config = await getMicrovmConfig()
    if (!config) return
    await startImageBuild(db, url, config, { retryFailed: true })
}
