import { expect, test } from 'vitest'
import { buildTriggerMicrovmImageCommandInput } from './codebuild'

process.env.CODEBUILD_WEBHOOK_SECRET = 'test-secret'

test('an image build is given the url, its hash, the layer, and the payloads the webhook expects', async () => {
    const input = await buildTriggerMicrovmImageCommandInput({
        url: 'example.com/r-base:1',
        urlHash: '0123456789abcdef',
        layerHash: 'layer-1',
        layerSourceUri: 's3://assets/layer.zip',
    })
    const vars = Object.fromEntries(input.environmentVariablesOverride.map((v) => [v.name, v.value]))

    expect(input.projectName).toMatch(/^MgmntAppMicrovmImage-/)
    expect(vars).toMatchObject({
        WEBHOOK_ENDPOINT: '/api/services/microvm-image-results',
        DOCKER_IMAGE_URL: 'example.com/r-base:1',
        URL_HASH: '0123456789abcdef',
        LAYER_HASH: 'layer-1',
        LAYER_SOURCE_URI: 's3://assets/layer.zip',
    })
    expect(JSON.parse(vars.ON_START_PAYLOAD)).toEqual({ url: 'example.com/r-base:1', status: 'IMAGE-RUNNING' })
    expect(JSON.parse(vars.ON_SUCCESS_PAYLOAD)).toEqual({
        url: 'example.com/r-base:1',
        status: 'IMAGE-READY',
        layerHash: 'layer-1',
    })
    expect(JSON.parse(vars.ON_FAILURE_PAYLOAD)).toEqual({
        url: 'example.com/r-base:1',
        status: 'IMAGE-FAILED',
        layerHash: 'layer-1',
    })
})
