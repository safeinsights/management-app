import { beforeEach, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { getMicrovmConfig } from './config'

vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    CODER_DISABLED: false,
}))
vi.stubEnv('IDE_BACKEND', 'microvm')

const ssm = mockClient(SSMClient)

beforeEach(() => {
    ssm.reset()
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: JSON.stringify({ layerHash: 'layer-1' }) } })
})

// The launch path reads the settings on every request, so it keeps them.
it('reads the settings once for ordinary callers', async () => {
    await getMicrovmConfig({ fresh: true })
    ssm.resetHistory()
    await getMicrovmConfig()
    await getMicrovmConfig()
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(0)
})

// A deploy changes layerHash while this instance stays warm.
it('reads the settings again for a caller that asks for fresh ones, and keeps what it read', async () => {
    await getMicrovmConfig({ fresh: true })
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: JSON.stringify({ layerHash: 'layer-2' }) } })
    expect((await getMicrovmConfig({ fresh: true }))?.layerHash).toBe('layer-2')
    expect((await getMicrovmConfig())?.layerHash).toBe('layer-2')
})
