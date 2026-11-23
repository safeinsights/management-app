import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import { triggerMicrovmImageBuild } from '@/server/aws'
import { getMicrovmConfig, type MicrovmConfig } from './config'
import { insertTestCodeEnv, insertTestOrg, insertTestStudyOnly } from '@/tests/unit.helpers'
import {
    claimImageBuild,
    fetchIdeImageUrlForStudyId,
    imageNotReadyMessage,
    requestImageBuild,
    requireIdeImage,
    urlHash,
} from './images'

vi.mock('@/server/aws', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/aws')>()),
    triggerMicrovmImageBuild: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./config', () => ({ getMicrovmConfig: vi.fn(), isMicrovmBackend: () => true }))
vi.mock('@/lib/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    SIMULATE_CODE_BUILD: false,
}))

const config = { layerHash: 'layer-1', layerSourceUri: 's3://assets/layer.zip' } as MicrovmConfig
const newUrl = () => `example.com/r-base:${randomUUID()}`
const rowFor = (url: string) =>
    db.selectFrom('microvmImage').selectAll('microvmImage').where('url', '=', url).executeTakeFirstOrThrow()

beforeEach(() => {
    vi.mocked(triggerMicrovmImageBuild).mockClear()
    vi.mocked(getMicrovmConfig).mockResolvedValue(config)
})

describe('urlHash', () => {
    // iac's build job names the image and the ECR tag with this value, so it is a contract.
    it('is the first 16 hex characters of the SHA-256 of the url', () => {
        expect(urlHash('harbor.safeinsights.org/openstax/r-base:2025-05-15')).toBe('f3c76c4be76a1d88')
    })
})

describe('claimImageBuild', () => {
    it('claims a url that has no row', async () => {
        const url = newUrl()
        expect(await claimImageBuild(db, url, 'layer-1')).toBe(true)
        expect(await rowFor(url)).toMatchObject({ status: 'IMAGE-PENDING', attemptedLayerHash: 'layer-1' })
    })

    // Two code environments with one url, saved together, must give one build.
    it('refuses a second claim while a build is in progress', async () => {
        const url = newUrl()
        await claimImageBuild(db, url, 'layer-1')
        expect(await claimImageBuild(db, url, 'layer-1')).toBe(false)
        expect(await claimImageBuild(db, url, 'layer-2')).toBe(false)
    })

    it('refuses a url whose image is already built on this layer', async () => {
        const url = newUrl()
        await claimImageBuild(db, url, 'layer-1')
        await db
            .updateTable('microvmImage')
            .set({ status: 'IMAGE-READY', imageVersion: '1.0' })
            .where('url', '=', url)
            .execute()
        expect(await claimImageBuild(db, url, 'layer-1')).toBe(false)
    })

    it('claims a built url when the layer has changed, and keeps the usable version', async () => {
        const url = newUrl()
        await claimImageBuild(db, url, 'layer-1')
        await db
            .updateTable('microvmImage')
            .set({ status: 'IMAGE-READY', imageVersion: '1.0' })
            .where('url', '=', url)
            .execute()
        expect(await claimImageBuild(db, url, 'layer-2')).toBe(true)
        expect(await rowFor(url)).toMatchObject({
            status: 'IMAGE-PENDING',
            attemptedLayerHash: 'layer-2',
            imageVersion: '1.0',
        })
    })

    // The reconcile must not start the same failed build every 15 minutes, but an admin who saves
    // the url again after correcting the image in Harbor must get a new build.
    it('claims a build that failed on this layer only when asked to retry', async () => {
        const url = newUrl()
        await claimImageBuild(db, url, 'layer-1')
        await db
            .updateTable('microvmImage')
            .set({ status: 'IMAGE-FAILED', error: 'BASE_IMAGE_UNAVAILABLE' })
            .where('url', '=', url)
            .execute()
        expect(await claimImageBuild(db, url, 'layer-1')).toBe(false)
        expect(await claimImageBuild(db, url, 'layer-1', { retryFailed: true })).toBe(true)
        expect(await rowFor(url)).toMatchObject({ status: 'IMAGE-PENDING', error: null })
    })
})

