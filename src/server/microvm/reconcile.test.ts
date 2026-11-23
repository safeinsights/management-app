import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr'
import { DeleteMicrovmImageCommand, LambdaMicrovmsClient } from '@aws-sdk/client-lambda-microvms'
import { db } from '@/database'
import { insertTestCodeEnv, insertTestStudyOnly } from '@/tests/unit.helpers'
import { triggerMicrovmImageBuild } from '@/server/aws'
import { getMicrovmConfig, type MicrovmConfig } from './config'
import { urlHash } from './images'
import { MAX_CONCURRENT_BUILDS, reconcileImages, urlsInUse } from './reconcile'

vi.mock('@/server/aws', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/aws')>()),
    triggerMicrovmImageBuild: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./config', () => ({ getMicrovmConfig: vi.fn(), isMicrovmBackend: () => true }))
vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    SIMULATE_CODE_BUILD: false,
}))

const ecr = mockClient(ECRClient)
const microvms = mockClient(LambdaMicrovmsClient)
const config = {
    layerHash: 'layer-2',
    layerSourceUri: 's3://assets/layer.zip',
    imageNamePrefix: 'ide-test-',
    baseRepositoryName: 'si/microvm-base-test',
} as MicrovmConfig
const frozenSnapshot = (url: string) => ({
    id: randomUUID(),
    language: 'R' as const,
    dataSourceType: null,
    url,
    settings: { environment: [] },
    commandLines: { r: 'Rscript %f' },
})
const newUrl = () => `example.com/r-base:${randomUUID()}`
const rowFor = (url: string) =>
    db.selectFrom('microvmImage').selectAll('microvmImage').where('url', '=', url).executeTakeFirst()
const startedUrls = () => vi.mocked(triggerMicrovmImageBuild).mock.calls.map(([info]) => info.url)

// The table is shared with other test files, and the reconcile reads all of it. Start each test
// with no rows and no code environments, so that only this test's urls are in use.
beforeEach(async () => {
    ecr.reset()
    microvms.reset()
    ecr.on(BatchDeleteImageCommand).resolves({})
    microvms.on(DeleteMicrovmImageCommand).resolves({})
    vi.mocked(triggerMicrovmImageBuild).mockClear()
    vi.mocked(getMicrovmConfig).mockResolvedValue(config)
    await db.deleteFrom('microvmImage').execute()
    await db.updateTable('study').set({ codeEnvSnapshot: null }).execute()
    await db.deleteFrom('orgDataSourceCodeEnv').execute()
    await db.deleteFrom('orgCodeEnv').execute()
})

const envWithUrl = async (url = newUrl()) => {
    const { org, study } = await insertTestStudyOnly()
    await insertTestCodeEnv({ orgId: org.id, language: 'R', url })
    return { url, study }
}

describe('urlsInUse', () => {
    it('has the url of every code environment once, however many name it', async () => {
        const { url } = await envWithUrl()
        await envWithUrl(url)
        expect(await urlsInUse(db)).toEqual([url])
    })

    // An admin changed the url, but a study that froze the old one still opens its IDE on it.
    it('has a url that only a study still holds', async () => {
        const { url: current, study } = await envWithUrl()
        const frozen = newUrl()
        await db
            .updateTable('study')
            .set({ codeEnvSnapshot: frozenSnapshot(frozen) })
            .where('id', '=', study.id)
            .execute()
        expect(await urlsInUse(db)).toEqual([current, frozen])
    })
})

