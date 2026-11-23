import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr'
import {
    DeleteMicrovmImageCommand,
    LambdaMicrovmsClient,
    ResourceNotFoundException,
} from '@aws-sdk/client-lambda-microvms'
import { sql } from 'kysely'
import type { DBExecutor } from '@/database'
import logger from '@/lib/logger'
import { getMicrovmConfig, type MicrovmConfig } from './config'
import { IN_PROGRESS_STATUSES, startImageBuild, urlHash } from './images'

// The AWS quota for concurrent MicroVM image builds is not published, so stay well inside any.
export const MAX_CONCURRENT_BUILDS = 3
// iac's build job gives up before this, so a build still in progress after it has lost its webhook.
export const STALE_BUILD_MS = 2 * 60 * 60 * 1000

/**
 * Every url an IDE can be launched on: each code environment's, then each one a study froze.
 * Code environments come first so that, when builds are rationed, new studies are served first.
 */
export async function urlsInUse(db: DBExecutor): Promise<string[]> {
    const current = await db.selectFrom('orgCodeEnv').select('url').distinct().orderBy('url').execute()
    const frozen = await db
        .selectFrom('study')
        .select(sql<string | null>`code_env_snapshot->>'url'`.as('url'))
        .where('codeEnvSnapshot', 'is not', null)
        .distinct()
        .orderBy('url')
        .execute()
    const urls = [...current, ...frozen].map((row) => row.url).filter((url): url is string => !!url)
    return [...new Set(urls)]
}

async function deleteImage(config: MicrovmConfig, url: string): Promise<void> {
    try {
        await new LambdaMicrovmsClient().send(
            new DeleteMicrovmImageCommand({ imageIdentifier: `${config.imageNamePrefix}${urlHash(url)}` }),
        )
    } catch (e) {
        if (!(e instanceof ResourceNotFoundException)) throw e
    }
    // A tag that is not there is reported in the response, not thrown.
    await new ECRClient().send(
        new BatchDeleteImageCommand({
            repositoryName: config.baseRepositoryName,
            imageIds: [{ imageTag: urlHash(url) }],
        }),
    )
}

/**
 * Brings the images in line with the urls in use and the current IDE layer. Called on a schedule
 * (iac's MicrovmImageReconcileSchedule); nothing else starts a rebuild after the layer changes.
 */
export async function reconcileImages(db: DBExecutor) {
    const result = { timedOut: 0, started: 0, deleted: 0 }
    const config = await getMicrovmConfig()
    if (!config) return result

    const stale = await db
        .updateTable('microvmImage')
        .set({ status: 'IMAGE-FAILED', error: 'BUILD_TIMEOUT', updatedAt: new Date() })
        .where('status', 'in', IN_PROGRESS_STATUSES)
        .where('updatedAt', '<', new Date(Date.now() - STALE_BUILD_MS))
        .returning('id')
        .execute()
    result.timedOut = stale.length

    const inUse = await urlsInUse(db)
    const rows = await db.selectFrom('microvmImage').select(['url', 'status', 'attemptedLayerHash']).execute()
    const byUrl = new Map(rows.map((row) => [row.url, row]))

    let inProgress = rows.filter((row) => IN_PROGRESS_STATUSES.includes(row.status)).length
    for (const url of inUse) {
        if (inProgress >= MAX_CONCURRENT_BUILDS) break
        const row = byUrl.get(url)
        if (row && (IN_PROGRESS_STATUSES.includes(row.status) || row.attemptedLayerHash === config.layerHash)) continue
        if (await startImageBuild(db, url, config)) {
            inProgress++
            result.started++
        }
    }

    const used = new Set(inUse)
    for (const row of rows) {
        if (used.has(row.url) || IN_PROGRESS_STATUSES.includes(row.status)) continue
        try {
            await deleteImage(config, row.url)
            await db.deleteFrom('microvmImage').where('url', '=', row.url).execute()
            result.deleted++
        } catch (err) {
            logger.error('Failed to delete an unused MicroVM image', err, { url: row.url })
        }
    }

    return result
}