describe('requestImageBuild', () => {
    it('starts one build for a new url, with the hash and the current layer', async () => {
        const url = newUrl()
        await requestImageBuild(db, url)
        await requestImageBuild(db, url)
        expect(triggerMicrovmImageBuild).toHaveBeenCalledTimes(1)
        expect(triggerMicrovmImageBuild).toHaveBeenCalledWith({
            url,
            urlHash: urlHash(url),
            layerHash: 'layer-1',
            layerSourceUri: 's3://assets/layer.zip',
        })
    })

    it('does nothing where the IDE is not on MicroVMs', async () => {
        vi.mocked(getMicrovmConfig).mockResolvedValue(null)
        const url = newUrl()
        await requestImageBuild(db, url)
        expect(triggerMicrovmImageBuild).not.toHaveBeenCalled()
        expect(
            await db.selectFrom('microvmImage').select('id').where('url', '=', url).executeTakeFirst(),
        ).toBeUndefined()
    })

    // The save has already made the code environment's database and files by now.
    it('does not fail the save when the IDE settings cannot be read', async () => {
        vi.mocked(getMicrovmConfig).mockRejectedValue(new Error('ssm unavailable'))
        await expect(requestImageBuild(db, newUrl())).resolves.toBeUndefined()
        expect(triggerMicrovmImageBuild).not.toHaveBeenCalled()
    })

    // A warm instance may hold the settings from before a deploy changed the IDE layer.
    it('reads the IDE settings fresh', async () => {
        await requestImageBuild(db, newUrl())
        expect(getMicrovmConfig).toHaveBeenCalledWith({ fresh: true })
    })

    // A build that never started has no job to report its failure, and the reconcile must try again.
    it('marks the row failed and open to a retry when the build cannot be started', async () => {
        vi.mocked(triggerMicrovmImageBuild).mockRejectedValueOnce(new Error('throttled'))
        const url = newUrl()
        await requestImageBuild(db, url)
        expect(await rowFor(url)).toMatchObject({
            status: 'IMAGE-FAILED',
            error: 'BUILD_NOT_STARTED',
            attemptedLayerHash: null,
        })
    })
})

describe('requireIdeImage', () => {
    // insertTestStudyOnly makes an R study with no frozen code environment, so the study takes the
    // org's newest non-testing R environment.
    const studyWithUrl = async () => {
        const { org, study } = await insertTestStudyOnly()
        const url = newUrl()
        await insertTestCodeEnv({ orgId: org.id, language: 'R', url })
        return { study, url }
    }

    it('gives the image and version built for the study url', async () => {
        const { study, url } = await studyWithUrl()
        await db
            .insertInto('microvmImage')
            .values({ url, status: 'IMAGE-READY', imageArn: 'arn:image', imageVersion: '2.0' })
            .execute()
        expect(await requireIdeImage(study.id, db)).toEqual({ imageArn: 'arn:image', imageVersion: '2.0' })
    })

    it('refuses to launch while the first build is in progress', async () => {
        const { study, url } = await studyWithUrl()
        await db.insertInto('microvmImage').values({ url, status: 'IMAGE-RUNNING' }).execute()
        await expect(requireIdeImage(study.id, db)).rejects.toThrow(imageNotReadyMessage('IMAGE-RUNNING'))
    })

    it('refuses to launch when no build was ever started', async () => {
        const { study } = await studyWithUrl()
        await expect(requireIdeImage(study.id, db)).rejects.toThrow(imageNotReadyMessage(undefined))
    })

    it('tells the researcher who can help when the only build failed', async () => {
        const { study, url } = await studyWithUrl()
        await db.insertInto('microvmImage').values({ url, status: 'IMAGE-FAILED', error: 'BUILD_ERROR' }).execute()
        await expect(requireIdeImage(study.id, db)).rejects.toThrow(/administrator/)
    })

    // A rebuild for a new IDE layer that fails, or that is still in progress, must not stop work.
    it('launches on the last good version when a rebuild failed or is in progress', async () => {
        const { study, url } = await studyWithUrl()
        await db
            .insertInto('microvmImage')
            .values({ url, status: 'IMAGE-FAILED', error: 'BUILD_ERROR', imageArn: 'arn:image', imageVersion: '3.0' })
            .execute()
        expect(await requireIdeImage(study.id, db)).toEqual({ imageArn: 'arn:image', imageVersion: '3.0' })

        await db.updateTable('microvmImage').set({ status: 'IMAGE-PENDING' }).where('url', '=', url).execute()
        expect(await requireIdeImage(study.id, db)).toEqual({ imageArn: 'arn:image', imageVersion: '3.0' })
    })
})

describe('fetchIdeImageUrlForStudyId', () => {
    // Every side of a fusion study runs in one VM, so it cannot boot from one partner's image.
    it('gives a fusion study the SafeInsights fusion code environment', async () => {
        const { study } = await insertTestStudyOnly()
        const si = await insertTestOrg({ slug: 'safe-insights' })
        const existing = await db
            .selectFrom('orgCodeEnv')
            .select('url')
            .where('orgId', '=', si.id)
            .where('identifier', '=', 'fusion')
            .executeTakeFirst()
        const url =
            existing?.url ?? (await insertTestCodeEnv({ orgId: si.id, identifier: 'fusion', url: newUrl() })).url

        expect(await fetchIdeImageUrlForStudyId(study.id, db, { fusion: true })).toBe(url)
    })
})
