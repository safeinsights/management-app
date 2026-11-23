import { randomUUID } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { db } from '@/database'
import * as apiHandler from './route'

const TEST_SECRET = 'test-image-webhook-secret'
process.env.CODEBUILD_WEBHOOK_SECRET = TEST_SECRET

vi.mock('@/lib/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const newUrl = () => `example.com/r-base:${randomUUID()}`
const post = (body: object, token = TEST_SECRET) =>
    apiHandler.POST(
        new Request('http://localhost/api/services/microvm-image-results', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        }),
    )
const rowFor = (url: string) =>
    db.selectFrom('microvmImage').selectAll('microvmImage').where('url', '=', url).executeTakeFirstOrThrow()
const ready = (url: string, imageVersion = '1.0', layerHash = 'layer-1') => ({
    url,
    status: 'IMAGE-READY',
    layerHash,
    imageArn: 'arn:aws:lambda:us-east-1:123:microvm-image:ide-test-0123456789abcdef',
    imageVersion,
})

test('refuses a wrong token', async () => {
    const resp = await post({ url: newUrl(), status: 'IMAGE-RUNNING' }, 'wrong')
    expect(resp.status).toBe(401)
})

test('IMAGE-RUNNING marks the claimed row as running', async () => {
    const url = newUrl()
    await db.insertInto('microvmImage').values({ url, status: 'IMAGE-PENDING' }).execute()
    expect((await post({ url, status: 'IMAGE-RUNNING' })).status).toBe(200)
    expect((await rowFor(url)).status).toBe('IMAGE-RUNNING')
})

// The build script stops on a 4xx. The claim may not be committed yet, or the reconcile may have
// deleted the row, so an unknown url is written, not refused.
test('writes the row for a url it does not know', async () => {
    const url = newUrl()
    expect((await post({ url, status: 'IMAGE-RUNNING' })).status).toBe(200)
    expect((await rowFor(url)).status).toBe('IMAGE-RUNNING')
})

test('IMAGE-READY records the image, its version and the layer it was built on', async () => {
    const url = newUrl()
    await post({ url, status: 'IMAGE-RUNNING' })
    expect((await post(ready(url))).status).toBe(200)
    expect(await rowFor(url)).toMatchObject({
        status: 'IMAGE-READY',
        imageArn: 'arn:aws:lambda:us-east-1:123:microvm-image:ide-test-0123456789abcdef',
        imageVersion: '1.0',
        layerHash: 'layer-1',
        error: null,
    })
})

// A launch needs both, so a READY without them would mark an image usable that cannot be run.
test('refuses IMAGE-READY without an image version', async () => {
    const url = newUrl()
    const { imageVersion: _imageVersion, ...body } = ready(url)
    expect((await post(body)).status).toBe(400)
})

test('IMAGE-FAILED records the error code and keeps the version that still works', async () => {
    const url = newUrl()
    await post(ready(url, '3.0'))
    await post({ url, status: 'IMAGE-RUNNING' })
    await post({ url, status: 'IMAGE-FAILED', layerHash: 'layer-2', error: 'MICROVM_BUILD_FAILED: UPDATE_FAILED' })
    expect(await rowFor(url)).toMatchObject({
        status: 'IMAGE-FAILED',
        error: 'MICROVM_BUILD_FAILED: UPDATE_FAILED',
        imageVersion: '3.0',
        layerHash: 'layer-1',
    })
})

// The buildspec sends a bare IMAGE-FAILED after the script has sent one with the code.
test('a second IMAGE-FAILED without an error keeps the first code', async () => {
    const url = newUrl()
    await post({ url, status: 'IMAGE-FAILED', error: 'BASE_IMAGE_UNAVAILABLE' })
    await post({ url, status: 'IMAGE-FAILED' })
    expect((await rowFor(url)).error).toBe('BASE_IMAGE_UNAVAILABLE')
})

test('an IMAGE-FAILED with no code at all is recorded as a build error', async () => {
    const url = newUrl()
    await post({ url, status: 'IMAGE-FAILED' })
    expect((await rowFor(url)).error).toBe('BUILD_ERROR')
})

// A build whose row was lost (the save that claimed it rolled back) must not be started again by
// every reconcile pass once it has failed on this layer.
test('IMAGE-FAILED records the layer that was attempted', async () => {
    const url = newUrl()
    await post({ url, status: 'IMAGE-RUNNING' })
    await post({ url, status: 'IMAGE-FAILED', layerHash: 'layer-2', error: 'BUILD_ERROR' })
    expect((await rowFor(url)).attemptedLayerHash).toBe('layer-2')
})
