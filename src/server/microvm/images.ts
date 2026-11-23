import { createHash } from 'node:crypto'
import type { DBExecutor } from '@/database'
import type { MicrovmImageStatus } from '@/database/types'
import logger from '@/lib/logger'
import { ActionFailure } from '@/server/actions/action'
import { triggerMicrovmImageBuild } from '@/server/aws'
import { fetchCodeEnvForStudyId } from '@/server/db/queries'
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

/**
 * Called on every save of a code environment. It starts a build for a url that has no image, whose
 * image is on an older IDE layer, or whose last build failed: a save is the admin's way to retry.
 */
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
    let config: MicrovmConfig | null
    try {
        config = await getMicrovmConfig({ fresh: true })
    } catch (err) {
        // The save has already made the code environment's database and files; the reconcile builds
        // the image on its next pass.
        logger.error('Failed to read the MicroVM IDE settings for an image build', err, { url })
        return
    }
    if (!config) return
    await startImageBuild(db, url, config, { retryFailed: true })
}

export function imageNotReadyMessage(status: MicrovmImageStatus | undefined): string {
    if (status === 'IMAGE-FAILED') {
        return 'The run environment is not ready. Its build failed. Contact your organization administrator.'
    }
    return 'The run environment is not ready. It is being built. Try again in a few minutes.'
}

/**
 * The image a study's runner starts from: the one built for its code environment's url.
 * Throws an ActionFailure, whose text the IDE's terminal shows, if none is usable.
 */
export async function requireRunnerImage(
    studyId: string,
    db: DBExecutor,
): Promise<{ imageArn: string; imageVersion: string }> {
    const { url } = await fetchCodeEnvForStudyId(studyId, db)
    const image = await db
        .selectFrom('microvmImage')
        .select(['status', 'imageArn', 'imageVersion'])
        .where('url', '=', url)
        .executeTakeFirst()
    // The version, not the status: a rebuild in progress or failed leaves the last good version usable.
    if (!image?.imageArn || !image.imageVersion) throw new ActionFailure(imageNotReadyMessage(image?.status))
    return { imageArn: image.imageArn, imageVersion: image.imageVersion }
}