describe('reconcileImages', () => {
    it('does nothing where the IDE is not on MicroVMs', async () => {
        vi.mocked(getMicrovmConfig).mockResolvedValue(null)
        await envWithUrl()
        expect(await reconcileImages(db)).toEqual({ timedOut: 0, started: 0, deleted: 0 })
        expect(triggerMicrovmImageBuild).not.toHaveBeenCalled()
    })

    // Two warm instances, one with the settings from before a layer deploy, would otherwise each
    // rebuild what the other built.
    it('reads the IDE settings fresh', async () => {
        await reconcileImages(db)
        expect(getMicrovmConfig).toHaveBeenCalledWith({ fresh: true })
    })

    it('builds a url in use that has no image', async () => {
        const { url } = await envWithUrl()
        expect((await reconcileImages(db)).started).toBe(1)
        expect(startedUrls()).toEqual([url])
    })

    // A deploy that changes the IDE layer changes the layer hash, and this is all that reacts to it.
    it('rebuilds an image built on an older layer, and leaves one built on this layer', async () => {
        const { url: old } = await envWithUrl()
        const { url: current } = await envWithUrl()
        await db
            .insertInto('microvmImage')
            .values([
                {
                    url: old,
                    status: 'IMAGE-READY',
                    imageVersion: '1.0',
                    layerHash: 'layer-1',
                    attemptedLayerHash: 'layer-1',
                },
                {
                    url: current,
                    status: 'IMAGE-READY',
                    imageVersion: '1.0',
                    layerHash: 'layer-2',
                    attemptedLayerHash: 'layer-2',
                },
            ])
            .execute()
        await reconcileImages(db)
        expect(startedUrls()).toEqual([old])
        expect(await rowFor(old)).toMatchObject({ status: 'IMAGE-PENDING', imageVersion: '1.0' })
    })

    it('does not start a build that already failed on this layer', async () => {
        const { url } = await envWithUrl()
        await db
            .insertInto('microvmImage')
            .values({ url, status: 'IMAGE-FAILED', error: 'BASE_IMAGE_UNAVAILABLE', attemptedLayerHash: 'layer-2' })
            .execute()
        await reconcileImages(db)
        expect(triggerMicrovmImageBuild).not.toHaveBeenCalled()
    })

    // The AWS quota for concurrent image builds is not published.
    it('keeps no more than the limit of builds in progress, counting those already running', async () => {
        const urls = []
        for (let i = 0; i < MAX_CONCURRENT_BUILDS + 2; i++) urls.push((await envWithUrl()).url)
        await db
            .insertInto('microvmImage')
            .values({ url: urls[0], status: 'IMAGE-RUNNING', attemptedLayerHash: 'layer-2' })
            .execute()
        expect((await reconcileImages(db)).started).toBe(MAX_CONCURRENT_BUILDS - 1)
    })

    // A build whose webhook was lost would otherwise hold its url's row, and a build slot, for ever.
    it('fails a build that has not reported for two hours, and keeps its usable version', async () => {
        const { url } = await envWithUrl()
        await db
            .insertInto('microvmImage')
            .values({
                url,
                status: 'IMAGE-RUNNING',
                imageVersion: '1.0',
                attemptedLayerHash: 'layer-2',
                updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
            })
            .execute()
        expect((await reconcileImages(db)).timedOut).toBe(1)
        expect(await rowFor(url)).toMatchObject({ status: 'IMAGE-FAILED', error: 'BUILD_TIMEOUT', imageVersion: '1.0' })
        expect(triggerMicrovmImageBuild).not.toHaveBeenCalled()
    })

    it('deletes the image, the copy of the org image and the row of a url nothing uses', async () => {
        const unused = newUrl()
        await db
            .insertInto('microvmImage')
            .values({ url: unused, status: 'IMAGE-READY', imageVersion: '1.0' })
            .execute()

        expect((await reconcileImages(db)).deleted).toBe(1)

        expect(microvms.commandCalls(DeleteMicrovmImageCommand)[0].args[0].input).toEqual({
            imageIdentifier: `ide-test-${urlHash(unused)}`,
        })
        expect(ecr.commandCalls(BatchDeleteImageCommand)[0].args[0].input).toEqual({
            repositoryName: 'si/microvm-base-test',
            imageIds: [{ imageTag: urlHash(unused) }],
        })
        expect(await rowFor(unused)).toBeUndefined()
    })

    it('keeps the image of a url that only a study still holds', async () => {
        const { study } = await envWithUrl()
        const frozen = newUrl()
        await db
            .updateTable('study')
            .set({ codeEnvSnapshot: frozenSnapshot(frozen) })
            .where('id', '=', study.id)
            .execute()
        await db
            .insertInto('microvmImage')
            .values({ url: frozen, status: 'IMAGE-READY', imageVersion: '1.0', attemptedLayerHash: 'layer-2' })
            .execute()

        expect((await reconcileImages(db)).deleted).toBe(0)
        expect(await rowFor(frozen)).toBeDefined()
    })

    // The row is the record that there is something to delete, so it stays for the next pass.
    it('keeps the row when the delete fails, and still handles the other urls', async () => {
        const unused = newUrl()
        await db
            .insertInto('microvmImage')
            .values({ url: unused, status: 'IMAGE-READY', imageVersion: '1.0' })
            .execute()
        const { url } = await envWithUrl()
        microvms.on(DeleteMicrovmImageCommand).rejects(new Error('in use'))

        const result = await reconcileImages(db)

        expect(result).toMatchObject({ deleted: 0, started: 1 })
        expect(await rowFor(unused)).toBeDefined()
        expect(startedUrls()).toEqual([url])
    })

    it('does not delete a url whose build is in progress', async () => {
        const unused = newUrl()
        await db.insertInto('microvmImage').values({ url: unused, status: 'IMAGE-RUNNING' }).execute()
        expect((await reconcileImages(db)).deleted).toBe(0)
    })
})
